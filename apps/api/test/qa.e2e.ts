// QA suite: security, cross-company isolation, business rules, offline sync, integrations and a light load test against
// isolated databases (btw_qa_*) and API processes (:3290–3298). Never touches the `btw` database or :3101.
// Run: pnpm --filter @btw/server test:qa  [--only security,tenancy,fuzz,integrations,sync,rules,revisions,trucks,access,money,dashboards,load]  (needs `docker compose up -d`)
import { boot, summary } from './qa/harness';
import { JWT_SECRET, productionSuite, securitySuite, webhookSecretSuite } from './qa/security';
import { rulesSuite } from './qa/rules';
import { syncSuite } from './qa/sync';
import { integrationsSuite } from './qa/integrations';
import { loadSuite } from './qa/load';
import { clientSuite } from './qa/client';
import { fuzzSuite } from './qa/fuzz';
import { tenancySuite } from './qa/tenancy';
import { revisionsSuite } from './qa/revisions';
import { trucksSuite } from './qa/trucks';
import { accessSuite } from './qa/access';
import { moneySuite } from './qa/money';
import { dashboardsSuite } from './qa/dashboards';
import path from 'node:path';

/** config.toml for the approval-flow suites: director approval on, ±5 % allowance, no alternatives. */
const APPROVALS_ON = path.resolve(__dirname, 'qa/config-approvals.toml');

const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].split(',') : null;
const want = (s: string) => !only || only.includes(s);

async function main() {
  const env = await boot('btw_qa_api', 3291, { JWT_SECRET });
  try {
    if (want('security')) { await securitySuite(env); await clientSuite(env); }
  } finally { await env.stop(); }
  if (want('tenancy')) { const e = await boot('btw_qa_tenant', 3290, { JWT_SECRET }); try { await tenancySuite(e); } finally { await e.stop(); } }
  if (want('fuzz')) { const e = await boot('btw_qa_fuzz', 3298, { JWT_SECRET }); try { await fuzzSuite(e); } finally { await e.stop(); } }
  if (want('integrations')) { const e = await boot('btw_qa_int', 3296, { JWT_SECRET, WEBHOOK_SECRET: '' }); try { await integrationsSuite(e); } finally { await e.stop(); } }
  if (want('sync')) { const e = await boot('btw_qa_sync', 3295, { JWT_SECRET }); try { await syncSuite(e); } finally { await e.stop(); } }
  if (want('rules')) { const e = await boot('btw_qa_rules', 3294, { JWT_SECRET, CONFIG_FILE: APPROVALS_ON }); try { await rulesSuite(e); } finally { await e.stop(); } }
  // default config (no PO approval, ±10 %, alternatives on): period-plan overlaps, PO issue, loading revisions, reports
  if (want('revisions')) { const e = await boot('btw_qa_rev', 3289, { JWT_SECRET, CONFIG_FILE: path.resolve(__dirname, 'qa/no-such-config.toml') }); try { await revisionsSuite(e); } finally { await e.stop(); } }
  // truck planner role (docs/10): permissions, onboarding, queue management
  // docs/12: static data, audit log search, price hiding, missing agreed price
  if (want('access')) { const e = await boot('btw_qa_access', 3287, { JWT_SECRET }); try { await accessSuite(e); } finally { await e.stop(); } }
  // docs/14: warehouse money (expenses, inventory, re-exports, fees, selling prices, performance, ack reasons)
  if (want('money')) { const e = await boot('btw_qa_money', 3286, { JWT_SECRET }); try { await moneySuite(e); } finally { await e.stop(); } }
  // docs/15: P1 dashboards scoped by the caller (homes, pairs, loading points, warehouses, no values for loaders / receivers)
  if (want('dashboards')) { const e = await boot('btw_qa_dash', 3284, { JWT_SECRET }); try { await dashboardsSuite(e); } finally { await e.stop(); } }
  if (want('trucks')) { const e = await boot('btw_qa_trucks', 3288, { JWT_SECRET }); try { await trucksSuite(e); } finally { await e.stop(); } }
  if (want('security')) {
    const prod = await boot('btw_qa_prod', 3292, { JWT_SECRET, NODE_ENV: 'production', WEBHOOK_SECRET: '' });
    try { await productionSuite(prod); } finally { await prod.stop(); }
    const sec = await boot('btw_qa_hook', 3293, { JWT_SECRET, WEBHOOK_SECRET: 'qa-hook-key' });
    try { await webhookSecretSuite(sec, 'qa-hook-key'); } finally { await sec.stop(); }
  }
  if (want('load')) { const e = await boot('btw_qa_load', 3297, { JWT_SECRET, REF_TTL_MS: '1500', DB_POOL: '6' }); try { await loadSuite(e); } finally { await e.stop(); } }
  process.exit(summary() ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
