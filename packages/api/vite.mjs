// Compile-time client choice for Vite apps: `@btw/api/client` resolves to the mock (default) or, with
// VITE_API=http (env var or the app's .env / .env.[mode] files), to the HTTP client — only one is bundled.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function envValue(key, mode, root) {
  if (process.env[key] !== undefined) return process.env[key];
  let v;
  for (const f of ['.env', '.env.local', `.env.${mode}`, `.env.${mode}.local`]) {
    const p = path.join(root, f);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(new RegExp(`^\\s*${key}\\s*=\\s*"?([^"#\\s]*)`));
      if (m) v = m[1];
    }
  }
  return v;
}

export function btwApiAlias(mode, root = process.cwd()) {
  const file = envValue('VITE_API', mode, root) === 'http' ? './src/http.ts' : './src/mock-client.ts';
  return [{ find: /^@btw\/api\/client$/, replacement: fileURLToPath(new URL(file, import.meta.url)) }];
}
