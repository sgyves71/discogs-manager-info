import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const certificateDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'certs');
const certificatePath = path.join(certificateDirectory, 'lan-cert.pem');
const keyPath = path.join(certificateDirectory, 'lan-key.pem');

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: Number(process.env.VITE_PORT || 5173),
    https: fs.existsSync(certificatePath) && fs.existsSync(keyPath)
      ? { cert: fs.readFileSync(certificatePath), key: fs.readFileSync(keyPath) }
      : undefined,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:3100',
        changeOrigin: true,
      },
    },
  },
});
