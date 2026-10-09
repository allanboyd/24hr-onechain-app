import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { btwApiAlias } from '@btw/api/vite';

// Field app: separate, smaller build for drivers, loaders, receivers and directors-on-the-go.
// `base: './'` so the same dist/ works inside Capacitor (file://) and as a static PWA.
export default defineConfig(({ mode }) => ({
  plugins: [svelte()],
  resolve: { alias: btwApiAlias(mode) }, // mock or http client, chosen at build time
  base: './',
  server: { port: 5174, host: true, proxy: { '/v1': { target: process.env.API_URL ?? 'http://localhost:3101', changeOrigin: true } } },
  build: { target: 'es2020', cssCodeSplit: false },
}));
