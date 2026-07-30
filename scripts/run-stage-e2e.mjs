import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const child = spawn('cmd.exe', ['/c', 'npm.cmd', 'run', 'test', '--workspace', 'e2e'], {
  cwd: root,
  env: { ...process.env, E2E_APP_URL: 'https://localhost:5174', E2E_API_URL: 'http://localhost:3101' },
  stdio: 'inherit',
});
child.on('exit', (code) => process.exitCode = code ?? 0);
