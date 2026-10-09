// Brand sheet: renders docs/brand/index.html (all logo variants on light and dark surfaces) for the review board.
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { REPO } from '../snap.mjs';

const out = process.argv[2]; mkdirSync(out, { recursive: true });
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
await p.goto('file://' + path.join(REPO, 'docs/brand/index.html')); await p.waitForTimeout(600);
await p.screenshot({ path: path.join(out, 'F01-brand-variants.png'), fullPage: true });
await b.close();
writeFileSync(path.join(out, 'manifest.json'), JSON.stringify([{ file: 'F01-brand-variants.png', title: 'Logo variants', notes: 'Every variant derived from the supplied logo: full lockup, without tagline, mark, horizontal, monogram; reversed and one-colour versions (marked "derived" — they change colours and need client approval, Q-B3); app icons, favicons, splash. Files: packages/ui/src/assets/brand/, guide: docs/brand/README.md.', app: 'web', user: '', theme: 'light' }], null, 2));
