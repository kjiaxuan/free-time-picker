import { defineConfig } from 'vite';

// The Bored API sends no CORS headers, so browsers block direct calls.
// In dev (and `vite preview`) we proxy /api to it; app code stays frontend-only.
const proxy = {
  '/api': {
    target: 'https://bored-api.appbrewery.com',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api/, ''),
  },
};

export default defineConfig({
  server: { port: 5173, proxy },
  preview: { port: 4173, proxy },
});
