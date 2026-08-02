import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stageDatabasePath = path.join(root, 'backend', 'prisma', 'stage.db');
const musicRoot = path.join(root, 'e2e', 'fixtures', 'music');
const albumFolder = path.join(musicRoot, 'Stage Artist', 'Stage Album');

if (!existsSync(stageDatabasePath)) {
  throw new Error('The Stage database does not exist. Run npm run stage:db:create first.');
}

const database = new DatabaseSync(stageDatabasePath);
try {
  database.exec('BEGIN');
  const insertCd = database.prepare(`INSERT INTO "CdEntry" (
    "title", "artist", "artistSortName", "year", "country", "label", "format", "genre", "style",
    "discogsId", "discogsUri", "catalogNumber", "barcode", "mediaCondition", "estimatedValue", "notes",
    "createdAt"
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`);
  insertCd.run(
    'Stage Album', 'Stage Artist', 'Stage Artist', 2001, 'US', 'Stage Records', 'CD, Album', 'Rock', 'Hard Rock',
    900001, 'https://www.discogs.com/release/900001', 'STAGE-001', '000000000001', 'Very Good Plus (VG+)', 15,
    'Synthetic Stage fixture. Safe to reset.'
  );
  const nextAlbum = insertCd.run(
    'Zeta Album', 'Stage Artist', 'Stage Artist', 2002, 'US', 'Stage Records', 'CD, Album', 'Rock', 'Hard Rock',
    900002, 'https://www.discogs.com/release/900002', 'STAGE-002', '000000000002', 'Very Good Plus (VG+)', 15,
    'Synthetic next-playback fixture. Safe to reset.'
  );
  const library = database.prepare(`INSERT INTO "MusicLibrary" ("rootPath", "lastScannedAt", "createdAt", "updatedAt")
    VALUES (?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`).run(musicRoot);
  const libraryId = Number(library.lastInsertRowid);
  const insertTrack = database.prepare(`INSERT INTO "MusicLibraryTrack" (
    "libraryId", "filePath", "artist", "album", "title", "trackNumber", "normalizedArtist", "normalizedAlbum", "normalizedTitle", "indexedAt"
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`);
  insertTrack.run(libraryId, path.join(albumFolder, '01 - Stage Song One.mp3'), 'Stage Artist', 'Stage Album', 'Stage Song One', 1, 'stage artist', 'stage album', 'stage song one');
  insertTrack.run(libraryId, path.join(albumFolder, '02 - Stage Song Two.mp3'), 'Stage Artist', 'Stage Album', 'Stage Song Two', 2, 'stage artist', 'stage album', 'stage song two');
  const zetaTrack = insertTrack.run(libraryId, path.join(musicRoot, 'Stage Artist', 'Zeta Album', '01 - Zeta Song.mp3'), 'Stage Artist', 'Zeta Album', 'Zeta Song', 1, 'stage artist', 'zeta album', 'zeta song');
  database.prepare(`INSERT INTO "PersonalTrackMatch" ("cdEntryId", "trackKey", "libraryTrackId", "matchedAt") VALUES (?, ?, ?, CURRENT_TIMESTAMP)`)
    .run(Number(nextAlbum.lastInsertRowid), '1|Zeta Song', Number(zetaTrack.lastInsertRowid));
  database.exec('COMMIT');
} catch (error) {
  database.exec('ROLLBACK');
  throw error;
} finally {
  database.close();
}

console.log('Seeded the isolated Stage database with synthetic catalog and music-library data.');
