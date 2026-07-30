import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const prismaDirectory = path.join(root, 'backend', 'prisma');
const stageDatabasePath = path.join(prismaDirectory, 'stage.db');
const migrationsDirectory = path.join(prismaDirectory, 'migrations');

if (existsSync(stageDatabasePath)) {
  throw new Error(`Stage database already exists at ${stageDatabasePath}. A reset command will be added with Stage seed data.`);
}

const database = new DatabaseSync(stageDatabasePath);
try {
  database.exec(`CREATE TABLE "_prisma_migrations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "checksum" TEXT NOT NULL,
    "finished_at" DATETIME,
    "migration_name" TEXT NOT NULL,
    "logs" TEXT,
    "rolled_back_at" DATETIME,
    "started_at" DATETIME NOT NULL DEFAULT current_timestamp,
    "applied_steps_count" INTEGER UNSIGNED NOT NULL DEFAULT 0
  )`);

  const migrations = readdirSync(migrationsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const recordMigration = database.prepare(`INSERT INTO "_prisma_migrations"
    ("id", "checksum", "finished_at", "migration_name", "started_at", "applied_steps_count")
    VALUES (?, ?, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP, 1)`);

  for (const migrationName of migrations) {
    const migrationPath = path.join(migrationsDirectory, migrationName, 'migration.sql');
    const sql = readFileSync(migrationPath, 'utf8');
    database.exec('BEGIN');
    try {
      database.exec(sql);
      recordMigration.run(randomUUID(), createHash('sha256').update(sql).digest('hex'), migrationName);
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  }
} finally {
  database.close();
}

console.log(`Created isolated Stage database at ${stageDatabasePath}.`);
