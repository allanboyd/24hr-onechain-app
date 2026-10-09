// Screenshot helper shared by the mockup flows (tools/mockups/flows/*.mjs).
//   const s = await open({ app: 'web'|'field', user: 'u-dir', theme: 'light'|'dark', width, height, outDir });
//   await s.go('/plans/plan-2'); await shot(s, 'A10-web-plan-director-review', 'Title', 'Notes + requirement IDs');
//   await finish(s);   // closes the browser and merges entries into <outDir>/manifest.json
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const FIXTURES = path.join(REPO, 'tools/mockups/fixtures');
/** Import path of the API module through the Vite dev server (for flows that drive the mock directly). */
export const API_PATH = '/@fs' + REPO.replaceAll('\\', '/') + '/packages/api/src/index.ts';
const BASE = { web: process.env.WEB_URL ?? 'http://localhost:5173/', field: process.env.FIELD_URL ?? 'http://localhost:5174/' };

export async function open({ app, user, theme = 'light', width, height, outDir, reset = true }) {
  width ??= app === 'web' ? 1440 : 390; height ??= app === 'web' ? 900 : 844;
  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: app === 'field' ? 2 : 1, colorScheme: theme, isMobile: app === 'field', hasTouch: app === 'field', timezoneId: 'Africa/Nairobi', locale: 'en-GB' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(BASE[app]);
  await page.evaluate(({ u, theme, reset }) => { if (reset) localStorage.clear(); if (u) localStorage.setItem('btw-user', u); localStorage.setItem('btw-theme', theme); }, { u: user, theme, reset });
  await page.reload(); await page.waitForTimeout(400);
  const s = { app, user, theme, page, browser, outDir, errors, entries: [] };
  s.go = async (p, wait = 600) => { await page.evaluate((x) => (location.hash = x), p); await page.waitForTimeout(wait); };
  return s;
}

/** Full-page shots on the field app grow the viewport instead, so the fixed header and tab bar sit where a phone shows them. */
export async function shot(s, name, title, notes = '', { fullPage = true } = {}) {
  const file = `${name}.png`;
  if (fullPage && s.app === 'field') {
    const vp = s.page.viewportSize();
    const h = await s.page.evaluate(() => document.documentElement.scrollHeight);
    await s.page.setViewportSize({ width: vp.width, height: Math.min(Math.max(vp.height, h), 4000) }); await s.page.waitForTimeout(150);
    await s.page.screenshot({ path: path.join(s.outDir, file) });
    await s.page.setViewportSize(vp);
  } else {
    await s.page.screenshot({ path: path.join(s.outDir, file), fullPage });
  }
  s.entries.push({ file, title, notes, app: s.app, user: s.user, theme: s.theme });
}

export async function finish(s) {
  await s.browser.close();
  const mf = path.join(s.outDir, 'manifest.json');
  const prev = existsSync(mf) ? JSON.parse(readFileSync(mf, 'utf8')) : [];
  writeFileSync(mf, JSON.stringify([...prev.filter((p) => !s.entries.some((e) => e.file === p.file)), ...s.entries], null, 2));
  if (s.errors.length) { console.error(`console errors (${s.app}/${s.user}):`, s.errors); process.exitCode = 1; }
}
