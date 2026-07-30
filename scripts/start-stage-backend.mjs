import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const child = spawn(process.execPath, ['backend/dist/index.js'], {
  cwd: root,
  env: { ...process.env, APP_ENV: 'stage', DATABASE_URL: 'file:./stage.db', PORT: '3101' },
  stdio: 'inherit',
});
child.on('exit', (code) => process.exitCode = code ?? 0);
