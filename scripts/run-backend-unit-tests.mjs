import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testRoot = path.join(root, 'backend', 'tests');

async function findTests(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return findTests(target);
      return entry.name.endsWith('.test.ts') ? [target] : [];
  }));
  return nested.flat();
}

const testFiles = await findTests(testRoot);
if (!testFiles.length) throw new Error('No backend unit tests were found.');

const runner = spawn(process.execPath, ['--import', 'tsx', '--test', ...testFiles], { cwd: root, stdio: 'inherit' });
runner.on('exit', (code) => { process.exitCode = code ?? 1; });
