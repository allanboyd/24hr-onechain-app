// Home "analysis": KPI cards per role and the "Needs attention" list, derived from the same client calls the web
// dashboard uses (analytics.summary, reports.dashboard, finance.trips, shipments.list, reports.inventory, plans.list).
import type { DashboardReport, InventoryReport, Plan, Role, Shipment, User, analytics, finance } from '@btw/api';
import type { Kpi } from './components/KpiCard.svelte';
import { can, mayApprovePayments, mayApprovePOs } from './access';
import { change, compact, num, pct, plural, points, usd } from './fmt';
import { waitLabel } from '@btw/api/trucks';
import type { Desk } from './desk';

export type Summary = Awaited<ReturnType<typeof analytics.summary>>;
export type Trip = Awaited<ReturnType<typeof finance.trips>>[number];
export interface HomeData { sum: Summary | null; dash: DashboardReport | null; trips: Trip[] | null; ships: Shipment[] | null; inv: InventoryReport | null; drafts: Plan[] | null; desk?: Desk | null }

type KpiKey = 'sales' | 'trucks' | 'delayed' | 'onTime' | 'stock' | 'transit' | 'owed' | 'receivables' | 'margin' | 'cases' | 'queue' | 'issues' | 'wait';
const PREFS: Record<Role, KpiKey[]> = {
  director: ['sales', 'trucks', 'onTime', 'stock', 'owed', 'receivables'],
  planner: ['trucks', 'transit', 'stock', 'onTime', 'delayed', 'sales'],
  fleet: ['trucks', 'delayed', 'onTime', 'owed'],
  truck_planner: ['queue', 'trucks', 'delayed', 'issues', 'wait', 'owed'],
  operations: ['trucks', 'delayed', 'onTime', 'owed'],
  accounts: ['owed', 'receivables', 'sales', 'margin', 'stock', 'trucks'],
  sales: ['sales', 'cases', 'stock', 'receivables'],
  admin: ['trucks', 'sales', 'stock', 'onTime'],
  loader: ['trucks'], receiver: ['stock', 'sales'], driver: [],
};

