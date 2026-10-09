// Builds the review gallery from mockups/shots/<KEY>/manifest.json → mockups/gallery/{index.html, shots/*.webp}.
// The same folder is what gets published as the shared review artifact.
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { REPO } from './snap.mjs';
import { FLOWS } from './flows.mjs';

export async function buildGallery() {
  const shotsDir = path.join(REPO, 'mockups/shots');
  const out = path.join(REPO, 'mockups/gallery');
  rmSync(path.join(out, 'shots'), { recursive: true, force: true });
  mkdirSync(path.join(out, 'shots'), { recursive: true });
  const data = [];
  for (const f of FLOWS) {
    const mf = path.join(shotsDir, f.key, 'manifest.json');
    const items = existsSync(mf) ? JSON.parse(readFileSync(mf, 'utf8')).sort((a, b) => a.file.localeCompare(b.file)) : [];
    const shots = [];
    for (const e of items) {
      const src = path.join(shotsDir, f.key, e.file);
      if (!existsSync(src)) continue;
      const id = e.file.replace(/\.png$/, '');
      const maxW = f.app === 'web' ? 1440 : 780;
      const img = sharp(src).resize({ width: maxW, withoutEnlargement: true });
      const { width: w, height: h } = await img.webp({ quality: 78 }).toFile(path.join(out, 'shots', `${id}.webp`));
      shots.push({ id, src: `shots/${id}.webp`, w, h, title: e.title ?? id, notes: e.notes ?? '', user: e.user ?? '', theme: e.theme ?? 'light' });
    }
    data.push({ key: f.key, app: f.app, title: f.title, blurb: f.blurb, shots });
  }
  const tpl = readFileSync(path.join(REPO, 'tools/mockups/gallery.template.html'), 'utf8');
  writeFileSync(path.join(out, 'index.html'), tpl.replace('/*DATA*/null', JSON.stringify(data)));
  return { out, count: data.reduce((a, s) => a + s.shots.length, 0) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { out, count } = await buildGallery();
  console.log(`Gallery: ${count} screens → ${path.join(out, 'index.html')}`);
}
