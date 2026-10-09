import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { btwApiAlias } from '@btw/api/vite';

// In dev, /v1 is proxied to the API so the app and API share an origin (no CORS setup per port).
// Point the client at it with VITE_API=http VITE_API_URL=/v1.
const API = process.env.API_PROXY_TARGET ?? 'http://localhost:3101';

export default defineConfig(({ mode }) => ({
  plugins: [svelte()],
  resolve: { alias: btwApiAlias(mode) }, // mock or http client, chosen at build time
  server: { port: 5173, host: true, proxy: { '/v1': { target: API, changeOrigin: true } } },
  build: { target: 'es2022', cssCodeSplit: true },
}));
