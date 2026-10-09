// pnpm e2e  — end-to-end user journeys across web + field + API on an isolated single-point instance.
//   E2E_SKIP_BUILD=1 reuses the current builds · E2E_ONLY=guards,brand runs a subset · E2E_KEEP=1 leaves the server up.
// Output: tests/e2e/out/report.{md,html} + screenshots.
import { rmSync } from 'node:fs';
import path from 'node:path';
import { OUT, startInstance, stopInstance, launch, closeBrowser, writeReport } from './lib.mjs';
import * as J from './journeys.mjs';

const only = process.env.E2E_ONLY?.split(',');
const ORDER = [
  ['guards', J.roleGuards],
  ['onboarding', J.onboarding],
  ['chain', J.fullChain],
  ['transfer', J.transferLeg],
  ['layout', J.layoutSweep],
  ['brand', J.brand],
];
const t0 = Date.now();
rmSync(path.join(OUT, 'shots'), { recursive: true, force: true });
process.on('exit', stopInstance);
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => process.exit(130));

let failedToRun = null;
try {
  await startInstance();
  await launch();
  const ctx = {};
  for (const [key, fn] of ORDER) if (!only || only.includes(key)) await fn(ctx);
} catch (e) { failedToRun = e; console.error('✗ run aborted:', e); }
finally { await closeBrowser().catch(() => {}); }

const { ok, total } = writeReport({ duration: `${Math.round((Date.now() - t0) / 1000)} s` });
console.log(`\n${ok}/${total} steps passed · report: ${path.join(OUT, 'report.html')}`);
if (process.env.E2E_KEEP === '1') { console.log('E2E_KEEP=1 → server stays up; Ctrl+C to stop'); await new Promise(() => {}); }
process.exit(failedToRun || ok !== total ? 1 : 0);
