import { defineConfig } from 'vite';

const proxy = { '/api': 'http://127.0.0.1:8000' };

export default defineConfig({
  server: { port: 5173, strictPort: true, proxy },
  preview: { port: 4173, strictPort: true, proxy },
  // three.js is shared by the lazily loaded 3-D views (Cosmic Flame Lab, Flight Laboratory) and is never in the entry chunk.
  build: { chunkSizeWarningLimit: 720 },
});
