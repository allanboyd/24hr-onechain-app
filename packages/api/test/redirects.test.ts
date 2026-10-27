// docs/17 Phase 2–3: every old web route redirects to the right new page / tab with its filters; every redirect target and
// every hash link in the shared code (dashboards, notifications, reports) is a route of the web app; the sidebar has 16
// entries; the Home tabs hold the moved analysis with the old access rules; the phone maps the new links.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { redirectOf } from '../../../apps/web/src/lib/redirects';
import { parse } from '../../../apps/field/src/team/routes';
import { DASHBOARDS, canSeeDash, dashboardsFor } from '../src/dashboards';
import { featuresFor } from '../src/rules';
import type { Role } from '../src/types';

let fails = 0, checks = 0;
const ok = (c: unknown, m: string, detail?: unknown) => { checks++; if (!c) { fails++; console.log('FAIL', m, detail === undefined ? '' : JSON.stringify(detail)); } else console.log('ok  ', m); };
const root = path.resolve(import.meta.dirname, '../../..');
const read = (p: string) => readFileSync(path.join(root, p), 'utf8');

// ---- old route → new route -------------------------------------------------------------------------------------------
const CASES: [string, string | null][] = [
  ['/inventory', '/stock'], ['/inventory?tab=list&level=Low&wh=w-goma', '/stock?level=Low&wh=w-goma'], ['/inventory?tab=overview', '/stock'],
  ['/warehouse-stock', '/stock'], ['/warehouse-stock?wh=w-juba', '/stock?wh=w-juba'],
  ['/finance', '/transport-costs?tab=trips'], ['/finance?tab=list&q=SH-1', '/transport-costs?tab=trips&q=SH-1'],
  ['/transport-fees', '/transport-costs'], ['/transport-fees?q=BTW-SH-2026-0001', '/transport-costs?q=BTW-SH-2026-0001'],
  ['/loading', '/trucks?tab=queues'], ['/loading?lp=s-gbi', '/trucks?tab=queues&lp=s-gbi'], ['/loading?tab=overview', '/trucks?tab=queues'],
  ['/tracking', '/shipments?view=map'],
  ['/analytics', '/dashboards/warehouse'], ['/analytics?tab=list&cls=Slow', '/dashboards/warehouse'],
  ['/reports', '/'], ['/reports?r=sales', '/dashboards/sales'], ['/reports?r=quarterly', '/dashboards/sales'], ['/reports?r=logistics', '/dashboards/fleet'],
  ['/reports?r=inventory', '/dashboards/warehouse'], ['/reports?r=pv', '/dashboards/purchasing'], ['/reports?r=planning&wh=w-goma', '/dashboards/purchasing'],
  ['/reports?r=finance', '/dashboards/fees'], ['/reports?r=period&mode=check&wh=w-goma', '/period-plans/check?mode=check&wh=w-goma'], ['/reports?r=period', '/period-plans/check'],
  ['/shipments?chip=Delayed', '/shipments?show=delayed'], ['/shipments?chip=active', '/shipments?show=road'], ['/shipments?chip=no-checkin', '/shipments?show=noCheckin'],
  ['/shipments?chip=Acknowledged', '/shipments?show=delivered'], ['/shipments?chip=At%20border', '/shipments?show=border'], ['/shipments?tab=list&chip=all', '/shipments'],
  ['/sales?tab=list&status=Unpaid', '/sales?status=Unpaid'], ['/sales?tab=overview', '/sales'], ['/pos?tab=list&stage=Created', '/pos?stage=Created'],
  ['/period-plans?tab=overview', '/period-plans'], ['/trucks?view=expenses', '/trucks?tab=costs'], ['/trucks?tab=overview', '/trucks'],
  // current routes are left alone
  ['/', null], ['/stock', null], ['/stock?show=attention', null], ['/trucks?tab=queues&lp=s-gbi', null], ['/transport-costs?tab=fees', null], ['/shipments?show=delayed&view=map', null],
  ['/dashboards/fleet', null], ['/pos/abc', null], ['/overview', null], ['/performance?tab=products', null],
];
for (const [from, to] of CASES) ok(redirectOf(from) === to, `redirect ${from} → ${to ?? '(stays)'}`, redirectOf(from));
// a redirect target never redirects again
for (const [from] of CASES) { const t = redirectOf(from); if (t) ok(redirectOf(t) === null, `no redirect chain from ${from}`, redirectOf(t)); }

