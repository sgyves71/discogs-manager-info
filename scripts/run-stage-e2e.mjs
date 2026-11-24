import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const protocol = ['lan-cert.pem', 'lan-key.pem'].every(
  (name) => existsSync(path.join(root, 'frontend', 'certs', name)),
) ? 'https' : 'http';
const filters = {
  '--demo-one': ['stage-demo-one.spec.ts'],
  '--demo-two': ['stage-demo-two.spec.ts'],
  '--ui-smoke': ['navigation.spec.ts'],
  '--api-smoke': ['catalog-api.spec.ts'],
};
const args = filters[process.argv[2]] ?? ['--grep-invert', '@demo-'];
const child = spawn('cmd.exe', ['/c', 'npm.cmd', 'run', 'test', '--workspace', 'e2e', '--', ...args], {
  cwd: root,
  env: { ...process.env, E2E_APP_URL: `${protocol}://127.0.0.1:5174`, E2E_API_URL: 'http://127.0.0.1:3101', E2E_STAGE: 'true' },
  stdio: 'inherit',
});
child.on('exit', (code) => process.exitCode = code ?? 1);
