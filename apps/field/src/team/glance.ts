// Per-person phone home screens (docs/11 D-A1, client dashboards document §10) and their drill-down lists.
// Everything is derived here from the client calls the API already scopes to the signed-in person (analytics.summary,
// reports.*, loading.list, shipments.list, plans/pos, finance.fees, notifications, the truck desk) — no new endpoint.
// Pure builders + small loaders; lazy chunk shared by the persona homes (homes/*) and the list screen (screens/Glance).
import { analytics, finance, loading, notifications, plans, pos, shipments, type Loading, type Notification, type Plan, type PurchaseOrder, type Shipment, type TransportFeeRow, type User } from '@btw/api';
import type { DashboardReport, InventoryReport, PerformanceReport, PlannedVsActual } from '@btw/api';
import { ON_ROAD, TRUCK_STATES, type TruckRow, type TruckState } from '@btw/api/trucks';
import { lookup } from '@btw/api';
import { fmtDateTime } from '@btw/ui';
import type { Kpi } from './components/KpiCard.svelte';
import { can, mayApprovePayments, mayApprovePOs, poApprovalRequired } from './access';
import { loadDesk, type Desk } from './desk';
import { change, dayLabel, num, pct, plural, usd } from './fmt';
import { settle } from './load.svelte';
import { reportsApi } from './reports';
import type { Summary } from './insights';

export type Tone = 'danger' | 'warning' | 'success' | 'info' | 'neutral';
export interface Chip { tone: Tone; label: string }
/** One tappable list row. Every row drills down (href). */
export interface GRow { id: string; title: string; meta?: string; meta2?: string; chip?: Chip; amount?: string; href: string; entityId?: string; gap?: Gap }
export interface GList { title: string; sub?: string; filters?: { id: string; label: string; count: number; href: string; on: boolean }[]; groups: { label: string; rows: GRow[] }[]; empty: string }
export interface Gap { ordered: number; loaded: number; delivered: number }
/** A count tile / chip on a home (status chips with counts → list). */
export interface CountTile { id: string; label: string; count: number; tone: Tone; href: string; hint?: string }
/** A "next action" row on a home: label, count chip, short reason, link. */
export interface ActionRow { id: string; label: string; value: string; tone: Tone; text: string; href: string }

