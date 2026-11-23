import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { once } from 'node:events';
import { test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import express from 'express';
import { createMusicLibraryRouter } from '../../src/routes/music-library-router.js';
import { MusicLibraryScanService } from '../../src/services/music-library-scan-service.js';

function signal() {
  let release!: (value: boolean) => void;
  const ready = new Promise<boolean>((resolve) => { release = resolve; });
  return { ready, release };
}

test('scan API rejects overlaps, reopens admission, and removes stale rows only in the scanned library', { timeout: 10000 }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'discogs-scan-test-'));
  const databasePath = path.join(root, 'test.db');
  const prisma = new PrismaClient({ datasources: { db: { url: `file:${databasePath.replace(/\\/g, '/')}` } } });
  try {
    const db = new DatabaseSync(databasePath);
    try {
      const migrations = new URL('../../prisma/migrations/', import.meta.url);
      for (const migration of (await readdir(migrations, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()) {
        db.exec(await readFile(new URL(`${migration}/migration.sql`, migrations), 'utf8'));
      }
      db.prepare('INSERT INTO "MusicLibrary" (id, rootPath, updatedAt) VALUES (1, ?, CURRENT_TIMESTAMP), (2, ?, CURRENT_TIMESTAMP)')
        .run(root, path.join(root, 'other'));
      const insert = db.prepare(`
        INSERT INTO "MusicLibraryTrack" (
          libraryId, filePath, artist, album, title, normalizedArtist, normalizedAlbum, normalizedTitle, indexedAt
        ) VALUES (?, ?, 'Artist', 'Album', 'Track', 'artist', 'album', 'track', ?)
      `);
      insert.run(1, 'stale-text.mp3', '2020-01-01 00:00:00');
      insert.run(1, 'stale-integer.mp3', 1577836800000);
      insert.run(1, 'newer.mp3', Date.now() + 86400000);
      insert.run(2, 'other-library.mp3', '2020-01-01 00:00:00');
    } finally {
      db.close();
    }

    const validationEntered = signal();
    const validationResult = signal();
    const cleanupEntered = signal();
    const cleanupResult = signal();
    prisma.$use(async (params, next) => {
      if (params.action === 'executeRaw') {
        cleanupEntered.release(true);
        await cleanupResult.ready;
      }
      return next(params);
    });
    let validationCalls = 0;
    const scans = new MusicLibraryScanService(prisma, async () => {
      validationCalls += 1;
      if (validationCalls === 1) return false;
      if (validationCalls !== 2) return true;
      validationEntered.release(true);
      return validationResult.ready;
    });
    const app = express();
    app.use(createMusicLibraryRouter(prisma, undefined, scans));
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const base = `http://127.0.0.1:${address.port}/api/music-library`;
      const start = (endpoint = '/scan') => fetch(base + endpoint, { method: 'POST', signal: AbortSignal.timeout(5000) });
      const rejected = await start();
      assert.equal(rejected.status, 400);
      await rejected.json();
      const first = start();
      await Promise.race([validationEntered.ready, first.then(() => assert.fail('Scan bypassed validation'))]);
      try {
        const overlap = await start();
        assert.equal(overlap.status, 409);
        assert.deepEqual(await overlap.json(), { error: 'A music-library scan is already running.' });
        const catalog = await start('/catalog-personal-locations/scan');
        assert.equal(catalog.status, 409);
        await catalog.json();
        assert.equal(validationCalls, 2);
      } finally {
        validationResult.release(true);
        const accepted = await first;
        assert.equal(accepted.status, 202);
        assert.equal((await accepted.json()).scan.status, 'scanning');
      }
      await cleanupEntered.ready;
      const running = await start();
      assert.equal(running.status, 409);
      await running.json();
      cleanupResult.release(true);
      await waitForScan(base);
      const next = await start('/catalog-personal-locations/scan');
      assert.equal(next.status, 202);
      await next.json();
      await waitForScan(base);
    } finally {
      cleanupResult.release(true);
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
    const remaining = await prisma.musicLibraryTrack.findMany({
      select: { filePath: true }, orderBy: { filePath: 'asc' },
    });
    assert.deepEqual(remaining.map(({ filePath }) => filePath), ['newer.mp3', 'other-library.mp3']);
  } finally {
    await prisma.$disconnect();
    await rm(root, { recursive: true, force: true });
  }
});

async function waitForScan(base: string) {
  const deadline = Date.now() + 3000;
  do {
    const response = await fetch(base, { signal: AbortSignal.timeout(1000) });
    assert.equal(response.status, 200);
    const { scan, catalogLocationScan } = await response.json();
    if (scan.status !== 'scanning' && catalogLocationScan.status !== 'scanning') {
      assert.equal(scan.status, 'complete', scan.error);
      assert.equal(catalogLocationScan.status, 'complete', catalogLocationScan.error);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  } while (Date.now() < deadline);
  assert.fail('Scan did not finish before the deadline');
}
