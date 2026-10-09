// QA suite: security, business rules, offline sync, integrations and a light load test against an
// isolated databases (btw_qa_*) and API processes (:3291–3298). Never touches the `btw` database or :3101.
// Run: pnpm --filter @btw/server test:qa  [--only security,fuzz,integrations,sync,rules,load]  (needs `docker compose up -d`)
import { boot, summary } from './qa/harness';
import { JWT_SECRET, productionSuite, securitySuite, webhookSecretSuite } from './qa/security';
import { rulesSuite } from './qa/rules';
import { syncSuite } from './qa/sync';
import { integrationsSuite } from './qa/integrations';
import { loadSuite } from './qa/load';
import { clientSuite } from './qa/client';
import { fuzzSuite } from './qa/fuzz';

const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].split(',') : null;
const want = (s: string) => !only || only.includes(s);

async function main() {
  const env = await boot('btw_qa_api', 3291, { JWT_SECRET });
  try {
    if (want('security')) { await securitySuite(env); await clientSuite(env); }
  } finally { await env.stop(); }
  if (want('fuzz')) { const e = await boot('btw_qa_fuzz', 3298, { JWT_SECRET }); try { await fuzzSuite(e); } finally { await e.stop(); } }
  if (want('integrations')) { const e = await boot('btw_qa_int', 3296, { JWT_SECRET, WEBHOOK_SECRET: '' }); try { await integrationsSuite(e); } finally { await e.stop(); } }
  if (want('sync')) { const e = await boot('btw_qa_sync', 3295, { JWT_SECRET }); try { await syncSuite(e); } finally { await e.stop(); } }
  if (want('rules')) { const e = await boot('btw_qa_rules', 3294, { JWT_SECRET }); try { await rulesSuite(e); } finally { await e.stop(); } }
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
