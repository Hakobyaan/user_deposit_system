import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Everything under /api is proxied to wallet-service, so the browser only
// ever talks to one origin (downloads via plain <a href> work the same way).
const API_TARGET = process.env.API_TARGET ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target:       API_TARGET,
        changeOrigin: true,
        rewrite:      (p) => p.replace(/^\/api/, ''),
      },
    },
  },
});
