import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    open: true,
    allowedHosts: ['.ngrok-free.dev', '.ngrok-free.app'],
    headers: {
      'Cross-Origin-Embedder-Policy': 'credentialless',
      'Cache-Control': 'no-store, max-age=0',
    },
  },
});
