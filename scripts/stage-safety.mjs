import { lstatSync, realpathSync } from 'node:fs';
import path from 'node:path';

export const stageHost = '127.0.0.1';
export const stageApiPort = 3101;
export const stageDatabaseUrl = 'file:./stage.db';

function samePath(left, right) {
  return process.platform === 'win32'
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}

export function stageDatabasePath(root, url = stageDatabaseUrl) {
  if (url !== stageDatabaseUrl) {
    throw new Error('Stage requires DATABASE_URL=file:./stage.db.');
  }
  const directory = path.resolve(root, 'backend', 'prisma');
  if (/[?#%]/u.test(directory) || !samePath(realpathSync.native(directory), directory)) {
    throw new Error('Stage requires a canonical Prisma directory.');
  }
  const database = path.join(directory, 'stage.db');
  const suffixes = ['', '-journal', '-shm', '-wal'];
  const personalTargets = suffixes.flatMap((suffix) => {
    const candidate = path.join(directory, 'dev.db' + suffix);
    if (!lstatSync(candidate, { throwIfNoEntry: false })) return [];
    try {
      return [realpathSync.native(candidate)];
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      // A dangling personal alias can become active when Stage creates its target.
      throw new Error('Stage cannot verify the personal database alias.');
    }
  });
  for (const suffix of suffixes) {
    const candidate = database + suffix;
    const info = lstatSync(candidate, { throwIfNoEntry: false });
    if (personalTargets.some((target) => samePath(target, candidate)) ||
      (info && (!info.isFile() || info.nlink !== 1 ||
        !samePath(realpathSync.native(candidate), candidate)))) {
      throw new Error('Stage database and sidecars must be regular, unaliased files.');
    }
  }
  return database;
}

export function stageBackendConfig(root, env) {
  if (env.APP_ENV !== 'stage' || env.DATABASE_URL !== stageDatabaseUrl ||
    env.PORT !== String(stageApiPort) || env.HOST !== stageHost) {
    throw new Error('Invalid effective Stage configuration. Use the Stage launcher and check Stage overrides.');
  }
  return { host: stageHost, port: stageApiPort, database: stageDatabasePath(root, env.DATABASE_URL) };
}
