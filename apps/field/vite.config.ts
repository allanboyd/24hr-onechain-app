import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { btwApiAlias } from '@btw/api/vite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

/** Installable PWA: emits dist/sw.js from sw.template.js with the app shell (index.html + entry JS/CSS + icons)
 *  to precache. Everything is relative, so the same dist/ works at /, under /app/ and inside Capacitor (where the
 *  app never registers the worker). No extra dependency. */
function pwa(): Plugin {
  return {
    name: 'btw-pwa-sw',
    apply: 'build',
    enforce: 'post',
    generateBundle(_opts, bundle) {
      const shell = Object.values(bundle)
        .filter((f) => (f.type === 'chunk' && f.isEntry) || (f.type === 'asset' && f.fileName.endsWith('.css')))
        .map((f) => f.fileName);
      const precache = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', ...shell];
      const version = createHash('sha1').update(shell.join('|')).digest('hex').slice(0, 10);
      const src = readFileSync(new URL('./sw.template.js', import.meta.url), 'utf8')
        .replace('__VERSION__', version)
        .replace('__PRECACHE__', JSON.stringify(precache));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: src });
    },
  };
}

// Field app: separate, smaller build for drivers, loaders, receivers — and the office team's PWA (src/team/).
// `base: './'` so the same dist/ works inside Capacitor (file://), as a static PWA and under /app/ on the API server.
export default defineConfig(({ mode }) => ({
  plugins: [svelte(), pwa()],
  resolve: { alias: btwApiAlias(mode) }, // mock or http client, chosen at build time
  base: './',
  server: { port: 5174, host: true, allowedHosts: ['.ngrok-free.dev', '.ngrok-free.app', '.ngrok.app', '.ngrok.dev'], proxy: { '/v1': { target: process.env.API_URL ?? 'http://localhost:3101', changeOrigin: true } } },
  build: { target: 'es2020', cssCodeSplit: false },
}));
