import assert from 'node:assert/strict';
import { linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { stageBackendConfig, stageDatabasePath } from '../stage-safety.mjs';

const environment = { APP_ENV: 'stage', DATABASE_URL: 'file:./stage.db', HOST: '127.0.0.1', PORT: '3101' };

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'discogs-stage-guard-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const directory = path.join(root, 'backend', 'prisma');
  mkdirSync(directory, { recursive: true });
  const personal = path.join(directory, 'dev.db');
  writeFileSync(personal, 'synthetic personal database sentinel');
  return { root, directory, personal };
}

test('requires the effective Stage mode, database URL, host, and port', (t) => {
  const { root, directory } = fixture(t);
  assert.equal(stageBackendConfig(root, environment).database, path.join(directory, 'stage.db'));
  for (const override of [
    { DATABASE_URL: undefined }, { DATABASE_URL: 'file:./dev.db' },
    { DATABASE_URL: 'file:./stage.db?mode=rw' }, { APP_ENV: 'production' },
    { HOST: '0.0.0.0' }, { PORT: '3100' },
  ]) {
    assert.throws(() => stageBackendConfig(root, { ...environment, ...override }), /effective Stage configuration/);
  }
});

test('rejects hard-linked database and sidecar files before accessing their contents', (t) => {
  const { root, directory, personal } = fixture(t);
  for (const name of ['stage.db', 'stage.db-wal']) {
    const alias = path.join(directory, name);
    linkSync(personal, alias);
    assert.throws(() => stageDatabasePath(root), /unaliased files/);
    rmSync(alias);
  }
  assert.equal(readFileSync(personal, 'utf8'), 'synthetic personal database sentinel');
});

test('rejects a redirected Prisma directory', (t) => {
  const { root, directory } = fixture(t);
  const alias = path.join(root, 'alias', 'backend');
  mkdirSync(alias, { recursive: true });
  symlinkSync(directory, path.join(alias, 'prisma'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => stageDatabasePath(path.join(root, 'alias')), /canonical Prisma directory/);
});

test('rejects a personal symlink pointing at the Stage database', (t) => {
  const { root, directory, personal } = fixture(t);
  const stage = path.join(directory, 'stage.db');
  writeFileSync(stage, 'synthetic Stage sentinel');
  rmSync(personal);
  try {
    symlinkSync(stage, personal, 'file');
  } catch (error) {
    if (process.platform !== 'win32' || error.code !== 'EPERM') throw error;
    t.skip('Windows file symlinks require Developer Mode or the symlink privilege.');
    return;
  }
  assert.throws(() => stageDatabasePath(root), /unaliased files/);
});
