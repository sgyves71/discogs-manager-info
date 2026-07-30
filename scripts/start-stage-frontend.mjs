import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const child = spawn('cmd.exe', ['/c', 'npm.cmd', 'run', 'dev', '--workspace', 'frontend', '--', '--port', '5174'], {
  cwd: root,
  env: { ...process.env, VITE_PORT: '5174', VITE_API_PROXY_TARGET: 'http://localhost:3101' },
  stdio: 'inherit',
});
child.on('exit', (code) => process.exitCode = code ?? 0);
