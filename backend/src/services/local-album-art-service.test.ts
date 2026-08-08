import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { LocalAlbumArtService } from './local-album-art-service.js';

test('LocalAlbumArtService prefers conventional folder artwork and returns its MIME type', async () => {
  const folderPath = await mkdtemp(path.join(os.tmpdir(), 'discogs-manager-art-'));
  try {
    await writeFile(path.join(folderPath, 'front.png'), Buffer.from('front'));
    await writeFile(path.join(folderPath, 'Folder.jpg'), Buffer.from('folder'));

    const art = await new LocalAlbumArtService().find(folderPath, []);

    assert.equal(art?.mimeType, 'image/jpeg');
    assert.equal(art?.data.toString(), 'folder');
  } finally {
    await rm(folderPath, { recursive: true, force: true });
  }
});

test('LocalAlbumArtService safely reports no artwork for a missing folder', async () => {
  const art = await new LocalAlbumArtService().find(path.join(os.tmpdir(), `missing-album-${Date.now()}`), []);
  assert.equal(art, null);
});
