import { defineConfig, type Plugin } from 'vite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { btwApiAlias } from '@btw/api/vite';

/** Installable office app (docs/23 §6): emits dist/sw.js from sw.template.js with the app shell to precache. Same pattern
 *  as the phone app's worker; no extra dependency. */
function pwa(): Plugin {
  return {
    name: 'btw-office-sw',
    apply: 'build',
    enforce: 'post',
    generateBundle(_opts, bundle) {
      const shell = Object.values(bundle)
        .filter((f) => (f.type === 'chunk' && f.isEntry) || (f.type === 'asset' && f.fileName.endsWith('.css') && f.fileName.startsWith('assets/index')))
        .map((f) => '/' + f.fileName);
      const precache = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', ...shell];
      const version = createHash('sha1').update(shell.join('|')).digest('hex').slice(0, 10);
      const src = readFileSync(new URL('./sw.template.js', import.meta.url), 'utf8')
        .replace('__VERSION__', version)
        .replace('__PRECACHE__', JSON.stringify(precache));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: src });
    },
  };
}

// In dev, /v1 is proxied to the API so the app and API share an origin (no CORS setup per port).
// Point the client at it with VITE_API=http VITE_API_URL=/v1.
const API = process.env.API_PROXY_TARGET ?? 'http://localhost:3101';

export default defineConfig(({ mode }) => ({
  plugins: [svelte(), pwa()],
  resolve: { alias: btwApiAlias(mode) }, // mock or http client, chosen at build time
  server: { port: 5173, host: true, allowedHosts: ['.ngrok-free.dev', '.ngrok-free.app', '.ngrok.app', '.ngrok.dev'], proxy: { '/v1': { target: API, changeOrigin: true } } },
  build: { target: 'es2022', cssCodeSplit: true },
}));