const DAY = 864e5, H = 36e5;
const t = (x?: string | null) => (x ? Date.parse(x) : NaN);
const sumOf = <T>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0);
const hoursLabel = (h: number) => (h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} days`);

/** This month so far, and the same days of the month before (for "change vs previous period"). */
export function monthWindows(now = Date.now()) {
  const d = new Date(now); const y = d.getUTCFullYear(), m = d.getUTCMonth();
  const from = Date.UTC(y, m, 1), to = Math.floor(now / DAY) * DAY + DAY;
  const pFrom = Date.UTC(y, m - 1, 1), pTo = Math.min(Date.UTC(y, m, 1), pFrom + (to - from));
  const iso = (x: number) => new Date(x).toISOString();
  const label = new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' }).format(new Date(from));
  return { cur: { from: iso(from), to: iso(to) }, prev: { from: iso(pFrom), to: iso(pTo) }, label };
}

// =====================================================================================================================
// Directors (Daniel, Michael): executive scorecard + top exceptions + quick links
// =====================================================================================================================
export interface DirectorData {
  sum: Summary | null; dash: DashboardReport | null; inv: InventoryReport | null; ships: Shipment[] | null; loadings: Loading[] | null;
  fees: TransportFeeRow[] | null; perf: PerformanceReport | null; perfPrev: PerformanceReport | null; notes: Notification[] | null; month: string;
}
export async function loadDirector(u: User): Promise<DirectorData> {
  const rp = await reportsApi();
  const w = monthWindows();
  const [sum, dash, inv, ships, loadings, fees, perf, perfPrev, notes] = await Promise.all([
    settle(analytics.summary(), null),
    can(u, 'dashboard') ? settle(rp.dashboard(), null) : null,
    can(u, 'reports') ? settle(rp.inventory(), null) : null,
    can(u, 'logistics') ? settle(shipments.list(), null) : null,
    can(u, 'loading') ? settle(loading.list(), null) : null,
    can(u, 'transport-fees') ? settle(finance.fees(), null) : null,
    can(u, 'performance') ? settle(rp.performance({ ...w.cur, level: 'company' }), null) : null,
    can(u, 'performance') ? settle(rp.performance({ ...w.prev, level: 'company' }), null) : null,
    settle(notifications.list(), null),
  ]);
  if (!sum && !dash) throw new Error('Could not load your numbers. Check your connection.');
  return { sum, dash, inv, ships, loadings, fees, perf, perfPrev, notes, month: w.label };
}
/** Trucks on the road at time `at` (first departure before, final arrival after or none yet). */
function onRoadAt(ships: Shipment[], at: number): number {
  let n = 0;
  for (const s of ships) {
    if (s.parentShipmentId || s.status === 'Cancelled') continue;
    const dep = t(s.legs[0]?.departedAt ?? s.legs[0]?.passes[0]?.departedAt);
    if (!(dep <= at)) continue;
    const last = s.legs.at(-1)!; const arr = t(last.passes.at(-1)?.arrivedAt);
    if (!Number.isFinite(arr) || arr > at) n++;
  }
  return n;
}
const pendingLoads = (ls: Loading[] | null) => (ls ?? []).filter((l) => l.status === 'Pending');
export function directorKpis(u: User, d: DirectorData): Kpi[] {
  const out: Kpi[] = [];
  const s = d.sum, k = d.dash?.kpis;
  if (s && can(u, 'logistics')) {
    const weekAgo = d.ships ? onRoadAt(d.ships, Date.now() - 7 * DAY) : null;
    out.push({ key: 'road', label: 'Trucks on the road', value: num(s.trucksActive), delta: weekAgo ? change(s.trucksActive, weekAgo) : null, hint: weekAgo != null ? `${num(weekAgo)} a week ago` : `${s.trucksAtBorder} at a border`, href: '/glance/fleet?state=road' });
    out.push({ key: 'delayed', label: 'Delayed trucks', value: num(s.trucksDelayed), tone: s.trucksDelayed ? 'danger' : 'success', hint: d.dash?.logistics.overdue ? `${plural(d.dash.logistics.overdue, 'truck')} missed a check-in` : s.trucksDelayed ? 'behind plan or with an open issue' : 'none behind plan', href: '/glance/fleet?state=Delayed' });
  }
  if (d.loadings) {
    const p = pendingLoads(d.loadings); const orders = new Set(p.map((l) => l.poId)).size;
    out.push({ key: 'toload', label: 'Awaiting loading', value: num(orders), hint: `${plural(p.length, 'truck')} still to load`, tone: orders ? 'warning' : undefined, href: '/glance/pipeline?stage=toload' });
  }
  if (k || s) out.push({ key: 'stock', label: 'Stock value', value: usd(k?.stockValue ?? s!.stockValue), hint: k?.stockCover ? `${k.stockCover} days of cover` : 'at landed cost', href: can(u, 'inventory') ? '/stock' : undefined });
  const cur = d.perf?.totals, prev = d.perfPrev?.totals;
  if (cur) {
    out.push({ key: 'sales', label: `Sales · ${d.month}`, value: usd(cur.revenue), delta: prev ? change(cur.revenue, prev.revenue) : null, hint: 'vs same days last month', href: can(u, 'sales') ? '/sales' : undefined });
    out.push({ key: 'profit', label: `Profit · ${d.month}`, value: usd(cur.profit), delta: prev ? change(cur.profit, prev.profit) : null, tone: cur.profit < 0 ? 'danger' : undefined, hint: cur.margin != null ? `${pct(cur.margin, 1)} margin` : 'after landed cost', href: '/glance/profit' });
  } else if (k) {
    out.push({ key: 'sales', label: 'Sales · 30 days', value: usd(k.revenue30), delta: change(k.revenue30, k.revenuePrev30), hint: 'vs the 30 days before', href: can(u, 'sales') ? '/sales' : undefined });
  }
  const ex = directorExceptions(u, d);
  out.push({ key: 'alerts', label: 'Open alerts', value: num(ex.length), tone: ex.some((x) => x.chip?.tone === 'danger') ? 'danger' : ex.length ? 'warning' : 'success', hint: ex.length ? `${ex.filter((x) => x.chip?.tone === 'danger').length} urgent` : 'all clear', href: '/glance/exceptions' });
  return out;
}
export function directorExceptions(u: User, d: DirectorData): GRow[] {
  const out: (GRow & { rank: number })[] = [];
  const add = (rank: number, r: GRow) => out.push({ ...r, rank });
  if (mayApprovePayments(u) && d.sum?.paymentsPending) add(1, { id: 'pay', title: `${plural(d.sum.paymentsPending, 'payment')} to approve`, meta: 'Transport payments over the limit', chip: { tone: 'warning', label: 'Approve' }, href: '/approvals' });
  if (mayApprovePOs(u) && d.sum?.plansPending) add(1, { id: 'po', title: `${plural(d.sum.plansPending, 'purchase order')} to approve`, meta: 'Waiting for your signature', chip: { tone: 'warning', label: 'Approve' }, href: '/approvals' });
  const late = (d.ships ?? []).filter((x) => x.status === 'Delayed');
  if (late.length > 3) add(0.5, { id: 'sh-more', title: `${plural(late.length - 3, 'more truck')} delayed`, meta: 'See every delayed truck, by route', chip: { tone: 'danger', label: 'Delayed' }, href: '/glance/fleet?state=Delayed' });
  for (const s of late.slice(0, 3)) {
    const leg = s.legs.find((l) => l.status === 'Delayed') ?? s.legs.at(-1)!; const issue = leg.issues.find((i) => !i.fixedAt);
    add(0, { id: `sh-${s.id}`, title: `${lookup.truck(leg.truckId)?.reg ?? s.ref} delayed`, meta: issue ? `${issue.reason} · ${issue.place}` : `${s.ref} · behind the planned time`, chip: { tone: 'danger', label: 'Delayed' }, href: `/trucks/${s.id}`, entityId: s.entityId });
  }
  if (d.dash?.logistics.overdue) add(0, { id: 'overdue', title: `${plural(d.dash.logistics.overdue, 'truck')} missed a check-in`, meta: 'No check-in at the next checkpoint', chip: { tone: 'danger', label: 'No check-in' }, href: '/glance/drivers' });
  const red = (d.fees ?? []).filter((f) => f.flag === 'red');
  if (red.length) add(2, { id: 'fees-red', title: `${plural(red.length, 'transport fee')} unpaid 1 month+`, meta: `${usd(sumOf(red, (f) => f.balanceUsd ?? 0))} still owed to transporters`, chip: { tone: 'danger', label: '30+ days' }, href: '/glance/fees?age=30' });
  const missing = (d.fees ?? []).filter((f) => f.status === 'Not recorded');
  if (missing.length) add(3, { id: 'agreed', title: `${plural(missing.length, 'trip')} without an agreed price`, meta: 'Truck follow-up records it after loading', chip: { tone: 'warning', label: 'Not recorded' }, href: '/glance/agreed' });
  for (const r of (d.inv?.rows ?? []).filter((x) => x.risk === 'out' || x.risk === 'stock-out risk').sort((a, b) => (a.coverDays ?? 0) - (b.coverDays ?? 0)).slice(0, 2)) {
    const wh = d.inv!.byWarehouse.find((w) => w.warehouseId === r.warehouseId)?.name ?? '';
    add(2, { id: `st-${r.warehouseId}-${r.productId}`, title: `${r.brand} ${r.pack} running out`, meta: `${wh} · ${r.closing === 0 ? 'out of stock' : `${r.coverDays ?? '—'} days of cover`}`, chip: { tone: 'danger', label: 'Low stock' }, href: '/stock?f=low' });
  }
  if (d.perf && d.perf.totals.profit < 0) add(1, { id: 'loss', title: `Loss this month: ${usd(d.perf.totals.profit)}`, meta: 'Cost of goods sold is above sales', chip: { tone: 'danger', label: 'Loss' }, href: '/glance/profit' });
  return out.sort((a, b) => a.rank - b.rank).map(({ rank: _r, ...r }) => r);
}
export function profitList(d: DirectorData): GList {
  const rows = (d.perf?.rows ?? []).slice().sort((a, b) => b.profit - a.profit).map<GRow>((r) => ({
    id: r.key, title: (r.entityId && (lookup.entity(r.entityId)?.shortName || lookup.entity(r.entityId)?.name)) || r.label, meta: `Sales ${usd(r.revenue)} · cost ${usd(r.cogs)}`, meta2: r.estimated ? 'Some costs estimated (no receipts yet)' : undefined,
    amount: usd(r.profit), chip: r.margin == null ? { tone: 'neutral', label: 'No sales' } : { tone: r.margin < 0 ? 'danger' : r.margin < 0.1 ? 'warning' : 'success', label: `${pct(r.margin, 1)} margin` },
    href: '/reports', entityId: r.entityId,
  }));
  const tt = d.perf?.totals;
  return { title: `Profit and margin · ${d.month}`, sub: tt ? `Sales ${usd(tt.revenue)} · profit ${usd(tt.profit)} · margin ${pct(tt.margin, 1)}` : undefined, groups: [{ label: 'By company', rows }], empty: 'No sales recorded this month yet.' };
}

// =====================================================================================================================
// Transport fees (Testfie, directors): unpaid ageing and missing agreed prices
// =====================================================================================================================
const feeRow = (f: TransportFeeRow): GRow => ({
  id: f.shipmentId, title: `${lookup.truck(f.truckId)?.reg ?? f.ref}${f.reexport ? ' · re-export' : ''}`,
  meta: `${f.ref} · ${lookup.provider(f.providerId ?? '')?.name ?? 'Transporter'}`,
  meta2: f.loadedAt ? `Loaded ${dayLabel(f.loadedAt)} · ${plural(f.ageDays, 'day')} ago` : undefined,
  amount: f.balanceUsd != null ? usd(f.balanceUsd) : undefined,
  chip: f.status === 'Not recorded' ? { tone: 'warning', label: 'No agreed price' } : { tone: f.flag === 'red' ? 'danger' : f.flag === 'amber' ? 'warning' : 'neutral', label: f.status },
  href: `/money/${f.shipmentId}`, entityId: f.entityId,
});
export const unpaid = (fees: TransportFeeRow[]) => fees.filter((f) => f.status === 'Unpaid' || f.status === 'Part paid');
export function feesList(fees: TransportFeeRow[], age: string): GList {
  const open = unpaid(fees).sort((a, b) => b.ageDays - a.ageDays);
  const min = age === '30' ? 30 : age === '14' ? 14 : 0;
  const shown = open.filter((f) => f.ageDays >= min);
  const groups = [
    { label: '1 month or more', rows: shown.filter((f) => f.ageDays >= 30).map(feeRow) },
    { label: '2 weeks to 1 month', rows: shown.filter((f) => f.ageDays >= 14 && f.ageDays < 30).map(feeRow) },
    { label: 'Under 2 weeks', rows: shown.filter((f) => f.ageDays < 14).map(feeRow) },
  ].filter((g) => g.rows.length);
  const n = (m: number) => open.filter((f) => f.ageDays >= m).length;
  return {
    title: 'Unpaid transport fees', sub: `${usd(sumOf(shown, (f) => f.balanceUsd ?? 0))} owed on ${plural(shown.length, 'trip')}`,
    filters: [{ id: 'all', label: 'All unpaid', count: open.length }, { id: '14', label: '2 weeks+', count: n(14) }, { id: '30', label: '1 month+', count: n(30) }].map((x) => ({ ...x, href: `/glance/fees?age=${x.id}`, on: (age || 'all') === x.id })),
    groups, empty: 'No unpaid transport fees here.',
  };
}
export function agreedList(fees: TransportFeeRow[]): GList {
  const rows = fees.filter((f) => f.status === 'Not recorded').sort((a, b) => b.ageDays - a.ageDays).map(feeRow);
  return { title: 'Agreed price not recorded', sub: 'Record the price agreed with the transporter after loading', groups: [{ label: 'Oldest first', rows }], empty: 'Every loaded trip has its agreed price.' };
}

// =====================================================================================================================
// Kabonge (purchase planner): PO pipeline, ordered vs loaded vs delivered, ageing, plan vs actual, alerts
// =====================================================================================================================
export type StageId = 'draft' | 'approval' | 'issued' | 'toload' | 'loading' | 'road' | 'delivered';
export const STAGES: { id: StageId; label: string; tone: Tone }[] = [
  { id: 'draft', label: 'Draft', tone: 'neutral' },
  // With PO approval switched off (config.toml) a submitted draft is simply ready for the planner to issue
  { id: 'approval', get label() { return poApprovalRequired() ? 'Waiting approval' : 'Ready to issue'; }, tone: 'warning' },
  { id: 'issued', label: 'Issued, not sent', tone: 'warning' },
  { id: 'toload', label: 'Waiting to load', tone: 'info' },
  { id: 'loading', label: 'Loading', tone: 'info' },
  { id: 'road', label: 'On the road', tone: 'info' },
  { id: 'delivered', label: 'Delivered (30 days)', tone: 'success' },
];
export interface OrderFlow { id: string; ref: string; href: string; entityId: string; supplierId: string; date: string; stage: StageId; gap: Gap; trucks: number; trucksLoaded: number; ageDays: number }
export interface PlannerData { flows: OrderFlow[]; pv: PlannedVsActual | null; notes: Notification[] | null }
export async function loadPlanner(u: User): Promise<PlannerData> {
  const rp = await reportsApi();
  const [ps, os, ls, ss, pv, notes] = await Promise.all([
    settle(plans.list(), [] as Plan[]), settle(pos.list(), [] as PurchaseOrder[]), can(u, 'loading') ? settle(loading.list(), [] as Loading[]) : ([] as Loading[]),
    can(u, 'logistics') ? settle(shipments.list(), [] as Shipment[]) : ([] as Shipment[]),
    can(u, 'planned-vs-actual') ? settle(rp.plannedVsActual(), null) : null, settle(notifications.list(), null),
  ]);
  return { flows: orderFlows(ps, os, ls, ss), pv, notes };
}
/** One row per order (latest revision): its stage and ordered → loaded → delivered cases. */
export function orderFlows(ps: Plan[], os: PurchaseOrder[], ls: Loading[], ss: Shipment[], now = Date.now()): OrderFlow[] {
  const poById = new Map(os.map((p) => [p.id, p]));
  const base = (poId: string) => poById.get(poId)?.revisionOf ?? poId;
  const planById = new Map(ps.map((p) => [p.id, p]));
  const out: OrderFlow[] = [];
  for (const p of ps) {
    if (p.poId || p.revisionOf || p.status === 'Approved' || p.status === 'Rejected') continue; // ordered ones come from their PO below
    const ordered = sumOf(p.lines, (l) => l.qty);
    out.push({ id: p.id, ref: p.ref, href: `/orders/draft/${p.id}`, entityId: p.entityId, supplierId: p.supplierId, date: p.date, stage: p.status === 'Submitted' ? 'approval' : 'draft', gap: { ordered, loaded: 0, delivered: 0 }, trucks: new Set(p.lines.map((l) => l.truckNo)).size, trucksLoaded: 0, ageDays: Math.max(0, Math.floor((now - t(p.date)) / DAY)) });
  }
  for (const po of os) {
    if (po.supersededById) continue;
    const b = base(po.id); const basePo = poById.get(b) ?? po;
    const plan = planById.get(basePo.planId) ?? planById.get(po.planId);
    const lds = ls.filter((l) => base(l.poId) === b);
    const shs = ss.filter((s) => !s.parentShipmentId && base(s.poId) === b && s.status !== 'Cancelled');
    const ordered = plan ? sumOf(plan.lines, (l) => l.qty) : sumOf(lds, (l) => sumOf(l.lines, (x) => x.orderedQty));
    const done = lds.filter((l) => l.status === 'Loaded');
    const loaded = sumOf(done, (l) => sumOf(l.lines, (x) => x.loadedQty));
    const acked = shs.filter((s) => s.status === 'Acknowledged');
    const delivered = sumOf(acked, (s) => sumOf(s.legs[0]?.lines ?? [], (x) => x.loadedQty));
    const pending = lds.length - done.length;
    const stage: StageId = !done.length ? (po.sentAt ? 'toload' : 'issued') : pending > 0 ? 'loading' : !shs.length || acked.length < shs.length ? 'road' : 'delivered';
    const ageDays = Math.max(0, Math.floor((now - t(po.date)) / DAY));
    if (stage === 'delivered' && ageDays > 45) continue; // keep the pipeline about recent and open orders
    out.push({ id: po.id, ref: po.ref, href: `/orders/po/${po.id}`, entityId: po.entityId, supplierId: po.supplierId, date: po.date, stage, gap: { ordered, loaded, delivered }, trucks: lds.length || (plan ? new Set(plan.lines.map((l) => l.truckNo)).size : 0), trucksLoaded: done.length, ageDays });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}
export const OPEN: StageId[] = ['issued', 'toload', 'loading', 'road'];
export const AGE_BUCKETS = [{ id: 'lt3', label: 'Under 3 days', min: 0, max: 3, tone: 'success' as Tone }, { id: '3to7', label: '3–7 days', min: 3, max: 8, tone: 'warning' as Tone }, { id: 'gt7', label: 'Over 7 days', min: 8, max: Infinity, tone: 'danger' as Tone }];
export function stageTiles(flows: OrderFlow[]): CountTile[] {
  return STAGES.map((s) => ({ id: s.id, label: s.label, count: flows.filter((f) => f.stage === s.id).length, tone: s.tone, href: `/glance/pipeline?stage=${s.id}` }))
    .filter((x) => x.count || !['approval', 'draft'].includes(x.id));
}
export function ageTiles(flows: OrderFlow[]): CountTile[] {
  const open = flows.filter((f) => OPEN.includes(f.stage));
  return AGE_BUCKETS.map((b) => ({ id: b.id, label: b.label, count: open.filter((f) => f.ageDays >= b.min && f.ageDays < b.max).length, tone: b.tone, href: `/glance/ageing?b=${b.id}` }));
}
const flowRow = (f: OrderFlow): GRow => {
  const s = STAGES.find((x) => x.id === f.stage)!;
  return { id: f.id, title: f.ref, meta: `${lookup.supplier(f.supplierId)?.name ?? ''} · ${dayLabel(f.date)} · ${plural(f.ageDays, 'day')} old`, meta2: f.trucks ? `${f.trucksLoaded} of ${plural(f.trucks, 'truck')} loaded` : undefined, chip: { tone: s.tone, label: s.label }, href: f.href, entityId: f.entityId, gap: f.gap.ordered ? f.gap : undefined };
};
export function pipelineList(flows: OrderFlow[], stage: string): GList {
  const tiles = stageTiles(flows);
  const shown = STAGES.filter((s) => !stage || stage === 'all' || s.id === stage);
  return {
    title: 'Purchase order pipeline', sub: 'Every open order by stage — tap one to open it',
    filters: [{ id: 'all', label: 'All', count: flows.length, href: '/glance/pipeline', on: !stage || stage === 'all' }, ...tiles.map((x) => ({ id: x.id, label: x.label, count: x.count, href: x.href, on: stage === x.id }))],
    groups: shown.map((s) => ({ label: s.label, rows: flows.filter((f) => f.stage === s.id).map(flowRow) })).filter((g) => g.rows.length),
    empty: 'No orders at this stage.',
  };
}
export function gapTotals(flows: OrderFlow[]): Gap { const o = flows.filter((f) => OPEN.includes(f.stage)); return { ordered: sumOf(o, (f) => f.gap.ordered), loaded: sumOf(o, (f) => f.gap.loaded), delivered: sumOf(o, (f) => f.gap.delivered) }; }
export function gapsList(flows: OrderFlow[]): GList {
  const open = flows.filter((f) => OPEN.includes(f.stage)).sort((a, b) => (b.gap.ordered - b.gap.delivered) - (a.gap.ordered - a.gap.delivered));
  const g = gapTotals(flows);
  return { title: 'Ordered vs loaded vs delivered', sub: `Open orders: ${num(g.ordered)} ordered · ${num(g.loaded)} loaded · ${num(g.delivered)} delivered (cases)`, groups: [{ label: 'Biggest gap first', rows: open.map(flowRow) }], empty: 'No open orders.' };
}
export function ageingList(flows: OrderFlow[], b: string): GList {
  const open = flows.filter((f) => OPEN.includes(f.stage)).sort((x, y) => y.ageDays - x.ageDays);
  const tiles = ageTiles(flows);
  return {
    title: 'Open orders by age', sub: 'Days since the purchase order date',
    filters: [{ id: 'all', label: 'All open', count: open.length, href: '/glance/ageing', on: !b || b === 'all' }, ...tiles.map((x) => ({ id: x.id, label: x.label, count: x.count, href: x.href, on: b === x.id }))],
    groups: AGE_BUCKETS.filter((x) => !b || b === 'all' || x.id === b).slice().reverse().map((x) => ({ label: x.label, rows: open.filter((f) => f.ageDays >= x.min && f.ageDays < x.max).map(flowRow) })).filter((g) => g.rows.length),
    empty: 'No open orders of this age.',
  };
}
export function pvState(pv: PlannedVsActual): Chip {
  const m = pv.measures;
  if (!m.planned) return { tone: 'neutral', label: 'No approved plan' };
  if (m.ordered > m.planned * pv.thresholds.over) return { tone: 'warning', label: 'Over plan' };
  if (m.ordered < m.expectedToDate * pv.thresholds.behind) return { tone: 'danger', label: 'Behind plan' };
  return { tone: 'success', label: 'On track' };
}

// =====================================================================================================================
// Testfie (truck follow-up): live fleet, delayed, issues, driver updates, agreed prices, unpaid fees
// =====================================================================================================================
export interface TruckData { desk: Desk; fees: TransportFeeRow[] | null; notes: Notification[] | null }
export async function loadTrucks(u: User): Promise<TruckData> {
  const [desk, fees, notes] = await Promise.all([loadDesk(u), can(u, 'transport-fees') ? settle(finance.fees(), null) : null, settle(notifications.list(), null)]);
  return { desk, fees, notes };
}
/** Driver last-update gap: amber after 12 h without a check-in or GPS ping on the road, red after 24 h (docs/16). */
/** Same limits as the web dashboards (packages/api/src/dashboards.ts UPDATE_GAP) — to confirm with the client. */
export const STALE_AMBER_H = 6, STALE_RED_H = 12;
export const hoursSince = (r: TruckRow, now = Date.now()) => (r.lastMoveAt ? (now - t(r.lastMoveAt)) / H : null);
export function staleChip(h: number | null): Chip {
  if (h == null) return { tone: 'neutral', label: 'No update yet' };
  return { tone: h >= STALE_RED_H ? 'danger' : h >= STALE_AMBER_H ? 'warning' : 'success', label: h >= STALE_AMBER_H ? `${hoursLabel(h)} silent` : `${hoursLabel(h)} ago` };
}
const STATE_LABEL: Partial<Record<TruckState, string>> = { Waiting: 'In queue', Arrived: 'Arrived' };
const stateTone = (s: TruckState): Tone => { const x = TRUCK_STATES.find((y) => y.state === s)?.tone ?? 'neutral'; return x === 'accent' ? 'info' : x; };
export function fleetTiles(rows: TruckRow[]): CountTile[] {
  return [
    { id: 'road', label: 'On the road', count: rows.filter((r) => ON_ROAD.includes(r.state)).length, tone: 'info' as Tone, href: '/glance/fleet?state=road' },
    ...TRUCK_STATES.filter((s) => s.state !== 'Idle').map((s) => ({ id: s.state, label: STATE_LABEL[s.state] ?? s.label.replace(' at loading point', '').replace(' at warehouse', ''), count: rows.filter((r) => r.state === s.state).length, tone: stateTone(s.state), href: `/glance/fleet?state=${encodeURIComponent(s.state)}` })),
  ].filter((x) => x.count || x.id === 'road' || x.id === 'Delayed');
}
const routeName = (r: TruckRow) => (r.routeId ? lookup.route(r.routeId)?.name ?? 'Other route' : r.state === 'Waiting' || r.state === 'Loading' ? 'At the loading points' : 'No trip');
const truckRow = (r: TruckRow, chip?: Chip): GRow => ({
  id: r.truck.id, title: r.truck.reg, meta: `${r.where}${r.provider ? ` · ${r.provider.name}` : ''}`,
  meta2: r.issues[0] ? `${r.issues[0].reason}${r.issues[0].place ? ` · ${r.issues[0].place}` : ''}` : r.driver ? `${r.driver.name}${r.eta && r.eta.state === 'Late' ? ` · ${hoursLabel(r.eta.hours)} late` : ''}` : undefined,
  chip: chip ?? { tone: stateTone(r.state), label: STATE_LABEL[r.state] ?? r.state }, href: `/fleet/${r.truck.id}`, entityId: r.entityId,
});
function byRoute(rows: TruckRow[], chip?: (r: TruckRow) => Chip): { label: string; rows: GRow[] }[] {
  const m = new Map<string, TruckRow[]>();
  for (const r of rows) { const k = routeName(r); m.set(k, [...(m.get(k) ?? []), r]); }
  return [...m].sort((a, b) => b[1].length - a[1].length).map(([label, rs]) => ({ label: `${label} · ${rs.length}`, rows: rs.map((r) => truckRow(r, chip?.(r))) }));
}
export function fleetList(rows: TruckRow[], state: string): GList {
  const st = state || 'road';
  const shown = rows.filter((r) => (st === 'all' ? true : st === 'road' ? ON_ROAD.includes(r.state) : r.state === st));
  return {
    title: 'Live fleet', sub: 'Grouped by route — tap a truck for its trip, costs and issues',
    filters: [...fleetTiles(rows).map((x) => ({ id: x.id, label: x.label, count: x.count, href: x.href, on: st === x.id })), { id: 'all', label: 'All trucks', count: rows.length, href: '/glance/fleet?state=all', on: st === 'all' }],
    groups: byRoute(shown), empty: 'No trucks in this state right now.',
  };
}
export const withIssues = (rows: TruckRow[]) => rows.filter((r) => r.issues.length);
export function issuesList(rows: TruckRow[]): GList {
  const xs = withIssues(rows);
  const byProvider = new Map<string, number>(); xs.forEach((r) => byProvider.set(r.provider?.name ?? '—', (byProvider.get(r.provider?.name ?? '—') ?? 0) + 1));
  const repeat = [...byProvider].filter(([, n]) => n > 1).map(([p, n]) => `${p} ×${n}`).join(' · ');
  return { title: 'Open truck issues', sub: repeat ? `More than one open issue: ${repeat}` : 'Breakdowns, border holds, documents — not fixed yet', groups: byRoute(xs, (r) => ({ tone: 'danger', label: r.issues.length > 1 ? `${r.issues.length} issues` : 'Open issue' })), empty: 'No open truck issues.' };
}
export const onTheRoad = (rows: TruckRow[]) => rows.filter((r) => ON_ROAD.includes(r.state));
export function staleCount(rows: TruckRow[], minH = STALE_AMBER_H) { return onTheRoad(rows).filter((r) => (hoursSince(r) ?? Infinity) >= minH).length; }
export function driversList(rows: TruckRow[]): GList {
  const xs = onTheRoad(rows).sort((a, b) => (hoursSince(b) ?? 1e9) - (hoursSince(a) ?? 1e9));
  const rowsOut = xs.map<GRow>((r) => ({ ...truckRow(r, staleChip(hoursSince(r))), title: `${r.truck.reg} · ${r.driver?.name ?? 'driver'}`, meta: `Last update ${r.lastMoveAt ? fmtDateTime(r.lastMoveAt) : 'none yet'} · ${r.where}`, meta2: r.issues[0] ? r.issues[0].reason : r.eta?.state === 'Late' ? `${hoursLabel(r.eta.hours)} behind plan` : undefined }));
  return {
    title: 'Driver status updates', sub: `Amber after ${STALE_AMBER_H} h without a check-in or GPS ping, red after ${STALE_RED_H} h. Updates sent offline arrive when the phone has signal.`,
    groups: [
      { label: `Silent ${STALE_RED_H} h or more`, rows: rowsOut.filter((r) => r.chip?.tone === 'danger' || r.chip?.tone === 'neutral') },
      { label: `Silent ${STALE_AMBER_H}–${STALE_RED_H} h`, rows: rowsOut.filter((r) => r.chip?.tone === 'warning') },
      { label: 'Updated recently', rows: rowsOut.filter((r) => r.chip?.tone === 'success') },
    ].filter((g) => g.rows.length),
    empty: 'No trucks on the road.',
  };
}
export function truckActions(u: User, d: TruckData): ActionRow[] {
  const rows = d.desk.rows; const out: ActionRow[] = [];
  const delayed = rows.filter((r) => r.state === 'Delayed');
  out.push({ id: 'delayed', label: 'Delayed trucks', value: num(delayed.length), tone: delayed.length ? 'danger' : 'success', text: delayed.length ? delayed.slice(0, 2).map((r) => r.truck.reg).join(', ') + (delayed.length > 2 ? ' …' : '') : 'None behind plan', href: '/glance/fleet?state=Delayed' });
  const iss = withIssues(rows);
  out.push({ id: 'issues', label: 'Open truck issues', value: num(iss.length), tone: iss.length ? 'danger' : 'success', text: iss.length ? `${iss[0].truck.reg}: ${iss[0].issues[0].reason}` : 'Nothing open', href: '/glance/issues' });
  const red = staleCount(rows, STALE_RED_H), amber = staleCount(rows) - red;
  out.push({ id: 'drivers', label: 'Drivers silent', value: num(red + amber), tone: red ? 'danger' : amber ? 'warning' : 'success', text: red + amber ? `${red} over ${STALE_RED_H} h · ${amber} over ${STALE_AMBER_H} h` : 'Every truck on the road updated recently', href: '/glance/drivers' });
  if (d.fees) {
    const miss = d.fees.filter((f) => f.status === 'Not recorded');
    out.push({ id: 'agreed', label: 'No agreed price', value: num(miss.length), tone: miss.length ? 'warning' : 'success', text: miss.length ? `${miss.slice(0, 2).map((f) => lookup.truck(f.truckId)?.reg ?? f.ref).join(', ')}${miss.length > 2 ? ' …' : ''}` : 'Every loaded trip has a price', href: '/glance/agreed' });
    const op = unpaid(d.fees); const m1 = op.filter((f) => f.ageDays >= 30), w2 = op.filter((f) => f.ageDays >= 14 && f.ageDays < 30);
    out.push({ id: 'fees', label: 'Fees unpaid 2 weeks+', value: num(m1.length + w2.length), tone: m1.length ? 'danger' : w2.length ? 'warning' : 'success', text: `${m1.length} over 1 month · ${w2.length} over 2 weeks · ${usd(sumOf([...m1, ...w2], (f) => f.balanceUsd ?? 0))}`, href: '/glance/fees?age=14' });
  }
  void u;
  return out;
}

// =====================================================================================================================
// Alerts (everyone on the team app): unread notifications first
// =====================================================================================================================
export function alertRows(notes: Notification[] | null, max = 3): GRow[] {
  return (notes ?? []).filter((n) => !n.read).slice(0, max).map((n) => ({ id: n.id, title: n.title, meta: n.body, chip: { tone: 'info', label: 'New' }, href: '/notifications', entityId: n.entityId ?? undefined }));
}
export const unreadCount = (notes: Notification[] | null) => (notes ?? []).filter((n) => !n.read).length;