// ---- every target and every shared hash link is a web route -------------------------------------------------------------
const routes = [...read('apps/web/src/routes.ts').matchAll(/path: '([^']+)'/g)].map((m) => m[1]);
const isRoute = (h: string) => { const p = h.replace(/^#/, '').split('?')[0].replace(/\$\{[^}]+\}/g, 'x'); return routes.some((r) => new RegExp('^' + r.replace(/:\w+/g, '[^/]+') + '/?$').test(p)); };
for (const [from] of CASES) { const t = redirectOf(from); if (t) ok(isRoute(t), `target ${t} is a route`); }
const RETIRED = ['/inventory', '/warehouse-stock', '/finance', '/transport-fees', '/loading', '/tracking', '/analytics', '/reports'];
const files = (dir: string): string[] => readdirSync(path.join(root, dir)).flatMap((f) => { const p = path.join(dir, f); return statSync(path.join(root, p)).isDirectory() ? (f === 'node_modules' || f === 'dist' ? [] : files(p)) : /\.(ts|svelte)$/.test(f) ? [p] : []; });
const shared = [...files('packages/api/src'), ...files('apps/api/src'), ...files('apps/web/src')].filter((f) => !f.endsWith('lib/redirects.ts'));
let links = 0;
for (const f of shared) {
  for (const m of read(f).matchAll(/['"`]#(\/[a-z][a-z0-9/-]*)(?:[?'"`$])/g)) {
    links++;
    const p = m[1];
    if (RETIRED.some((r) => p === r || p.startsWith(r + '/'))) ok(false, `retired link ${p} in ${f}`);
  }
  for (const m of read(f).matchAll(/[?&](chip=|tab=list|tab=overview)/g)) ok(false, `old filter ${m[1]} in ${f}`);
}
ok(links > 50, `${links} hash links checked in the shared code, none to a retired page`);
for (const d of DASHBOARDS) if (d.link) ok(isRoute(d.link), `dashboard ${d.key} drill-down ${d.link} is a route`);

// ---- sidebar: 22 → 15 entries ------------------------------------------------------------------------------------------
const nav = read('apps/web/src/routes.ts');
const navBlock = nav.slice(nav.indexOf('export const nav'), nav.indexOf('const HIDDEN'));
const hrefs = [...navBlock.matchAll(/href: '#([^']*)'/g)].map((m) => m[1]);
ok(hrefs.length === 16, `sidebar has 16 entries — docs/17 §4 list (its '15' miscounts the Admin group) (${hrefs.length})`, hrefs);
for (const r of RETIRED.concat(['/integrations'])) ok(!hrefs.includes(r), `sidebar has no ${r}`);
for (const h of hrefs) ok(isRoute(h), `sidebar ${h} is a route`);

// ---- Home tabs: the moved analysis keeps the old access rules ----------------------------------------------------------
const u = (...roles: Role[]) => ({ roles });
const group = (us: { roles: Role[] }, key: string) => dashboardsFor(us).some((d) => d.key === key);
ok(group(u('director'), 'sales-report') && group(u('director'), 'quarterly-review') && group(u('director'), 'logistics-report') && group(u('director'), 'finance-report') && group(u('director'), 'inventory-report') && group(u('director'), 'sales-velocity'), 'directors: every Reports tab is on Home');
ok(DASHBOARDS.find((d) => d.key === 'fast-slow')?.group === 'warehouse' && DASHBOARDS.find((d) => d.key === 'sales-velocity')?.group === 'warehouse', 'Sales velocity and Fast & slow on Home · Warehouse');
ok(!canSeeDash(u('receiver'), 'inventory-report') && canSeeDash(u('receiver'), 'stock-analysis'), 'receivers: stock positions, never the valued stock report');
ok(canSeeDash(u('planner'), 'purchase-planning') && canSeeDash(u('planner'), 'plan-vs-actual-report') && canSeeDash(u('planner'), 'orders-analysis'), 'Kabonge: planning, planned vs actual and orders on Home · Purchasing');
ok(!canSeeDash(u('truck_planner'), 'sales-report') && !canSeeDash(u('truck_planner'), 'finance-report'), 'Testfie: no sales or landing-cost report');
ok(canSeeDash(u('accounts'), 'finance-report') && featuresFor(['accounts']).includes('reports'), 'accounts (Reports feature) keep the reports on Home');
ok(DASHBOARDS.filter((d) => d.analysis).every((d) => d.client && d.link && isRoute(d.link)), 'analysis sections are browser-built with a drill-down link');

// ---- the phone maps the new links -----------------------------------------------------------------------------------------
ok(parse('/trucks?tab=queues&lp=s-gbi').tab === 'queue', 'phone: #/trucks?tab=queues → queue');
ok(parse('/transport-costs?tab=trips').tab === 'money' && parse('/stock?show=attention').tab === 'stock' && parse('/shipments?view=map').tab === 'trucks', 'phone: transport costs, stock and the map');
ok(parse('/loading').tab === 'queue' && parse('/finance').tab === 'money' && parse('/warehouse-stock').tab === 'stock', 'phone: old links still land');

console.log(`\n${checks - fails} / ${checks} route checks`);
if (fails) { console.log(`${fails} FAILED`); process.exit(1); }
console.log('all route checks passed');
