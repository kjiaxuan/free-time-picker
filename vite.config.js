import { defineConfig } from 'vite';

// The Bored API sends no CORS headers, so browsers block direct calls.
// Locally we proxy /api to it (used by the "Activities" toggle). A static
// host like GitHub Pages has no proxy, so Activities is disabled there.
const proxy = {
  '/api': {
    target: 'https://bored-api.appbrewery.com',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api/, ''),
  },
};

// Relative base so the build works from a GitHub Pages sub-path.
export default defineConfig({
  base: './',
  server: { port: 5173, proxy },
  preview: { port: 4173, proxy },
});