export function kpisFor(u: User, d: HomeData): Kpi[] {
  const s = d.sum, k = d.dash?.kpis;
  const owed = d.trips ? d.trips.reduce((a, t) => a + Math.max(0, t.balance), 0) : null;
  const pendingPay = d.trips ? d.trips.flatMap((t) => t.payments).filter((p) => p.status === 'Pending approval').length : 0;
  const make: Record<KpiKey, () => Kpi | null> = {
    sales: () => k
      ? { key: 'sales', label: 'Sales · 30 days', value: usd(k.revenue30), delta: change(k.revenue30, k.revenuePrev30), hint: 'vs the 30 days before', spark: d.dash!.spark.revenue, href: '/reports' }
      : s ? { key: 'sales', label: 'Sales · 30 days', value: usd(s.sales30), bars: s.daily.slice(-14).map((x) => x.cases), hint: 'cases per day, last 2 weeks', href: '/sales' } : null,
    cases: () => k
      ? { key: 'cases', label: 'Cases sold · 30 days', value: compact(k.cases30), delta: change(k.cases30, k.casesPrev30), spark: d.dash!.spark.cases, href: '/sales' }
      : s ? { key: 'cases', label: 'Cases sold · 30 days', value: compact(s.daily.reduce((a, x) => a + x.cases, 0)), bars: s.daily.slice(-14).map((x) => x.cases), href: '/sales' } : null,
    trucks: () => s && can(u, 'logistics') ? { key: 'trucks', label: 'Trucks on the road', value: num(s.trucksActive), hint: `${s.trucksDelayed} delayed · ${s.trucksAtBorder} at a border`, tone: s.trucksDelayed ? 'warning' : undefined, href: '/trucks', bars: activityBars(d.ships) } : null,
    delayed: () => s && can(u, 'logistics') ? { key: 'delayed', label: 'Delayed trucks', value: num(s.trucksDelayed), hint: d.dash?.logistics.overdue ? `${d.dash.logistics.overdue} missed a check-in` : 'running behind plan', tone: s.trucksDelayed ? 'danger' : 'success', href: '/trucks?f=delayed' } : null,
    onTime: () => k && k.onTimePct != null ? { key: 'onTime', label: 'On-time deliveries', value: pct(k.onTimePct), delta: points(k.onTimePct, k.onTimePrev), deltaText: deltaPts(points(k.onTimePct, k.onTimePrev)), hint: 'last 90 days', spark: d.dash!.spark.onTime, href: '/reports' } : null,
    stock: () => (k || s) && (can(u, 'inventory') || can(u, 'dashboard')) ? { key: 'stock', label: 'Stock value', value: usd(k?.stockValue ?? s!.stockValue), hint: k?.stockCover ? `${k.stockCover} days of cover` : `${compact(s?.stockCases ?? 0)} cases`, href: can(u, 'inventory') ? '/stock' : undefined } : null,
    transit: () => s ? { key: 'transit', label: 'Cases in transit', value: compact(s.inTransitCases), hint: `${compact(s.stockCases)} cases in warehouses`, href: '/trucks' } : null,
    owed: () => owed != null ? { key: 'owed', label: 'Transport owed', value: usd(owed), hint: pendingPay ? `${plural(pendingPay, 'payment')} waiting for approval` : 'to transporters', tone: pendingPay ? 'warning' : undefined, href: '/money' } : null,
    receivables: () => k ? { key: 'receivables', label: 'Owed by customers', value: usd(k.outstanding), delta: change(k.outstanding, k.outstandingPrev), upIsGood: false, hint: 'vs 30 days ago', href: can(u, 'sales') ? '/sales' : undefined }
      : s ? { key: 'receivables', label: 'Owed by customers', value: usd(s.unpaidBalance), href: can(u, 'sales') ? '/sales' : undefined } : null,
    queue: () => d.desk ? { key: 'queue', label: 'Trucks in queue', value: num(d.desk.kpis.inQueue), hint: d.desk.kpis.longWaits ? `${plural(d.desk.kpis.longWaits, 'truck')} waiting over a day` : `${d.desk.kpis.loading} loading now`, tone: d.desk.kpis.longWaits ? 'warning' : undefined, href: '/queue' } : null,
    issues: () => d.desk ? { key: 'issues', label: 'Open issues', value: num(d.desk.kpis.openIssues), hint: 'breakdowns, borders, documents', tone: d.desk.kpis.openIssues ? 'danger' : 'success', href: '/fleet?f=Delayed' } : null,
    wait: () => d.desk ? { key: 'wait', label: 'Average queue wait', value: waitLabel(d.desk.kpis.avgWaitHours), hint: 'trucks waiting now', href: '/queue' } : null,
    margin: () => k ? { key: 'margin', label: 'Gross margin', value: pct(k.marginPct30, 1), delta: points(k.marginPct30, k.marginPctPrev30), deltaText: deltaPts(points(k.marginPct30, k.marginPctPrev30)), hint: 'after landing cost', href: '/reports' } : null,
  };
  const keys: KpiKey[] = [];
  for (const r of u.roles) for (const x of PREFS[r] ?? []) if (!keys.includes(x)) keys.push(x);
  return keys.map((x) => make[x]()).filter((x): x is Kpi => !!x).slice(0, 6);
}
const deltaPts = (p: number | null) => (p == null ? undefined : `${p >= 0 ? '+' : '−'}${Math.abs(Math.round(p * 100))} pts`);
/** Trucks that left per day over the last two weeks (from first-leg departures). */
function activityBars(ships: Shipment[] | null): number[] | undefined {
  if (!ships?.length) return undefined;
  const day = 864e5, today = Math.floor(Date.now() / day);
  const out = Array(14).fill(0) as number[];
  for (const s of ships) { const t = Date.parse(s.legs[0]?.departedAt ?? s.legs[0]?.passes[0]?.departedAt ?? ''); if (!Number.isFinite(t)) continue; const i = 13 - (today - Math.floor(t / day)); if (i >= 0 && i < 14) out[i]++; }
  return out.some(Boolean) ? out : undefined;
}

