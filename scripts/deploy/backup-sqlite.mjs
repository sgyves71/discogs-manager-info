import { randomUUID } from 'node:crypto';
import { rmSync, linkSync } from 'node:fs';
import { backup, DatabaseSync } from 'node:sqlite';

const [sourcePath, destinationPath] = process.argv.slice(2);
const temporaryPath = `${destinationPath}.${randomUUID()}.partial`;

try {
  const source = new DatabaseSync(sourcePath, { readOnly: true });
  try {
    await backup(source, temporaryPath);
  } finally {
    source.close();
  }

  const snapshot = new DatabaseSync(temporaryPath, { readOnly: true });
  try {
    const results = snapshot.prepare('PRAGMA integrity_check').all();
    if (results.length !== 1 || results[0].integrity_check !== 'ok') {
      throw new Error('Backup failed SQLite integrity verification.');
    }
    snapshot.prepare('SELECT id FROM CdEntry LIMIT 1').all();
  } finally {
    snapshot.close();
  }

  // Publish the verified snapshot atomically and fail if the name already exists.
  linkSync(temporaryPath, destinationPath);
} finally {
  for (const suffix of ['', '-shm', '-wal', '-journal']) {
    rmSync(temporaryPath + suffix, { force: true });
  }
}
