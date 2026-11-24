import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stageApiPort, stageDatabaseUrl, stageHost } from './stage-safety.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.includes('--watch')
  ? ['--watch', '--import', 'tsx', 'backend/src/index.ts']
  : ['backend/dist/index.js'];
const child = spawn(process.execPath, args, {
  cwd: root,
  env: {
    ...process.env,
    APP_ENV: 'stage',
    DATABASE_URL: stageDatabaseUrl,
    PORT: String(stageApiPort),
    HOST: stageHost,
    STAGE_DISCOGS_MODE: process.argv.includes('--live-read') ? 'live-read' : 'mock',
  },
  stdio: 'inherit',
});
child.on('exit', (code) => process.exitCode = code ?? 0);
