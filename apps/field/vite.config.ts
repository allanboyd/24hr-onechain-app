import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { btwApiAlias } from '@btw/api/vite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';

/** Build id shown in the app and baked into the bundle: BUILD_ID, else the git commit. Same code → same id → no update. */
const BUILD_ID = process.env.BUILD_ID ?? (() => { try { return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim(); } catch { return 'dev'; } })();

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
        // the app shell only: the install page (install.html) is its own entry and is not precached
        .filter((f) => (f.type === 'chunk' && f.isEntry && f.name !== 'install') || (f.type === 'asset' && f.fileName.endsWith('.css')))
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
  define: { __APP_BUILD__: JSON.stringify(BUILD_ID) },
  resolve: { alias: btwApiAlias(mode) }, // mock or http client, chosen at build time
  base: './',
  server: { port: 5174, host: true, allowedHosts: ['.ngrok-free.dev', '.ngrok-free.app', '.ngrok.app', '.ngrok.dev'], proxy: { '/v1': { target: process.env.API_URL ?? 'http://localhost:3101', changeOrigin: true } } },
  // two pages: the app (index.html) and the install page (install.html, QR + steps; docs/23 §6)
  build: { target: 'es2020', cssCodeSplit: false, rollupOptions: { input: { index: 'index.html', install: 'install.html' } } },
}));