export interface Attention { id: string; tone: 'danger' | 'warning' | 'info'; title: string; text: string; href: string }
export function attentionFor(u: User, d: HomeData): Attention[] {
  const out: Attention[] = [];
  if (mayApprovePayments(u) && d.sum?.paymentsPending) out.push({ id: 'pay', tone: 'warning', title: plural(d.sum.paymentsPending, 'payment') + ' to approve', text: 'Transport payments over the limit', href: '/approvals' });
  if (mayApprovePOs(u) && d.sum?.plansPending) out.push({ id: 'po', tone: 'warning', title: plural(d.sum.plansPending, 'purchase order') + ' to approve', text: 'Waiting for your signature', href: '/approvals' });
  if (can(u, 'logistics') && d.ships) {
    for (const s of d.ships.filter((x) => x.status === 'Delayed').slice(0, 3)) {
      const leg = s.legs.find((l) => l.status === 'Delayed') ?? s.legs.at(-1)!;
      const issue = leg.issues.find((i) => !i.fixedAt);
      out.push({ id: `sh-${s.id}`, tone: 'danger', title: `${s.ref} is delayed`, text: issue ? `${issue.reason} · ${issue.place}` : 'Running behind the planned time', href: `/trucks/${s.id}` });
    }
    const more = d.ships.filter((x) => x.status === 'Delayed').length - 3;
    if (more > 0) out.push({ id: 'sh-more', tone: 'danger', title: `${plural(more, 'more truck')} delayed`, text: 'See all delayed trucks', href: '/trucks?f=delayed' });
    if (d.dash?.logistics.overdue) out.push({ id: 'overdue', tone: 'danger', title: `${plural(d.dash.logistics.overdue, 'truck')} missed a check-in`, text: 'No check-in at the next checkpoint', href: '/trucks?f=road' });
  }
  if (d.desk && can(u, 'trucks')) {
    for (const x of d.desk.rows.filter((r) => r.state === 'Waiting' && (r.waitingHours ?? 0) > 24).slice(0, 3))
      out.push({ id: `wait-${x.truck.id}`, tone: 'warning', title: `${x.truck.reg} waiting ${waitLabel(x.waitingHours)}`, text: `#${x.queuePosition} at ${x.where.replace(/^Queue at /, '').replace(/ \(#\d+\)$/, '')} · ${x.provider?.name ?? ''}`, href: `/queue?lp=${x.loadingPointId}` });
    for (const x of d.desk.rows.filter((r) => r.issues.length && r.state !== 'Delayed').slice(0, 2))
      out.push({ id: `iss-${x.truck.id}`, tone: 'danger', title: `${x.truck.reg}: ${x.issues[0].reason}`, text: x.issues[0].place || x.where, href: `/fleet/${x.truck.id}` });
    const stale = d.desk.rows.filter((r) => ['In transit', 'At border'].includes(r.state) && (r.daysSinceMove ?? 0) >= 2).length;
    if (stale) out.push({ id: 'stale', tone: 'warning', title: `${plural(stale, 'truck')} not moved for 2+ days`, text: 'On the road without a check-in', href: '/fleet?f=road' });
  }
  if (d.inv && can(u, 'inventory')) {
    const low = d.inv.rows.filter((r) => r.risk === 'out' || r.risk === 'stock-out risk' || r.risk === 'low').sort((a, b) => (a.coverDays ?? 0) - (b.coverDays ?? 0));
    for (const r of low.slice(0, 3)) {
      const wh = d.inv.byWarehouse.find((w) => w.warehouseId === r.warehouseId)?.name ?? '';
      out.push({ id: `st-${r.warehouseId}-${r.productId}`, tone: r.risk === 'low' ? 'warning' : 'danger', title: `${r.brand} ${r.pack} running low`, text: `${wh} · ${r.coverDays == null ? 'no sales pace yet' : r.closing === 0 ? 'out of stock' : `${r.coverDays} days of cover`}`, href: `/stock?f=low` });
    }
  }
  if (d.drafts) for (const p of d.drafts.filter((x) => x.status === 'Returned').slice(0, 2))
    out.push({ id: `dr-${p.id}`, tone: 'info', title: `${p.ref} was returned`, text: p.history.at(-1)?.comment ?? 'Open it in the web app to change it', href: `/orders/draft/${p.id}` });
  if (d.dash && can(u, 'period-plans')) {
    const soon = d.dash.suggestions.filter((x) => x.urgency !== 'soon').length;
    if (soon && u.roles.includes('planner')) out.push({ id: 'sugg', tone: 'info', title: `${plural(soon, 'order')} to place this week`, text: 'To avoid stock-outs (from sales pace and lead times)', href: '/stock?f=low' });
  }
  return out;
}
