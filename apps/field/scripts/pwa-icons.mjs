// PWA icons for the field app (installable "BTW Team"), generated from the brand app icon.
//   node apps/field/scripts/pwa-icons.mjs   (run from the repo root; uses the root `sharp` dev dependency)
// Output: apps/field/public/icons/{icon-192,icon-512,maskable-512,apple-touch-icon}.png — committed, so builds need no sharp.
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = new URL('../../../', import.meta.url).pathname;
const SRC = path.join(ROOT, 'packages/ui/src/assets/brand/app-icon-navy-1024.png');
const OUT = path.join(ROOT, 'apps/field/public/icons');
mkdirSync(OUT, { recursive: true });

// Background colour = the icon's own corner pixel, so the maskable padding blends in.
const { data } = await sharp(SRC).extract({ left: 4, top: 4, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
const bg = { r: data[0], g: data[1], b: data[2], alpha: 1 };
console.log('background', '#' + [data[0], data[1], data[2]].map((v) => v.toString(16).padStart(2, '0')).join(''));

await sharp(SRC).resize(192, 192).png().toFile(path.join(OUT, 'icon-192.png'));
await sharp(SRC).resize(512, 512).png().toFile(path.join(OUT, 'icon-512.png'));
await sharp(SRC).resize(180, 180).png().toFile(path.join(OUT, 'apple-touch-icon.png'));
// Maskable: artwork scaled to 76% inside the 80% safe circle, padded with the icon background.
const inner = await sharp(SRC).resize(390, 390).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: bg } }).composite([{ input: inner, gravity: 'center' }]).png().toFile(path.join(OUT, 'maskable-512.png'));
console.log('icons →', OUT);
