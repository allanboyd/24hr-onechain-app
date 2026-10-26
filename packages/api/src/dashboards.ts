// First-release (P1) dashboards — plan 11 §C step 2, docs/15-dashboards.md. Pure builders shared by the NestJS server
// (GET /v1/dashboards) and the in-browser mock (lazy chunk mock/dash.ts); the web screens import only the catalogue and the
// types (lazy chunks), so nothing here reaches the apps' entry chunks.
//
// Every builder returns { data, definition, unit, currency, period, freshness, empty } where
//   freshness = the timestamp of the newest underlying record (not the time of the request),
//   empty     = there is nothing to show yet — screens then say "No data yet", never a zero (values are null, not 0).
// Scope: `scopeSource` cuts the company-wide data down to what one person may see (roles document §7, access.ts / money.ts),
// then `narrow` applies the dashboard filters (company, supplier, route, warehouse, product, date range).
import { DAY, H, etaOf, featuresFor, hasFeature } from './rules';
import { resolvePeriod, scopeReportData, type ReportData } from './reports';
import { performanceReport, type PerformanceReport } from './performance';
import * as M from './money';
import * as A from './access';
import { truckDesk, type TruckRow } from './trucks';
import * as MX from './metrics';
import type {
  Acknowledgement, AppConfig, CostKind, FeatureKey, ID, Leg, Plan, PurchaseOrder, ReexportOrder, Role, SellingPrice, Shipment, TransportFeeRow,
  UserAdmin, WaitingEntry, WarehouseExpense,
} from './types';

// ======================================================================================================
// CATALOGUE — who gets which dashboard (client's dashboards document §1–§10)
// ======================================================================================================
/** 'home' = a curated home view (no feature-group tab of its own). */
export type DashGroup = 'home' | 'business' | 'purchasing' | 'loading' | 'fleet' | 'fees' | 'deliveries' | 'warehouse' | 'sales' | 'admin';
export const DASH_GROUPS: { key: DashGroup; label: string; blurb: string }[] = [
  { key: 'business', label: 'Directors · business', blurb: 'Where the business stands, profit, landed cost and pricing' },
  { key: 'purchasing', label: 'Purchasing', blurb: 'Orders by stage, ordered vs loaded vs delivered, open orders' },
  { key: 'loading', label: 'Loading', blurb: "Today's loading list, loading progress, dispatched today" },
  { key: 'fleet', label: 'Fleet', blurb: 'Every truck by status, delays, issues, driver updates, border waits' },
  { key: 'fees', label: 'Truck expenses & fees', blurb: 'Agreed price vs actual, fee payments, unpaid fees, expenses per truck' },
  { key: 'deliveries', label: 'Deliveries', blurb: 'Incoming trucks, received / damaged / short, delivery losses' },
  { key: 'warehouse', label: 'Warehouse', blurb: 'Stock on hand and cover, stock on the road, warehouse expenses, re-exports' },
  { key: 'sales', label: 'Sales', blurb: 'Cash / credit / batch sales, top products and customers, balances' },
  { key: 'admin', label: 'Admin & alerts', blurb: 'Alerts centre, users and logins, audit log' },
];
/** Audiences: dir = Daniel, Michael · kab = Kabonge (planner) · tf = Testfie (truck follow-up) · ld = loaders · rcv = Asie, Yonas · rx = Asie (re-export). */
export type Who = 'dir' | 'kab' | 'tf' | 'ld' | 'rcv' | 'rx';
export type DashKey =
  | 'director-today'
  | 'exec-overview' | 'combined-performance' | 'profit-margin' | 'landed-product' | 'landed-truck' | 'selling-price' | 'fast-slow'
  | 'po-pipeline' | 'ordered-loaded-delivered' | 'open-orders' | 'plan-vs-actual'
  | 'loading-list' | 'loading-status' | 'dispatched-today'
  | 'fleet-board' | 'delayed-trucks' | 'truck-issues' | 'driver-updates' | 'border-stops'
  | 'agreed-vs-actual' | 'fee-payments' | 'unpaid-fees' | 'truck-expenses'
  | 'incoming' | 'received-damaged-short' | 'delivery-losses'
  | 'stock-on-hand' | 'stock-in-transit' | 'warehouse-expenses' | 'reexports'
  | 'sales-summary' | 'customer-balances'
  | 'alerts' | 'users-logins' | 'audit-log';
export interface DashDef {
  key: DashKey; id: string; title: string; group: DashGroup; who: Who[];
  /** the business question it answers */ question: string; /** the visual */ visual: string;
  /** an existing screen it opens (drill-down) */ link?: string;
  /** computed in the browser from an existing endpoint (no builder here) */ client?: boolean;
}
const d = (key: DashKey, id: string, title: string, group: DashGroup, who: Who[], question: string, visual: string, link?: string, client?: boolean): DashDef => ({ key, id, title, group, who, question, visual, link, client });
export const DASHBOARDS: DashDef[] = [
  d('director-today', 'C-05', 'Today', 'home', ['dir'], 'What needs a director\'s decision today, and where does the business stand?', 'KPI strip with sparklines, daily sales and profit, decision list, stock health, sales by company / warehouse, top products'),
  d('exec-overview', 'C-P1-01', 'Executive overview', 'business', ['dir'], 'Where does the business stand today?', 'KPI scorecard + exception list', '#/notifications'),
  d('combined-performance', 'C-P1-02', 'Combined performance', 'business', ['dir'], 'Quantity, landed cost, sales, profit and margin at product / warehouse / company / business level', 'Link card + level report', '#/performance'),
  d('profit-margin', 'C-P1-03', 'Profit and margin', 'business', ['dir'], 'How do sales become profit, month by month?', 'Waterfall + monthly stacked columns with a margin line', '#/performance'),
  d('landed-product', 'C-P1-04', 'Landed cost per product', 'business', ['dir'], 'What makes up landed cost per case?', 'Horizontal stacked bars (goods, truck, warehouse)', '#/performance'),
  d('landed-truck', 'C-P1-05', 'Landed cost per truck', 'business', ['dir'], 'What did each truck cost, and which are above average?', 'Stacked bar per truck + table', '#/finance'),
  d('selling-price', 'C-P1-06', 'Selling price & target margin', 'business', ['dir'], 'Are selling prices meeting the target margin?', 'Gauge + link to the calculator', '#/selling-prices'),
  d('fast-slow', 'C-X-01', 'Fast and slow products', 'business', ['dir'], 'Which products are slow and overstocked?', 'Quadrant scatter (sales speed × days of stock)', '#/analytics'),
  d('po-pipeline', 'C-P1-07', 'Purchase order pipeline', 'purchasing', ['dir', 'kab'], 'How many orders sit at each stage?', 'Stage bars (count + value); click a stage for its orders', '#/pos'),
  d('ordered-loaded-delivered', 'C-P1-08', 'Ordered vs loaded vs delivered', 'purchasing', ['dir', 'kab'], 'Where do quantities go missing?', 'Grouped bars + gap table', '#/pos'),
  d('open-orders', 'C-P2', 'Open orders', 'purchasing', ['dir', 'kab'], 'Which orders are raised but not loaded, and for how long?', 'Sorted table with age bands', '#/pos'),
  d('plan-vs-actual', 'C-P2', 'Plan vs actual', 'purchasing', ['dir', 'kab'], 'Is purchasing following the period plan?', 'Plan used vs expected', '#/reports?r=pv', true),
  d('loading-list', 'C-P1-09', "Today's loading list", 'loading', ['ld', 'tf', 'dir'], 'What do I load today?', 'Cards with status chips — no prices', '#/loading'),
  d('loading-status', 'C-P1-10', 'Loading status', 'loading', ['dir', 'kab'], 'How far is each order loaded, with documents and photos?', 'Progress bar per order + document / photo icons', '#/loading'),
  d('dispatched-today', 'C-P2', 'Dispatched today', 'loading', ['ld', 'dir'], 'Which trucks left in the last 24 hours?', 'List grouped by loading point + count tiles', '#/shipments'),
  d('fleet-board', 'C-P1-11', 'Live fleet board', 'fleet', ['dir', 'tf'], 'Where is every truck?', 'Kanban by status, grouped by route; stale positions faded', '#/trucks'),
  d('delayed-trucks', 'C-P1-12', 'Delayed trucks', 'fleet', ['dir', 'tf'], 'Which trucks are late, why, and who acts?', 'Table by days late with a severity bar and owner', '#/shipments?chip=Delayed'),
  d('truck-issues', 'C-P1-13', 'Truck issues', 'fleet', ['dir', 'tf'], 'What is open, and which trucks / providers repeat?', 'Open-issues table + repeat issues by truck and provider', '#/trucks'),
  d('driver-updates', 'C-P1-14', 'Driver status updates', 'fleet', ['tf', 'dir'], 'Which trucks have gone quiet?', 'Timeline feed + last-update badges', '#/tracking'),
  d('border-stops', 'C-X-02', 'Border and stop analysis', 'fleet', ['dir'], 'Where do trucks wait?', 'Heatmap route × stop (average days, trips)', '#/reports?r=logistics'),
  d('agreed-vs-actual', 'C-P1-15', 'Agreed transport price vs actual', 'fees', ['dir', 'tf'], 'Did trucks cost what was agreed?', 'Paired bars per truck + variance', '#/transport-fees'),
  d('fee-payments', 'C-P1-16', 'Transport fee payments', 'fees', ['dir', 'tf'], 'Which fees are paid, part paid or unpaid — against which reference?', 'Table with status chips, progress and reference search', '#/transport-fees'),
  d('unpaid-fees', 'C-P1-17', 'Unpaid and ageing fees', 'fees', ['dir'], 'Who is owed transport fees, and how old are they?', 'Ageing stacked bars by provider', '#/transport-fees'),
  d('truck-expenses', 'C-P1-18', 'Expenses per truck', 'fees', ['dir', 'tf'], 'What does each trip cost, by category and leg?', 'Stacked bar per trip, legs expandable', '#/finance'),
  d('incoming', 'C-P1-19', 'Incoming deliveries', 'deliveries', ['rcv', 'dir'], 'Which trucks are coming to my warehouse, and which wait for acknowledgement?', 'Cards by expected arrival', '#/shipments'),
  d('received-damaged-short', 'C-P1-20', 'Received, damaged, short', 'deliveries', ['rcv', 'dir'], 'What arrived, what was damaged or short?', 'Stacked bar per delivery + photos / signature', '#/shipments?chip=Acknowledged'),
  d('delivery-losses', 'C-X-03', 'Delivery losses by cause', 'deliveries', ['dir', 'rcv'], 'Which causes drive delivery losses?', 'Pareto (bars + cumulative % + 80 % line)', '#/shipments?chip=Acknowledged'),
  d('stock-on-hand', 'C-P1-21', 'Stock on hand', 'warehouse', ['rcv', 'dir'], 'Which stock needs action — running out or not moving?', 'Stock-cover bands + bars against minimum', '#/warehouse-stock'),
  d('stock-in-transit', 'C-P1-22', 'Stock in transit', 'warehouse', ['dir', 'rcv'], 'What is on the road to each warehouse, and when does it arrive?', 'Timeline of expected arrivals + totals per warehouse', '#/shipments'),
  d('warehouse-expenses', 'C-P1-23', 'Warehouse expenses', 'warehouse', ['rcv', 'dir'], 'What do the warehouses spend, by category and month?', 'Stacked monthly columns + category share', '#/warehouse-expenses'),
  d('reexports', 'B-03', 'Re-export orders', 'warehouse', ['rx', 'rcv', 'dir'], 'Where are the Rwanda → Juba re-exports?', 'Status list', '#/re-exports'),
  d('sales-summary', 'C-P1-24', 'Sales summary', 'sales', ['dir'], 'How do cash, credit and batch sales move; who and what sells most?', 'Stacked columns by month + ranked bars', '#/sales'),
  d('customer-balances', 'C-P1-25', 'Customer balances', 'sales', ['dir'], 'Who owes what, and how old is it?', 'Ageing stacked bars per customer', '#/sales?tab=list&status=Unpaid'),
  d('alerts', 'C-P1-28', 'Alerts centre', 'admin', ['dir', 'tf', 'kab'], 'Which alert do I handle first?', 'Triage matrix + prioritised list', '#/notifications'),
  d('users-logins', 'C-P1-26', 'Users and logins', 'admin', ['dir'], 'Who uses the system; who is inactive?', 'Count tiles + table with role chips', '#/users'),
  d('audit-log', 'C-P1-27', 'Audit log', 'admin', ['dir'], 'Who did what and when?', 'Activity sparkline + latest changes', '#/audit', true),
];
export const dashDef = (k: string) => DASHBOARDS.find((x) => x.key === k);

const has = (u: { roles: Role[] }, ...r: Role[]) => u.roles.some((x) => r.includes(x));
const WHO: Record<Who, (u: { roles: Role[] }) => boolean> = {
  dir: (u) => A.isDirector(u), kab: (u) => has(u, 'planner'), tf: (u) => has(u, 'truck_planner'), ld: (u) => has(u, 'loader'), rcv: (u) => has(u, 'receiver'), rx: (u) => has(u, 'reexport'),
};
/** May this person open this dashboard? */
export const canSeeDash = (u: { roles: Role[] }, key: string) => !!dashDef(key)?.who.some((w) => WHO[w](u));
export const dashboardsFor = (u: { roles: Role[] }) => DASHBOARDS.filter((x) => canSeeDash(u, x.key));
/** C-05 home screens (dashboards document §10): each person's own set, in this order. */
export const HOME: Record<Who, DashKey[]> = {
  // Directors' home = one curated daily view (26 Oct 2026); every other dashboard stays on its feature-group tab.
  dir: ['director-today'],
  kab: ['po-pipeline', 'ordered-loaded-delivered', 'open-orders', 'plan-vs-actual', 'alerts'],
  tf: ['fleet-board', 'delayed-trucks', 'truck-issues', 'driver-updates', 'agreed-vs-actual', 'fee-payments', 'truck-expenses', 'loading-list'],
  ld: ['loading-list', 'dispatched-today'],
  rcv: ['incoming', 'received-damaged-short', 'stock-on-hand', 'warehouse-expenses'],
  rx: ['reexports'],
};
export function homeFor(u: { roles: Role[] }): DashKey[] {
  const out: DashKey[] = [];
  for (const w of ['dir', 'kab', 'tf', 'ld', 'rcv', 'rx'] as Who[]) if (WHO[w](u)) for (const k of HOME[w]) if (!out.includes(k) && canSeeDash(u, k)) out.push(k);
  return out;
}

// ======================================================================================================
// INPUT, SCOPE AND FILTERS
// ======================================================================================================
export interface DashFilter { entityId?: ID; supplierId?: ID; routeId?: ID; warehouseId?: ID; productId?: ID; from?: string; to?: string }
export const FILTER_KEYS: (keyof DashFilter)[] = ['entityId', 'supplierId', 'routeId', 'warehouseId', 'productId', 'from', 'to'];
/** Company-wide data of the caller's companies (server: ReportsService.data for the company scope; mock: its database). */
export interface DashSource extends ReportData {
  expenses?: WarehouseExpense[]; sellingPrices?: SellingPrice[]; reexports?: ReexportOrder[];
  /** transport-fee rows the caller may see (null = not for this person) */ fees?: TransportFeeRow[] | null;
  /** user admin rows (directors) */ users?: UserAdmin[] | null;
  /** names and roles of the roster, for owners ("who acts") */ people?: { id: ID; name: string; roles: Role[]; warehouseIds?: ID[]; loadingPointIds?: ID[]; pairs?: { entityId: ID; supplierId: ID }[] }[];
  waiting?: WaitingEntry[]; config?: Pick<AppConfig, 'fees' | 'costs'> & Partial<Pick<AppConfig, 'approvals'>>;
}
export interface Viewer extends A.Subject { id: ID; name?: string }
export interface DashPeriod { from: string; to: string; label: string }
export interface DashResult<T = unknown> {
  key: DashKey; title: string; generatedAt: string;
  /** newest underlying record (null = no records) */ freshness: string | null;
  period: DashPeriod | null; unit: string; currency: 'USD' | null; definition: string;
  /** nothing to show yet (screens say "No data yet") */ empty: boolean;
  /** money left out for this person (loaders, receivers) */ pricesHidden: boolean;
  data: T;
}
export interface DashResponse {
  generatedAt: string; home: DashKey[]; available: DashKey[];
  /** filter options inside the caller's scope */ options: { suppliers: ID[]; routes: ID[]; warehouses: ID[]; products: ID[] };
  results: Partial<Record<DashKey, DashResult>>;
}

const t = (x?: string | null) => (x ? Date.parse(x) : NaN);
const iso = (ms: number) => new Date(ms).toISOString();
const r2 = (x: number) => Math.round(x * 100) / 100;
const r1 = (x: number) => Math.round(x * 10) / 10;
const sum = <T>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0);
const ACTIVE = (l: Leg) => !['Acknowledged', 'Cancelled'].includes(l.status);
/** Government and agent charges — not part of the transport price. */
const NOT_TRANSPORT: CostKind[] = ['Taxes & duties', 'Clearing & forwarding'];
/** Newest of several timestamps (ISO), null when none. */
type Stamp = string | number | null | undefined;
function newest(...xs: (Stamp | Stamp[])[]): string | null {
  let m = -Infinity;
  const one = (x: Stamp) => { const v = typeof x === 'number' ? x : t(x ?? undefined); if (Number.isFinite(v) && v > m) m = v; };
  for (const x of xs) if (Array.isArray(x)) x.forEach(one); else one(x);
  return Number.isFinite(m) ? iso(m) : null;
}
/** Every recorded moment on a leg: check-ins, issues, GPS. */
function legStamps(l: Leg): string[] {
  const out: string[] = [];
  for (const p of l.passes) { if (p.arrivedAt) out.push(p.arrivedAt); if (p.departedAt) out.push(p.departedAt); }
  for (const i of l.issues) { out.push(i.at); if (i.fixedAt) out.push(i.fixedAt); }
  if (l.lastPing?.at) out.push(l.lastPing.at);
  if (l.departedAt) out.push(l.departedAt);
  return out;
}
const lastUpdate = (l: Leg) => newest(legStamps(l));
/** Driver-update gap limits (hours): amber / red — to confirm with the client. */
export const UPDATE_GAP = { amber: 6, red: 12 };
/** Stock cover targets (days): below `min` = stock-out risk; above `max` = slow / overstock — to confirm per product category. */
export const COVER = { min: 14, max: 60 };
/** Customer payment terms (days) before a credit balance is overdue — to confirm. */
export const TERMS_DAYS = MX.TERMS_DAYS;

/** Cut company-wide data down to what one person may see (roles document §7). Prices / money are dropped for loaders,
 *  receivers and drivers; sales and selling prices are directors-only; truck costs for directors and Testfie. */
export function scopeSource(src: DashSource, v: Viewer): DashSource & { pricesHidden: boolean } {
  const dir = A.isDirector(v);
  const feats = new Set<FeatureKey>(featuresFor(v.roles));
  const prices = A.seesPrices(v);
  const lpOfPo = new Map(src.pos.map((p) => [p.id, p.supplierId]));
  const myCps = src.warehouses.filter((w) => v.warehouseIds.includes(w.id)).map((w) => w.checkpointId);
  const myRc = [...new Set(src.warehouses.filter((w) => v.warehouseIds.includes(w.id)).map((w) => w.receivingCompanyId))];
  const shipments = src.shipments.filter((s) => (dir ? A.seesRoute(v, s.legs[0]?.routeId ?? '') || s.legs.some((l) => A.seesRoute(v, l.routeId)) : A.seesShipment(v, s, { loadingPointId: lpOfPo.get(s.poId) ?? null, myWarehouseCps: myCps })));
  const shipIds = new Set(shipments.map((s) => s.id));
  const plans = src.plans.filter((p) => A.orderAccess(v, p, myRc) !== null).map((p) => A.orderFor(v, p, myRc));
  const pos = src.pos.filter((p) => { const pl = src.plans.find((x) => x.id === p.planId); return A.orderAccess(v, { entityId: p.entityId, supplierId: p.supplierId, lines: pl?.lines ?? [] }, myRc) !== null; });
  const loadings = src.loadings.filter((l) => dir || has(v, 'truck_planner') || (has(v, 'planner') && A.seesPair(v, l.entityId, l.loadingPointId)) || (has(v, 'loader') && v.loadingPointIds.includes(l.loadingPointId)))
    .map((l) => (prices ? l : (A.loadingWithoutPrice(l) as typeof l)));
  const moneyTrips = prices && (dir || feats.has('truck-expenses'));
  const whOk = (w: ID) => dir || (has(v, 'receiver') && v.warehouseIds.includes(w));
  const acks = src.acks.filter((a) => shipIds.has(a.shipmentId) && (dir || has(v, 'planner') || (has(v, 'receiver') && v.warehouseIds.includes(a.warehouseId))));
  return {
    ...src, pricesHidden: !prices,
    shipments, plans, pos, loadings, acks,
    costs: moneyTrips ? src.costs.filter((c) => shipIds.has(c.shipmentId)) : [], payments: moneyTrips ? src.payments.filter((p) => shipIds.has(p.shipmentId)) : [],
    sales: feats.has('sales') ? src.sales : [],
    moves: src.moves.filter((m) => whOk(m.warehouseId)),
    stock: src.stock.filter((r) => whOk(r.warehouseId)).map((r) => (prices ? r : { ...r, landedCostPerCase: 0 })),
    priceList: prices ? src.priceList : [],
    periodPlans: dir || has(v, 'planner') ? (src.periodPlans ?? []).map((pp) => (dir ? pp : { ...pp, lines: pp.lines.filter((l) => A.seesPair(v, pp.entityId, l.supplierId)) })) : [],
    expenses: feats.has('warehouse-expenses') ? (src.expenses ?? []).filter((e) => M.seesWarehouse(v, e.warehouseId)) : [],
    sellingPrices: feats.has('selling-prices') ? src.sellingPrices ?? [] : [],
    reexports: feats.has('re-export') ? (src.reexports ?? []).filter((o) => M.seesReexport(v, o)) : [],
    fees: feats.has('transport-fees') ? (src.fees ?? []).filter((f) => shipIds.has(f.shipmentId)) : null,
    users: feats.has('users') ? src.users ?? [] : null,
    waiting: (src.waiting ?? []).filter((w) => A.seesLoadingPoint(v, w.loadingPointId)),
  };
}

/** Dashboard filters inside the scope: supplier (loading point), route, warehouse, product, company. Dates stay with each builder. */
export function narrow<T extends DashSource>(src: T, f: DashFilter): T {
  const { entityId: e, supplierId: s, routeId: r, warehouseId: w, productId: p } = f;
  if (!e && !s && !r && !w && !p) return src;
  const lpOfPo = new Map(src.pos.map((x) => [x.id, x.supplierId]));
  const shOk = (x: Shipment) => (!e || x.entityId === e) && (!s || lpOfPo.get(x.poId) === s) && (!r || x.legs.some((l) => l.routeId === r)) && (!w || x.warehouseId === w || x.fromWarehouseId === w) && (!p || x.legs.some((l) => l.lines.some((ln) => ln.productId === p)));
  const shipments = src.shipments.filter(shOk); const ids = new Set(shipments.map((x) => x.id));
  const planOk = (x: Plan) => (!e || x.entityId === e) && (!s || x.supplierId === s) && (!p || x.lines.some((l) => l.productId === p)) && (!r || x.lines.some((l) => l.routeId === r));
  const plans = src.plans.filter(planOk); const planIds = new Set(plans.map((x) => x.id));
  const whp = (x: { warehouseId: ID; productId?: ID; entityId?: ID }) => (!w || x.warehouseId === w) && (!p || !x.productId || x.productId === p) && (!e || !x.entityId || x.entityId === e);
  return {
    ...src, shipments, plans,
    pos: src.pos.filter((x) => planIds.has(x.planId) || (!p && !r && (!e || x.entityId === e) && (!s || x.supplierId === s))),
    loadings: src.loadings.filter((x) => (!e || x.entityId === e) && (!s || x.loadingPointId === s) && (!p || x.lines.some((l) => l.productId === p))),
    acks: src.acks.filter((a) => ids.has(a.shipmentId)).map((a) => (p ? { ...a, lines: a.lines.filter((l) => l.productId === p) } : a)),
    costs: src.costs.filter((c) => ids.has(c.shipmentId)), payments: src.payments.filter((x) => ids.has(x.shipmentId)),
    sales: src.sales.filter((x) => (!w || x.warehouseId === w) && (!e || x.entityId === e) && (!p || x.lines.some((l) => l.productId === p))).map((x) => (p ? { ...x, lines: x.lines.filter((l) => l.productId === p) } : x)),
    moves: src.moves.filter(whp), stock: src.stock.filter(whp),
    expenses: (src.expenses ?? []).filter((x) => !w || x.warehouseId === w),
    reexports: (src.reexports ?? []).filter((x) => (!w || x.fromWarehouseId === w || x.toWarehouseId === w) && (!e || x.entityId === e)),
    fees: src.fees ? src.fees.filter((x) => ids.has(x.shipmentId)) : src.fees,
    waiting: (src.waiting ?? []).filter((x) => (!s || x.loadingPointId === s) && (!e || x.entityId === e)),
  };
}

/** Filter choices inside the caller's scope (suppliers / routes / warehouses / products they have records for). */
export function filterOptions(src: DashSource, v: Viewer): DashResponse['options'] {
  const dir = A.isDirector(v);
  const suppliers = new Set<ID>(); const routes = new Set<ID>(); const warehouses = new Set<ID>(); const products = new Set<ID>();
  for (const p of src.plans) { suppliers.add(p.supplierId); for (const l of p.lines) { products.add(l.productId); routes.add(l.routeId); } }
  for (const l of src.loadings) suppliers.add(l.loadingPointId);
  for (const s of src.shipments) { warehouses.add(s.warehouseId); for (const l of s.legs) { routes.add(l.routeId); for (const x of l.lines) products.add(x.productId); } }
  for (const m of src.moves) { warehouses.add(m.warehouseId); products.add(m.productId); }
  if (!dir && has(v, 'receiver')) for (const w of [...warehouses]) if (!v.warehouseIds.includes(w)) warehouses.delete(w);
  if (has(v, 'loader') && !dir) for (const s of [...suppliers]) if (!v.loadingPointIds.includes(s)) suppliers.delete(s);
  if (v.routeIds?.length) for (const r of [...routes]) if (!v.routeIds.includes(r)) routes.delete(r);
  return { suppliers: [...suppliers], routes: [...routes], warehouses: [...warehouses], products: [...products] };
}

// ======================================================================================================
// BUILD
// ======================================================================================================
type Src = DashSource & { pricesHidden: boolean };
interface Ctx {
  src: Src; raw: DashSource; v: Viewer; f: DashFilter; now: number;
  period: DashPeriod; prev: DashPeriod; from: number; to: number;
  /** USD, consolidated (scopeReportData) */ usd: ReportData;
  memo: Map<string, unknown>;
}
const memo = <T>(c: Ctx, k: string, fn: () => T): T => { if (!c.memo.has(k)) c.memo.set(k, fn()); return c.memo.get(k) as T; };
/** docs/18: the shared figures (metrics.ts) over this dashboard's scoped, filtered data. */
const fig = (c: Ctx): MX.MetricSource => memo(c, 'fig', () => ({
  now: c.now, shipments: c.src.shipments, stopsOf: names(c.src).stops, loadings: c.src.loadings, pos: c.src.pos,
  stock: c.src.pricesHidden ? undefined : c.src.stock, sales: c.usd.sales, fees: c.src.fees ?? undefined,
  feeDays: { amber: M.feesConfig(c.raw.config).amberDays, red: M.feesConfig(c.raw.config).redDays },
}));
const fleetNow = (c: Ctx) => memo(c, 'fleet', () => MX.fleetFigures({ shipments: c.src.shipments, stopsOf: names(c.src).stops, now: c.now }));
const fmtDay = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const periodOf = (from: number, to: number): DashPeriod => ({ from: iso(from), to: iso(to), label: `${fmtDay(from)} – ${fmtDay(to - 1)}` });

/** Names for ids (from the reference data in the source). */
function names(src: DashSource) {
  const P = new Map(src.products.map((p) => [p.id, p])); const T = new Map(src.trucks.map((x) => [x.id, x])); const R = new Map(src.routes.map((x) => [x.id, x]));
  const W = new Map(src.warehouses.map((x) => [x.id, x])); const S = new Map(src.suppliers.map((x) => [x.id, x])); const C = new Map(src.checkpoints.map((x) => [x.id, x]));
  const Pv = new Map(src.providers.map((x) => [x.id, x])); const D = new Map(src.drivers.map((x) => [x.id, x])); const E = new Map(src.entities.map((x) => [x.id, x]));
  return {
    product: (id: ID) => { const p = P.get(id); return p ? `${p.brand} ${p.pack}`.trim() : id; },
    category: (id: ID) => P.get(id)?.category ?? 'other',
    truck: (id: ID) => T.get(id)?.reg ?? id, truckProvider: (id: ID) => T.get(id)?.providerId ?? null,
    route: (id: ID) => R.get(id)?.name ?? id, stops: (id: ID) => R.get(id)?.stops ?? [],
    warehouse: (id: ID) => W.get(id)?.name ?? id, warehouseCp: (id: ID) => W.get(id)?.checkpointId,
    supplier: (id: ID) => { const s = S.get(id); return s ? `${s.code} ${s.city}` : id; },
    checkpoint: (id?: ID) => (id ? C.get(id)?.name ?? id : ''), checkpointKind: (id: ID) => C.get(id)?.kind,
    provider: (id?: ID | null) => (id ? Pv.get(id)?.name ?? id : 'Unknown provider'), driver: (id: ID) => D.get(id)?.name ?? '',
    entity: (id: ID) => E.get(id)?.shortName ?? id,
  };
}

export function buildDashboards(raw: DashSource, v: Viewer, keys: DashKey[], f: DashFilter = {}): DashResponse {
  const now = raw.now;
  const scoped = narrow(scopeSource(raw, v), f);
  const def = resolvePeriod('last-30', now);
  const from = f.from && Number.isFinite(t(f.from)) ? t(f.from) : t(def.from);
  const to = f.to && Number.isFinite(t(f.to)) ? Math.max(t(f.to), from + DAY) : t(def.to);
  const len = to - from;
  const usd = scopeReportData(scoped, { entityId: f.entityId });
  const c: Ctx = { src: scoped, raw, v, f, now, from, to, period: periodOf(from, to), prev: periodOf(from - len, from), usd, memo: new Map() };
  const results: DashResponse['results'] = {};
  for (const k of keys) {
    const b = BUILDERS[k];
    if (!b || !canSeeDash(v, k)) continue;
    const out = b(c);
    const meta = dashDef(k)!;
    results[k] = { key: k, title: meta.title, generatedAt: iso(now), pricesHidden: scoped.pricesHidden, period: c.period, currency: null, unit: '', ...out } as DashResult;
  }
  return { generatedAt: iso(now), home: homeFor(v), available: dashboardsFor(v).map((x) => x.key), options: filterOptions(scoped, v), results };
}
type Out = Omit<DashResult, 'key' | 'title' | 'generatedAt' | 'pricesHidden' | 'period' | 'currency' | 'unit'> & Partial<Pick<DashResult, 'period' | 'currency' | 'unit'>>;
const out = (data: unknown, o: { definition: string; freshness: string | null; empty: boolean; unit?: string; currency?: 'USD' | null; period?: DashPeriod | null }): Out => ({ data, ...o });

// ---- shared facts --------------------------------------------------------------------------------------------------
/** Performance report (landed cost v2) for a period — directors only (money). */
function perf(c: Ctx, from: number, to: number, level: 'product' | 'company' = 'product'): PerformanceReport | null {
  if (c.src.pricesHidden || !c.src.sales.length && !c.src.costs.length) return null;
  return memo(c, `perf|${from}|${to}|${level}`, () => performanceReport({ ...c.src, expenses: c.src.expenses ?? [], sellingPrices: c.src.sellingPrices ?? [], allocation: c.raw.config?.costs?.allocation ?? 'quantity' },
    { from: iso(from), to: iso(to), entityId: c.f.entityId, warehouseId: c.f.warehouseId, productId: c.f.productId, level }));
}
const months = (now: number, n: number) => {
  const d0 = new Date(now); const out: { key: string; from: number; to: number }[] = [];
  for (let i = n - 1; i >= 0; i--) { const a = Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() - i, 1), b = Math.min(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() - i + 1, 1), now + 1); out.push({ key: new Date(a).toISOString().slice(0, 7), from: a, to: b }); }
  return out;
};

/** Desk rows (truck state, where, ETA) for trucks on visible, unfinished trips. */
function desk(c: Ctx): TruckRow[] {
  return memo(c, 'desk', () => {
    const n = names(c.src);
    const active = c.src.shipments.filter((s) => s.legs.some(ACTIVE));
    const truckIds = new Set(active.flatMap((s) => s.legs.filter(ACTIVE).map((l) => l.truckId)));
    return truckDesk({ trucks: c.src.trucks.filter((x) => truckIds.has(x.id)), providers: c.src.providers, drivers: c.src.drivers, waiting: [], shipments: active, checkpoints: c.src.checkpoints, suppliers: c.src.suppliers, stopsOf: n.stops, now: c.now })
      .filter((r) => r.state !== 'Idle' && r.state !== 'Waiting');
  });
}
const legOf = (c: Ctx, r: TruckRow) => c.src.shipments.find((s) => s.id === r.shipmentId)?.legs.find((l) => l.id === r.legId);
const followUp = (c: Ctx) => c.src.people?.find((p) => p.roles.includes('truck_planner'))?.name ?? 'Truck follow-up officer';
const receiverOf = (c: Ctx, wh: ID) => c.src.people?.find((p) => p.roles.includes('receiver') && p.warehouseIds?.includes(wh))?.name ?? null;
const plannerOf = (c: Ctx, e: ID, s: ID) => c.src.people?.find((p) => p.roles.includes('planner') && (p.pairs ?? []).some((x) => x.entityId === e && x.supplierId === s))?.name ?? null;
const casesOn = (s: Shipment) => sum(s.legs[0]?.lines ?? [], (l) => l.loadedQty);
const finalAck = (c: Ctx, s: Shipment): Acknowledgement | undefined => { const last = s.legs.at(-1); return last?.ackId ? c.src.acks.find((a) => a.id === last.ackId) : undefined; };

/** One purchase order with what was ordered, loaded and delivered, its stage and value. */
interface PoFact {
  id: ID; ref: string; entityId: ID; supplierId: ID; date: string; stage: 'Created' | 'Sent' | 'Loading' | 'On the road' | 'Delivered';
  ordered: number; loaded: number | null; delivered: number | null; trucks: number; trucksLoaded: number; value: number | null;
  docs: number; photos: number; lastAt: string | null; daysWaiting: number | null;
}
function poFacts(c: Ctx): PoFact[] {
  return memo(c, 'po', () => {
    const rawPlans = new Map(c.raw.plans.map((p) => [p.id, p]));
    const rawPos = c.raw.pos;
    const visible = c.src.pos.filter((p) => !p.supersededById && p.status !== 'Deleted' && p.status !== 'Awaiting approval'); // docs/09 §4
    return visible.map((po) => {
      const rootId = po.revisionOf ?? po.id;
      const chain = new Set([rootId, ...rawPos.filter((x) => x.revisionOf === rootId).map((x) => x.id)]);
      // ordered = the latest office version (original or office update), before any revision made at loading (docs/09 §4)
      const root = rawPos.filter((x) => chain.has(x.id) && x.revisionKind !== 'revised at loading').sort((a, b) => (b.revision ?? 0) - (a.revision ?? 0))[0] ?? po;
      const rootPlan = rawPlans.get(root.planId); const curPlan = c.src.plans.find((x) => x.id === po.planId);
      const ordered = sum(rootPlan?.lines ?? curPlan?.lines ?? [], (l) => l.qty);
      const trucks = new Set((rootPlan?.lines ?? curPlan?.lines ?? []).map((l) => l.truckNo)).size;
      const lds = c.src.loadings.filter((l) => chain.has(l.poId));
      const done = lds.filter((l) => l.status === 'Loaded');
      const shs = c.src.shipments.filter((s) => chain.has(s.poId) && !s.fromWarehouseId);
      const acks = shs.map((s) => finalAck(c, s)).filter((a): a is Acknowledgement => !!a);
      // the order's stage = its least advanced truck: still loading (or not started) → Loading / Raised; all loaded and left → Dispatched
      const allDelivered = shs.length > 0 && shs.length >= trucks && shs.every((s) => s.status === 'Acknowledged');
      const left = (s: Shipment) => s.legs.some((l) => l.departedAt || l.passes[0]?.departedAt);
      const stage: PoFact['stage'] = allDelivered ? 'Delivered' : shs.some(left) ? 'On the road' : done.length ? 'Loading' : po.sentAt ? 'Sent' : 'Created';
      const prices = curPlan && !curPlan.pricesHidden && !c.src.pricesHidden;
      const value = prices ? r2(sum(curPlan!.lines, (l) => l.qty * (l.price ?? 0))) : null;
      const docs = lds.flatMap((l) => l.documents ?? []);
      const loadedQty = done.length ? sum(done, (l) => sum(l.lines, (x) => x.loadedQty)) : null;
      const raised = t(po.approvedAt) || t(po.date);
      return {
        id: po.id, ref: po.ref, entityId: po.entityId, supplierId: po.supplierId, date: po.date, stage, ordered, loaded: loadedQty,
        delivered: acks.length ? sum(acks, (a) => sum(a.lines, (l) => l.received)) : null, trucks, trucksLoaded: done.length, value,
        docs: docs.filter((x) => x.kind !== 'photo' && x.kind !== 'signature').length, photos: docs.filter((x) => x.kind === 'photo').length,
        lastAt: newest(po.date, po.approvedAt, done.map((l) => l.loadedAt), acks.map((a) => a.at)),
        daysWaiting: done.length < trucks && Number.isFinite(raised) ? Math.max(0, Math.floor((c.now - raised) / DAY)) : null,
      };
    });
  });
}
const inPeriod = (c: Ctx, at?: string | null) => { const x = t(at); return x >= c.from && x < c.to; };

// ---- alerts (C-P1-28) — derived from the records the person may see ----------------------------------------------------------
export type AlertKind = 'Delay' | 'No update' | 'Not acknowledged' | 'Shortage / damage' | 'Unpaid fee' | 'Agreed price missing' | 'Order waiting' | 'Low stock' | 'No expenses';
export interface DashAlert {
  id: string; kind: AlertKind; severity: 'critical' | 'high' | 'medium' | 'low'; impact: 'High' | 'Medium' | 'Low';
  title: string; detail: string; owner: string | null; due: string | null; status: string; href: string; at: string | null;
}
function alerts(c: Ctx): DashAlert[] {
  return memo(c, 'alerts', () => {
    const n = names(c.src); const out: DashAlert[] = []; const tf = followUp(c);
    for (const r of desk(c)) {
      const leg = legOf(c, r); if (!leg) continue;
      const href = `#/shipments/${r.shipmentId}`;
      const route = n.route(leg.routeId);
      if (r.state === 'Delayed') {
        const issue = r.issues[0]; const late = r.eta && r.eta.state === 'Late' ? r.eta.hours : 0;
        // a stopped truck or one half a day behind is the most urgent thing on the list
        const sev = late >= 12 || issue ? 'critical' : 'high';
        out.push({ id: `delay-${r.legId}`, kind: 'Delay', severity: sev, impact: 'High', title: `${r.truck.reg} ${issue ? `stopped: ${issue.reason}` : `${Math.round(late)} h behind plan`}`, detail: `${route} · ${r.where}`, owner: tf, due: issue?.at ?? iso(c.now - late * H), status: 'Open', href, at: issue?.at ?? lastUpdate(leg) });
      }
      const last = lastUpdate(leg);
      if (r.state !== 'Loading' && r.state !== 'Arrived' && last) {
        const gap = (c.now - t(last)) / H;
        if (gap > UPDATE_GAP.amber) out.push({ id: `quiet-${r.legId}`, kind: 'No update', severity: gap > UPDATE_GAP.red * 2 ? 'high' : gap > UPDATE_GAP.red ? 'medium' : 'low', impact: 'Medium', title: `No update from ${r.truck.reg} for ${Math.round(gap)} h`, detail: `${route} · ${r.where}`, owner: tf, due: iso(t(last) + UPDATE_GAP.red * H), status: 'Open', href, at: last });
      }
      if (r.state === 'Arrived') {
        const arr = leg.passes.at(-1)?.arrivedAt;
        if (arr && c.now - t(arr) > 24 * H) { const wh = c.src.shipments.find((s) => s.id === r.shipmentId)?.warehouseId ?? ''; out.push({ id: `ack-${r.legId}`, kind: 'Not acknowledged', severity: c.now - t(arr) > 72 * H ? 'high' : 'medium', impact: 'Medium', title: `${r.truck.reg} arrived ${Math.round((c.now - t(arr)) / DAY)} d ago, not acknowledged`, detail: `${n.warehouse(wh)} · ${r.shipmentRef}`, owner: receiverOf(c, wh), due: iso(t(arr) + 24 * H), status: 'Waiting for the receiver', href, at: arr }); }
      }
    }
    for (const a of c.src.acks) {
      if (c.now - t(a.at) > 14 * DAY) continue;
      const exp = sum(a.lines, (l) => l.expected), lost = sum(a.lines, (l) => Math.max(0, l.expected - l.received) + l.damaged);
      if (lost <= 0) continue;
      const share = exp ? lost / exp : 0; const sh = c.src.shipments.find((s) => s.id === a.shipmentId);
      const reasons = [...new Set(a.lines.filter((l) => l.reason).map((l) => l.reason))].join(', ');
      out.push({ id: `loss-${a.id}`, kind: 'Shortage / damage', severity: share >= 0.02 || lost >= 50 ? 'high' : 'medium', impact: lost >= 50 ? 'High' : 'Medium', title: `${lost} cases short or damaged — ${sh?.ref ?? a.shipmentId}`, detail: `${n.warehouse(a.warehouseId)}${reasons ? ` · ${reasons}` : ' · no reason given'}`, owner: receiverOf(c, a.warehouseId) ?? a.receiverName, due: iso(t(a.at) + 2 * DAY), status: 'Awaiting review', href: `#/shipments/${a.shipmentId}`, at: a.at });
    }
    for (const x of c.src.fees ?? []) {
      if (x.flag === 'red' || x.flag === 'amber') out.push({ id: `fee-${x.shipmentId}`, kind: 'Unpaid fee', severity: x.flag === 'red' ? 'high' : 'medium', impact: 'Medium', title: `Transport fee ${x.status.toLowerCase()} for ${x.ageDays} days — ${x.ref}`, detail: `${n.provider(x.providerId)} · balance USD ${Math.round(x.balanceUsd ?? 0).toLocaleString('en-US')}`, owner: 'Directors', due: x.loadedAt ? iso(t(x.loadedAt) + (c.raw.config?.fees?.redDays ?? 30) * DAY) : null, status: x.status, href: `#/transport-fees?q=${encodeURIComponent(x.ref)}`, at: x.loadedAt });
      else if (x.status === 'Not recorded' && x.ageDays >= 2 && !x.reexport) out.push({ id: `agreed-${x.shipmentId}`, kind: 'Agreed price missing', severity: 'low', impact: 'Medium', title: `Agreed transport price not recorded — ${x.ref}`, detail: `${n.truck(x.truckId)} · loaded ${x.ageDays} d ago`, owner: tf, due: x.loadedAt ? iso(t(x.loadedAt) + DAY) : null, status: 'Not recorded', href: '#/trucks', at: x.loadedAt });
    }
    for (const p of poFacts(c)) {
      if (p.stage === 'Delivered' || p.daysWaiting === null || p.daysWaiting < 3) continue;
      out.push({ id: `po-${p.id}`, kind: 'Order waiting', severity: p.daysWaiting > 7 ? 'medium' : 'low', impact: p.daysWaiting > 7 ? 'Medium' : 'Low', title: `${p.ref} raised ${p.daysWaiting} d ago, not loaded`, detail: `${n.entity(p.entityId)}–${n.supplier(p.supplierId)} · ${p.ordered.toLocaleString('en-US')} cases`, owner: plannerOf(c, p.entityId, p.supplierId), due: iso(t(p.date) + 7 * DAY), status: 'Waiting to load', href: `#/pos/${p.id}`, at: p.date });
    }
    if (c.src.moves.length) for (const x of stockItems(c).filter((i) => i.cover !== null && i.cover < 7 && i.held > 0).slice(0, 6))
      out.push({ id: `stock-${x.productId}`, kind: 'Low stock', severity: x.cover! < 3 ? 'high' : 'medium', impact: 'High', title: `${x.label}: ${x.cover} days of stock left`, detail: `${x.held} cases held · ${x.perDay} cases/day`, owner: plannerOf(c, '', '') ?? 'Purchasing', due: iso(c.now + Math.max(0, x.cover!) * DAY), status: 'Reorder', href: '#/warehouse-stock', at: null });
    const day = new Date(c.now).getUTCDate();
    if ((c.src.expenses?.length ?? 0) > 0 && day > 7) {
      const month = iso(c.now).slice(0, 7);
      const whs = [...new Set((c.src.expenses ?? []).map((e) => e.warehouseId))];
      for (const w of whs) if (!(c.src.expenses ?? []).some((e) => e.warehouseId === w && e.date.startsWith(month)))
        out.push({ id: `exp-${w}`, kind: 'No expenses', severity: 'low', impact: 'Low', title: `${n.warehouse(w)}: no expense entries this month`, detail: 'Rent, salary, utilities … recorded monthly', owner: receiverOf(c, w), due: null, status: 'Reminder', href: '#/warehouse-expenses', at: null });
    }
    const rank = { critical: 0, high: 1, medium: 2, low: 3 };
    return out.sort((a, b) => rank[a.severity] - rank[b.severity] || t(a.due) - t(b.due));
  });
}
const SEV_COL = (s: DashAlert['severity']) => (s === 'critical' || s === 'high' ? 'High' : s === 'medium' ? 'Medium' : 'Low');

// ---- stock items (quantities only) ---------------------------------------------------------------------------------------------
interface StockItem { productId: ID; label: string; held: number; movedOut: number; damaged: number; short: number; sold30: number; perDay: number; cover: number | null }
function stockItems(c: Ctx): StockItem[] {
  return memo(c, 'stock', () => {
    const n = names(c.src);
    const rows = M.warehouseStock(c.src.moves, c.src.acks, { from: c.now - 30 * DAY, to: c.now + 1 });
    const by = new Map<ID, StockItem>();
    for (const r of rows) {
      const x = by.get(r.productId) ?? { productId: r.productId, label: n.product(r.productId), held: 0, movedOut: 0, damaged: 0, short: 0, sold30: 0, perDay: 0, cover: null };
      x.held += r.held; x.movedOut += r.movedOut + r.transfersOut; x.damaged += r.damaged; x.short += r.short; x.sold30 += r.sold; by.set(r.productId, x);
    }
    return [...by.values()].filter((x) => x.held > 0 || x.sold30 > 0).map((x) => { const perDay = x.sold30 / 30; return { ...x, perDay: r1(perDay), cover: perDay > 0 ? Math.round(Math.max(0, x.held) / perDay) : null }; })
      .sort((a, b) => (a.cover ?? 1e9) - (b.cover ?? 1e9));
  });
}

// ======================================================================================================
// DIRECTORS' TODAY VIEW (C-05, 26 Oct 2026) — one call for the directors' home: four headline figures, daily sales and
// profit, what needs a decision today, stock health, sales by company / warehouse and the top products. Everything comes
// from the same facts as the other dashboards (performance report = landed cost v2, truck desk, alerts, stock items).
// ======================================================================================================
export interface TodayKpi {
  /** null = no records yet (never a fake zero) */ value: number | null; prev: number | null;
  /** daily (or weekly) values for the sparkline, oldest first; null when there is nothing to draw */ spark: (number | null)[] | null;
}
export interface TodayDecision {
  key: 'approvals' | 'trucks' | 'fees' | 'stock' | 'acks' | 'prices';
  label: string; /** null = this person / setup has no data for it */ count: number | null; value: number | null;
  detail: string; owner: string; href: string; severity: 'critical' | 'high' | 'medium' | 'low';
}
export interface TodayData {
  period: DashPeriod; prev: DashPeriod; mtd: boolean;
  sales: TodayKpi; profit: TodayKpi & { margin: number | null; prevMargin: number | null; estimated: boolean };
  cash: TodayKpi & { overdue: number | null; customers: number; collectedShare: number | null };
  trucks: TodayKpi & { delayed: number; arrivingToday: number; onTimeWeek: number | null; arrivedWeek: number };
  daily: { day: string; sales: number | null; profit: number | null }[];
  decisions: TodayDecision[];
  stock: { bands: { key: 'risk' | 'low' | 'healthy' | 'over' | 'nosales'; label: string; cases: number; value: number | null; products: number }[]; value: number | null; cases: number } | null;
  distribution: {
    companies: { entityId: ID; label: string; week: number | null; month: number | null }[];
    warehouses: { warehouseId: ID; label: string; week: number | null; month: number | null }[];
  };
  top: { productId: ID; brand: string; pack: string; warehouses: string[]; perWeek: number; cases: number; revenue: number; margin: number | null; cover: number | null }[];
  targetMargin: number; cover: typeof COVER; terms: number;
}

function directorToday(c: Ctx): Out {
  const n = names(c.src); const now = c.now; const d0 = new Date(now);
  const dayStart = Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), d0.getUTCDate());
  // period: month to date (compared with the same days of last month) unless the filter sets one
  const mtd = !c.f.from;
  const from = mtd ? Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), 1) : c.from;
  const to = mtd ? now + 1 : c.to;
  const pFrom = mtd ? Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() - 1, 1) : t(c.prev.from);
  const pTo = mtd ? Math.min(pFrom + (to - from), from) : t(c.prev.to);
  const period = mtd ? { from: iso(from), to: iso(now), label: `Month to date · ${fmtDay(from)} – ${fmtDay(now)}` } : periodOf(from, to);
  const prev = periodOf(pFrom, pTo);
  const sales = c.usd.sales; const val = (s: (typeof sales)[number]) => sum(s.lines, (l) => l.qty * l.price);
  const inR = (at: string, a: number, b: number) => { const x = t(at); return x >= a && x < b; };

  // ---- daily sales and profit (from 1 Jan, at least 90 days) — profit at each product's landed cost per case ----
  const start = Math.min(Date.UTC(d0.getUTCFullYear(), 0, 1), dayStart - 89 * DAY);
  const pYear = perf(c, start, now + 1);
  const unit = new Map((pYear?.rows ?? []).filter((r) => r.qtySold > 0).map((r) => [r.productId!, r.cogs / r.qtySold]));
  const first = sales.length ? Math.min(...sales.map((s) => t(s.at))) : Infinity;
  const nDays = Math.round((dayStart - start) / DAY) + 1;
  const daily = Array.from({ length: nDays }, (_, i) => ({ day: iso(start + i * DAY).slice(0, 10), sales: null as number | null, profit: null as number | null }));
  for (let i = 0; i < nDays; i++) if (start + (i + 1) * DAY > first) { daily[i].sales = 0; daily[i].profit = 0; }
  for (const s of sales) {
    const i = Math.floor((t(s.at) - start) / DAY); if (i < 0 || i >= nDays) continue;
    for (const l of s.lines) { daily[i].sales! += l.qty * l.price; const u = unit.get(l.productId); if (u !== undefined) daily[i].profit! += l.qty * (l.price - u); }
  }
  for (const x of daily) { if (x.sales !== null) x.sales = r2(x.sales); if (x.profit !== null) x.profit = r2(x.profit); }
  // today is still running: leave it out until its first sale, so the line does not dip to zero every morning
  if (daily.length && !daily.at(-1)!.sales) daily.pop();
  const sparkOf = (k: 'sales' | 'profit') => { const xs = daily.filter((x) => t(x.day) >= from - DAY + 1 && t(x.day) < to).map((x) => x[k]); return xs.filter((x) => x !== null).length >= 2 ? xs : daily.slice(-14).map((x) => x[k]); };

  // ---- sales and profit (landed cost v2) ----
  const cur = perf(c, from, to), old = perf(c, pFrom, pTo);
  const anySales = sales.length > 0;
  const salesK: TodayKpi = { value: anySales ? MX.salesValue(sales, { from, to }) : null, prev: anySales && pFrom >= first - 31 * DAY ? MX.salesValue(sales, { from: pFrom, to: pTo }) : null, spark: anySales ? sparkOf('sales') : null };
  const profitK = {
    value: MX.profitOf(cur), prev: MX.profitOf(old), spark: anySales ? sparkOf('profit') : null,
    margin: MX.marginOf(cur), prevMargin: MX.marginOf(old), estimated: !!cur?.totals.estimated,
  };

  // ---- cash to collect: open customer balances (overdue after the payment terms) ----
  const open = MX.openSales(sales, now);
  const weeks = Array.from({ length: 8 }, (_, i) => now - (8 - i) * 7 * DAY);
  const soldPeriod = sum(sales.filter((s) => inR(s.at, from, to)), val);
  const paidPeriod = sum(sales.filter((s) => inR(s.at, from, to)), (s) => Math.min(s.paid, val(s)));
  const cashK = {
    value: anySales ? MX.owedByCustomers(sales, now) : null, prev: null,
    // open balance left from the sales of each of the last 8 weeks
    spark: anySales ? weeks.map((w) => r2(sum(open.filter((x) => t(x.s.at) >= w && t(x.s.at) < w + 7 * DAY), (x) => x.bal))) : null,
    overdue: anySales ? MX.overdueByCustomers(sales, now) : null, customers: new Set(open.map((x) => x.s.customer)).size,
    collectedShare: soldPeriod > 0 ? r2(paidPeriod / soldPeriod * 100) / 100 : null,
  };

  // ---- trucks on the road (now, and at the end of each of the last 14 days) ----
  // docs/18: trucks on the road / delayed / arriving today now (metrics.fleetFigures); the trend counts trips on the
  // road at the end of each day (metrics.onRoadAt); on time = deliveries of the last 7 days (metrics.onTimeShare)
  const fl = fleetNow(c); const ships = c.src.shipments;
  const anyTrips = ships.some((s) => s.legs.some((l) => l.status !== 'Cancelled'));
  const week = { from: now - 7 * DAY, to: now + 1 };
  const trucksK = {
    value: anyTrips ? fl.onRoad : null, prev: anyTrips ? MX.onRoadAt(ships, now - 7 * DAY) : null,
    spark: anyTrips ? Array.from({ length: 14 }, (_, i) => MX.onRoadAt(ships, dayStart - (13 - i) * DAY + DAY - 1)).map((x, i, a) => (i === a.length - 1 ? fl.onRoad : x)) : null,
    delayed: fl.delayed, arrivingToday: fl.arrivingToday,
    onTimeWeek: MX.onTimeShare(ships, week), arrivedWeek: MX.deliveredIn(ships, week).length,
  };

  // ---- stock health (cases by days of cover; value at landed cost) ----
  const items = stockItems(c).filter((x) => x.held > 0);
  const now30 = perf(c, now - 30 * DAY, now + 1);
  const unitNow = new Map((now30?.rows ?? []).filter((r) => r.stockOnHand > 0 && r.stockValue !== null).map((r) => [r.productId!, r.stockValue! / r.stockOnHand]));
  const BANDS: { key: 'risk' | 'low' | 'healthy' | 'over' | 'nosales'; label: string; ok: (cv: number | null) => boolean }[] = [
    { key: 'risk', label: 'At risk (≤ 7 days)', ok: (x) => x !== null && x <= 7 },
    { key: 'low', label: `Low (8–${COVER.min} days)`, ok: (x) => x !== null && x > 7 && x <= COVER.min },
    { key: 'healthy', label: `Healthy (${COVER.min + 1}–${COVER.max} days)`, ok: (x) => x !== null && x > COVER.min && x <= COVER.max },
    { key: 'over', label: `Overstocked (> ${COVER.max} days)`, ok: (x) => x !== null && x > COVER.max },
    { key: 'nosales', label: 'No sales in 30 days', ok: (x) => x === null },
  ];
  const vOf = (x: StockItem) => (unitNow.has(x.productId) ? x.held * unitNow.get(x.productId)! : null);
  const stock = items.length ? {
    bands: BANDS.map((b) => { const xs = items.filter((x) => b.ok(x.cover)); const vs = xs.map(vOf); return { key: b.key, label: b.label, cases: sum(xs, (x) => x.held), products: xs.length, value: vs.some((v) => v !== null) ? r2(sum(vs, (v) => v ?? 0)) : null }; }),
    value: items.some((x) => vOf(x) !== null) ? r2(sum(items, (x) => vOf(x) ?? 0)) : null, cases: sum(items, (x) => x.held),
  } : null;

  // ---- sales by company and by warehouse (last 7 days; the period) ----
  const weekFrom = now - 7 * DAY;
  const ents = (c.raw.entityScope?.length ? c.raw.entityScope : [...new Set(sales.map((s) => s.entityId))]).filter((e) => !c.f.entityId || e === c.f.entityId);
  const by = <K extends 'entityId' | 'warehouseId'>(k: K, id: ID) => { const xs = sales.filter((s) => s[k] === id); return xs.length ? { week: r2(sum(xs.filter((s) => inR(s.at, weekFrom, now + 1)), val)), month: r2(sum(xs.filter((s) => inR(s.at, from, to)), val)) } : { week: null, month: null }; };
  const whIds = [...new Set([...c.src.warehouses.map((w) => w.id)])].filter((w) => !c.f.warehouseId || w === c.f.warehouseId);
  const distribution = {
    companies: ents.map((e) => ({ entityId: e, label: n.entity(e), ...by('entityId', e) })).sort((a, b) => (b.month ?? -1) - (a.month ?? -1)),
    warehouses: whIds.map((w) => ({ warehouseId: w, label: c.src.warehouses.find((x) => x.id === w)?.town ?? n.warehouse(w), ...by('warehouseId', w) })).sort((a, b) => (b.month ?? -1) - (a.month ?? -1)),
  };

  // ---- top products of the period ----
  const P = new Map(c.src.products.map((p) => [p.id, p]));
  const coverOf = new Map(stockItems(c).map((x) => [x.productId, x.cover]));
  const wks = Math.max(1, (Math.min(to, now) - from) / (7 * DAY));
  const top = (cur?.rows ?? []).filter((r) => r.qtySold > 0).slice(0, 8).map((r) => {
    const whs = [...new Set(sales.filter((s) => inR(s.at, from, to) && s.lines.some((l) => l.productId === r.productId)).map((s) => s.warehouseId))];
    return { productId: r.productId!, brand: P.get(r.productId!)?.brand ?? n.product(r.productId!), pack: /confirm/i.test(P.get(r.productId!)?.pack ?? '') ? '' : P.get(r.productId!)?.pack ?? '', warehouses: whs.map((w) => c.src.warehouses.find((x) => x.id === w)?.town ?? n.warehouse(w)), perWeek: r1(r.qtySold / wks), cases: r.qtySold, revenue: r.revenue, margin: r.margin, cover: coverOf.get(r.productId!) ?? null };
  });

  // ---- what needs a decision today ----
  const al = alerts(c); const tf = followUp(c); const target = cur?.targetMargin ?? pYear?.targetMargin ?? 0.2;
  const pend = c.src.payments.filter((p) => p.status === 'Pending approval');
  const late = al.filter((a) => a.kind === 'Delay'), quiet = al.filter((a) => a.kind === 'No update' && a.severity !== 'low');
  const redFees = c.src.fees ? c.src.fees.filter((x) => x.flag === 'red') : null;
  const risk = items.filter((x) => x.cover !== null && x.cover < COVER.min);
  const noAck = al.filter((a) => a.kind === 'Not acknowledged');
  const sellers = (cur?.rows ?? []).filter((r) => r.qtySold > 0).slice(0, 10);
  const badPrice = sellers.filter((r) => r.sellingPrice === null || (r.marginAtPrice !== null && r.marginAtPrice < target));
  const redDays = c.raw.config?.fees?.redDays ?? 30;
  const decisions: TodayDecision[] = [
    { key: 'approvals', label: 'Truck payments to approve', count: pend.length, value: pend.length ? r2(sum(pend, (p) => p.amountUsd ?? p.amount)) : null, detail: pend.length ? `Oldest ${day(pend.map((p) => p.at).sort()[0])}` : 'Nothing waiting', owner: 'Directors', href: '#/finance', severity: pend.length ? 'high' : 'low' },
    { key: 'trucks', label: 'Delayed or silent trucks', count: late.length + quiet.length, value: null, detail: late.length + quiet.length ? [late.length && `${late.length} delayed`, quiet.length && `${quiet.length} silent > ${UPDATE_GAP.red} h`].filter(Boolean).join(' · ') : 'Every truck on plan', owner: tf, href: '#/dashboards/fleet', severity: late.some((a) => a.severity === 'critical') ? 'critical' : late.length ? 'high' : quiet.length ? 'medium' : 'low' },
    { key: 'fees', label: `Fees unpaid > ${redDays} days`, count: redFees ? redFees.length : null, value: redFees?.length ? r2(sum(redFees, (x) => Math.max(0, x.balanceUsd ?? 0))) : null, detail: redFees === null ? 'No fee data' : redFees.length ? [...new Set(redFees.map((x) => n.provider(x.providerId)))].slice(0, 2).join(', ') : 'No old balances', owner: 'Directors · accounts', href: '#/transport-fees', severity: redFees?.length ? 'high' : 'low' },
    { key: 'stock', label: `Stock under ${COVER.min} days`, count: c.src.moves.length ? risk.length : null, value: null, detail: risk.length ? risk.slice(0, 2).map((x) => `${x.label} ${x.cover} d`).join(' · ') : c.src.moves.length ? 'Cover above the minimum' : 'No stock records', owner: c.src.people?.find((p) => p.roles.includes('planner'))?.name ?? 'Purchasing', href: '#/warehouse-stock', severity: risk.some((x) => (x.cover ?? 99) <= 7) ? 'high' : risk.length ? 'medium' : 'low' },
    { key: 'acks', label: 'Not signed for > 24 h', count: noAck.length, value: null, detail: noAck.length ? noAck.slice(0, 2).map((a) => a.detail.split(' · ')[0]).join(', ') : 'Every arrival signed', owner: [...new Set(noAck.map((a) => a.owner).filter(Boolean))].join(', ') || 'Receivers', href: '#/shipments', severity: noAck.some((a) => a.severity === 'high') ? 'high' : noAck.length ? 'medium' : 'low' },
    { key: 'prices', label: 'Top sellers below target', count: cur ? badPrice.length : null, value: null, detail: badPrice.length ? `${badPrice.filter((r) => r.sellingPrice === null).length} no price · ${badPrice.filter((r) => r.sellingPrice !== null).length} under ${Math.round(target * 100)} % margin` : cur ? `Top ${sellers.length} priced at target` : 'No sales yet', owner: 'Directors', href: '#/selling-prices', severity: badPrice.length ? 'medium' : 'low' },
  ];
  const rank = { critical: 0, high: 1, medium: 2, low: 3 };
  decisions.sort((a, b) => Number(!(a.count ?? 0)) - Number(!(b.count ?? 0)) || rank[a.severity] - rank[b.severity]);

  const data: TodayData = { period, prev, mtd, sales: salesK, profit: profitK, cash: cashK, trucks: trucksK, daily, decisions, stock, distribution, top, targetMargin: target, cover: COVER, terms: TERMS_DAYS };
  return out(data, {
    definition: `Sales = cases × price (USD at the approved month rate; sales between our own companies removed in the Group view), ${mtd ? 'month to date against the same days of last month' : 'the chosen period against the one before'}. Profit = sales − cost of units sold at landed cost v2 (goods + truck + warehouse share) − other warehouse costs; margin = profit ÷ sales. Daily profit uses each product's landed cost per case since ${fmtDay(start)}. Cash to collect = unpaid and part-paid sales; overdue after ${TERMS_DAYS} days. ${MX.METRICS.onRoad.label}: ${MX.METRICS.onRoad.definition} ${MX.METRICS.onTime.label}: ${MX.METRICS.onTime.definition} ${MX.METRICS.stockValue.label}: ${MX.METRICS.stockValue.definition}`,
    currency: 'USD', unit: 'USD · trucks · cases', period,
    freshness: newest(sales.map((s) => s.at), desk(c).map((r) => r.lastMoveAt), c.src.moves.map((m) => m.at), pend.map((p) => p.at)),
    empty: !anySales && !anyTrips && !items.length,
  });
}
const day = (at?: string) => (at ? fmtDay(t(at)) : '—');

// ======================================================================================================
// BUILDERS (one per dashboard)
// ======================================================================================================
const BUILDERS: Partial<Record<DashKey, (c: Ctx) => Out>> = {
  'director-today': directorToday,
  // C-P1-01 ----------------------------------------------------------------------------------------------------
  'exec-overview': (c) => {
    const cur = perf(c, c.from, c.to), prev = perf(c, t(c.prev.from), t(c.prev.to));
    const rows = desk(c); const fl = fleetNow(c);
    // docs/18: orders awaiting loading = live orders with a truck still to load (metrics.ordersToLoad)
    const toLoad = new Set(MX.trucksToLoad(c.src.loadings, c.src.pos).map((l) => l.poId));
    const waiting = poFacts(c).filter((p) => toLoad.has(p.id));
    const al = alerts(c); const high = al.filter((a) => a.severity === 'critical' || a.severity === 'high');
    // weekly sales for the trend line (8 weeks to now)
    const weeks = Array.from({ length: 8 }, (_, i) => c.to - (8 - i) * 7 * DAY);
    const salesTrend = c.usd.sales.length ? weeks.map((w) => r2(sum(c.usd.sales.filter((s) => t(s.at) >= w && t(s.at) < w + 7 * DAY), (s) => sum(s.lines, (l) => l.qty * l.price)))) : null;
    const stockValue = c.src.pricesHidden ? null : MX.stockValue(c.src.stock);
    const kpis = [
      { key: 'onRoad', label: MX.METRICS.onRoad.label, value: fl.onRoad, prev: null, unit: 'count', note: `${fl.delayed} delayed`, status: fl.delayed ? 'bad' : 'good', href: '#/trucks' },
      { key: 'delayed', label: 'Delayed trucks', value: fl.delayed, prev: null, unit: 'count', upIsGood: false, status: fl.delayed ? 'bad' : 'good', href: '#/shipments?chip=Delayed' },
      { key: 'waiting', label: MX.METRICS.ordersToLoad.label, value: MX.ordersToLoad(c.src.loadings, c.src.pos), prev: null, unit: 'count', upIsGood: false, note: `${waiting.filter((p) => (p.daysWaiting ?? 0) > 7).length} over 7 days`, href: '#/pos' },
      { key: 'sales', label: 'Sales', value: cur ? cur.totals.revenue : null, prev: prev ? prev.totals.revenue : null, unit: 'usd', changeKind: 'pct', trend: salesTrend, href: '#/sales' },
      { key: 'profit', label: 'Profit', value: MX.profitOf(cur), prev: MX.profitOf(prev), unit: 'usd', changeKind: 'pct', note: cur?.totals.estimated ? 'part estimated' : undefined, href: '#/performance' },
      { key: 'margin', label: 'Margin', value: MX.marginOf(cur), prev: MX.marginOf(prev), unit: 'pct', changeKind: 'pp', href: '#/performance' },
      { key: 'stock', label: 'Stock value', value: stockValue, prev: null, unit: 'usd', note: 'at landed cost', href: '#/warehouse-stock' },
      { key: 'alerts', label: 'Open alerts', value: al.length, prev: null, unit: 'count', upIsGood: false, note: `${high.length} high priority`, status: high.length ? 'warn' : 'good', href: '#/dashboards/admin' },
    ];
    const exceptions = al.filter((a) => a.kind === 'Delay' || a.severity === 'critical' || a.severity === 'high').slice(0, 12);
    return out({ kpis, exceptions, previous: c.prev }, {
      definition: `Each figure separate. Sales, profit (after truck, warehouse and other costs, landed cost v2) and margin compare with the previous period of the same length; the other figures are as of now. ${MX.METRICS.onRoad.label}: ${MX.METRICS.onRoad.definition} ${MX.METRICS.ordersToLoad.label}: ${MX.METRICS.ordersToLoad.definition} ${MX.METRICS.stockValue.label}: ${MX.METRICS.stockValue.definition} Exceptions = delayed trucks and high-priority alerts.`,
      currency: 'USD', unit: 'USD · trucks · orders', freshness: newest(c.usd.sales.map((s) => s.at), rows.map((r) => r.lastMoveAt), al.map((a) => a.at)), empty: false,
    });
  },
  // C-P1-02 (link) -----------------------------------------------------------------------------------------------
  'combined-performance': (c) => {
    const p = perf(c, c.from, c.to);
    const tt = p?.totals;
    return out(tt ? { revenue: tt.revenue, profit: p!.netProfit, margin: tt.margin, qtyReceived: tt.qtyReceived, landedCost: tt.landedCost, landedPerUnit: tt.landedPerUnit, qtySold: tt.qtySold } : null, {
      definition: 'Totals of the combined performance report (product / warehouse / company / receiving company / business). Open it to switch level.', currency: 'USD', unit: 'USD · cases',
      freshness: p ? newest(c.usd.sales.map((s) => s.at), c.usd.acks.map((a) => a.at)) : null, empty: !tt || (!tt.revenue && !tt.qtyReceived),
    });
  },
  // C-P1-03 ----------------------------------------------------------------------------------------------------
  'profit-margin': (c) => {
    const p = perf(c, c.from, c.to);
    const ms = months(c.now, 6).map((m) => { const q = perf(c, m.from, m.to); const tt = q?.totals; return { month: m.key, revenue: tt?.revenue ?? 0, goods: tt ? tt.cogsGoods : 0, expenses: q ? r2(tt!.cogsTruck + tt!.cogsWarehouse + q.otherCosts) : 0, profit: q?.netProfit ?? 0, margin: tt && tt.revenue ? r2(q!.netProfit / tt.revenue) : null }; });
    const byCompany = perf(c, c.from, c.to, 'company')?.rows.map((r) => ({ entityId: r.entityId, revenue: r.revenue, profit: r.profit, margin: r.margin })) ?? [];
    return out({ waterfall: p?.waterfall ?? [], months: ms, byCompany, estimated: !!p?.totals.estimated }, {
      definition: 'Sales less cost of units sold (goods, truck, warehouse share at landed cost v2) and other warehouse costs not in any landed cost = profit. Margin = profit ÷ sales. Monthly columns: goods cost, truck + warehouse + other, profit; line = margin %.',
      currency: 'USD', unit: 'USD', freshness: newest(c.usd.sales.map((s) => s.at)), empty: !p || !p.totals.revenue,
    });
  },
  // C-P1-04 ----------------------------------------------------------------------------------------------------
  'landed-product': (c) => {
    const n = names(c.src); const p = perf(c, c.from, c.to);
    const rows = (p?.rows ?? []).filter((r) => r.qtyReceived > 0).sort((a, b) => b.qtyReceived - a.qtyReceived).slice(0, 12)
      .map((r) => ({ productId: r.productId!, label: n.product(r.productId!), qty: r.qtyReceived, goods: r2(r.goodsCost / r.qtyReceived), truck: r2(r.truckCost / r.qtyReceived), warehouse: r2(r.warehouseCost / r.qtyReceived), total: r.landedPerUnit }));
    return out({ rows, allocation: p?.allocation ?? 'quantity' }, {
      definition: 'Landed cost per case received good = (goods at PO price + truck costs of the shipment split by cases + the warehouse\'s monthly expenses spread over what it received) ÷ cases received less damaged. The 12 products received most in the period.',
      currency: 'USD', unit: 'USD per case', freshness: newest(c.usd.acks.map((a) => a.at)), empty: !rows.length,
    });
  },
  // C-P1-05 ----------------------------------------------------------------------------------------------------
  'landed-truck': (c) => {
    const n = names(c.src); const kinds: CostKind[] = ['Transport', 'Taxes & duties', 'Clearing & forwarding', 'Loading & offloading', 'Storage', 'Other'];
    const trips = c.usd.shipments.filter((s) => s.legs[0] && inPeriod(c, s.legs[0].departedAt ?? s.legs[0].passes[0]?.departedAt ?? s.legs[0].plannedArrival));
    const by = new Map<ID, { truckId: ID; trips: number; cases: number; byKind: Record<string, number>; notRecorded: number }>();
    for (const s of trips) {
      const costs = c.usd.costs.filter((x) => x.shipmentId === s.id); const k = s.legs[0].truckId;
      const r = by.get(k) ?? { truckId: k, trips: 0, cases: 0, byKind: Object.fromEntries(kinds.map((x) => [x, 0])), notRecorded: 0 };
      r.trips++; r.cases += casesOn(s); if (!costs.some((x) => x.kind === 'Transport')) r.notRecorded++;
      for (const x of costs) r.byKind[x.kind] = r2((r.byKind[x.kind] ?? 0) + (x.amountUsd ?? x.amount));
      by.set(k, r);
    }
    const rows = [...by.values()].map((r) => { const total = r2(sum(kinds, (k) => r.byKind[k] ?? 0)); return { ...r, truck: n.truck(r.truckId), provider: n.provider(n.truckProvider(r.truckId)), total, perCase: r.cases && total ? r2(total / r.cases) : null }; })
      .filter((r) => r.total > 0 || r.notRecorded).sort((a, b) => b.total - a.total);
    const priced = rows.filter((r) => r.perCase !== null); const avg = priced.length ? r2(sum(priced, (r) => r.total) / sum(priced, (r) => r.cases)) : null;
    return out({ kinds, rows: rows.map((r) => ({ ...r, aboveAverage: avg !== null && r.perCase !== null && r.perCase > avg * 1.1 })), avgPerCase: avg }, {
      definition: 'All trip costs of trucks that left in the period (agreed transport, taxes and duties, clearing and forwarding, loading and offloading, storage, other — every leg), in USD at the approved month rate. Above average = cost per case more than 10 % over the average.',
      currency: 'USD', unit: 'USD per truck', freshness: newest(trips.map((s) => s.legs[0].departedAt)), empty: !rows.length,
    });
  },
  // C-P1-06 (link + gauge) -------------------------------------------------------------------------------------------
  'selling-price': (c) => {
    const p = perf(c, c.from, c.to);
    const priced = (p?.rows ?? []).filter((r) => r.sellingPrice !== null && r.marginAtPrice !== null);
    const target = p?.targetMargin ?? 0.2;
    const below = priced.filter((r) => r.marginAtPrice! < target);
    const n = names(c.src);
    return out({ target, products: priced.length, below: below.length, avgMargin: priced.length ? r2(sum(priced, (r) => r.marginAtPrice!) / priced.length * 100) / 100 : null,
      worst: below.sort((a, b) => a.marginAtPrice! - b.marginAtPrice!).slice(0, 5).map((r) => ({ productId: r.productId, label: n.product(r.productId!), price: r.sellingPrice, landed: r.landedPerUnit, margin: r.marginAtPrice, needed: r.priceForTarget })) }, {
      definition: 'Margin at today\'s selling price = (selling price − landed cost per case) ÷ selling price, per product with a selling price. Price for the target margin = landed cost ÷ (1 − target). Set prices in the calculator.',
      currency: 'USD', unit: 'USD per case · %', freshness: newest((c.src.sellingPrices ?? []).map((s) => s.at)), empty: !priced.length,
    });
  },
  // C-X-01 -----------------------------------------------------------------------------------------------------
  'fast-slow': (c) => {
    const n = names(c.src); const p = perf(c, c.from, c.to); const days = Math.max(1, (c.to - c.from) / DAY);
    const all = (p?.rows ?? []).filter((r) => r.stockOnHand > 0 || r.qtySold > 0);
    const pts = all.filter((r) => r.qtySold > 0).map((r) => { const perDay = r.qtySold / days; return { id: r.productId!, label: n.product(r.productId!), x: r2(perDay), y: Math.round(Math.max(0, r.stockOnHand) / perDay), size: r.stockValue ?? 0, group: n.category(r.productId!) }; });
    const xs = pts.map((x) => x.x).sort((a, b) => a - b);
    return out({ points: pts, xThreshold: xs.length ? xs[Math.floor(xs.length / 2)] : null, yThreshold: COVER.max, noSales: all.filter((r) => r.qtySold === 0 && r.stockOnHand > 0).map((r) => ({ productId: r.productId, label: n.product(r.productId!), held: r.stockOnHand })) }, {
      definition: `Sales speed = cases sold per day in the period. Days of stock = cases held now ÷ sales speed. Slow = below the median speed; overstocked = more than ${COVER.max} days. Products with stock and no sales are listed apart (no speed to plot).`,
      currency: 'USD', unit: 'cases/day · days', freshness: newest(c.usd.sales.map((s) => s.at)), empty: !pts.length,
    });
  },
  // C-P1-07 ----------------------------------------------------------------------------------------------------
  'po-pipeline': (c) => {
    const n = names(c.src);
    // docs/09 §4: no drafts — POs awaiting a director (approvals on) come first, then Created → Sent → Loading → On the road → Delivered
    const awaiting = c.src.pos.filter((p) => p.status === 'Awaiting approval' && !p.supersededById).map((po) => ({ po, lines: c.src.plans.find((x) => x.id === po.planId)?.lines ?? [] }));
    const facts = poFacts(c).filter((p) => p.stage !== 'Delivered' || inPeriod(c, p.lastAt) || inPeriod(c, p.date));
    const price = !c.src.pricesHidden;
    const stage = (label: string, items: { id: ID; ref: string; href: string; cases: number; value: number | null; pair: string; date: string }[]) => ({ label, count: items.length, value: price ? r2(sum(items, (x) => x.value ?? 0)) : null, items });
    const of = (s: PoFact['stage']) => facts.filter((p) => p.stage === s).map((p) => ({ id: p.id, ref: p.ref, href: `#/pos/${p.id}`, cases: p.ordered, value: p.value, pair: `${n.entity(p.entityId)}–${n.supplier(p.supplierId)}`, date: p.date }));
    const stages = [
      ...(c.raw.config?.approvals?.purchaseOrders || awaiting.length ? [stage('Awaiting approval', awaiting.map(({ po: p, lines }) => ({ id: p.id, ref: p.ref, href: `#/pos/${p.id}`, cases: sum(lines, (l) => l.qty), value: price ? r2(sum(lines, (l) => l.qty * (l.price ?? 0))) : null, pair: `${n.entity(p.entityId)}–${n.supplier(p.supplierId)}`, date: p.date })))] : []),
      stage('Created', of('Created')), stage('Sent to supplier', of('Sent')), stage('Loading', of('Loading')), stage('On the road', of('On the road')), stage('Delivered', of('Delivered')),
    ];
    return out({ stages }, {
      definition: 'Each purchase order (latest revision) at its current stage: Awaiting approval = a director still has to approve it (only when approval is switched on); Created = issued, not yet emailed to the supplier; Sent to supplier = emailed, nothing loaded; Loading = a truck is loaded; On the road = a truck has left; Delivered = every truck acknowledged (in the period). Deleted POs are left out. Value = cases × PO price.',
      currency: price ? 'USD' : null, unit: price ? 'orders · USD' : 'orders', freshness: newest(facts.map((p) => p.lastAt), awaiting.map((x) => x.po.date)), empty: !awaiting.length && !facts.length,
    });
  },
  // C-P1-08 ----------------------------------------------------------------------------------------------------
  'ordered-loaded-delivered': (c) => {
    const facts = poFacts(c).filter((p) => p.loaded !== null && (inPeriod(c, p.date) || inPeriod(c, p.lastAt))).sort((a, b) => t(b.date) - t(a.date)).slice(0, 12).reverse();
    return out({ rows: facts.map((p) => ({ id: p.id, ref: p.ref, ordered: p.ordered, loaded: p.loaded, delivered: p.delivered, href: `#/pos/${p.id}` })) }, {
      definition: 'Cases on the original order, cases loaded at the supplier (after any loading revision) and cases received at the warehouse (good + damaged). Gaps within 0.5 % count as matching. Delivered stays empty until the receiver acknowledges.',
      unit: 'cases', freshness: newest(facts.map((p) => p.lastAt)), empty: !facts.length,
    });
  },
  'open-orders': (c) => {
    const n = names(c.src);
    const rows = poFacts(c).filter((p) => p.daysWaiting !== null && p.stage !== 'Delivered').sort((a, b) => (b.daysWaiting ?? 0) - (a.daysWaiting ?? 0))
      .map((p) => ({ id: p.id, ref: p.ref, pair: `${n.entity(p.entityId)}–${n.supplier(p.supplierId)}`, days: p.daysWaiting!, trucks: p.trucks, trucksLoaded: p.trucksLoaded, cases: p.ordered, status: p.daysWaiting! > 7 ? 'bad' : p.daysWaiting! >= 3 ? 'warn' : 'good' }));
    return out({ rows }, { definition: 'Orders issued and not fully loaded, by days since issue. Bands: under 3 days, 3–7 days, over 7 days.', unit: 'days', period: null, freshness: newest(rows.map((r) => poFacts(c).find((p) => p.id === r.id)?.lastAt)), empty: !rows.length });
  },
  // C-P1-09 ----------------------------------------------------------------------------------------------------
  'loading-list': (c) => {
    const n = names(c.src); const mine = A.isDirector(c.v) ? null : c.v.loadingPointIds;
    const dayStart = Math.floor(c.now / DAY) * DAY;
    const poRef = (id: ID) => c.raw.pos.find((p) => p.id === id)?.ref ?? '—';
    const rows = c.src.loadings.filter((l) => (!mine || mine.includes(l.loadingPointId)) && (l.status === 'Pending' || t(l.loadedAt) >= dayStart))
      .map((l) => { const ordered = sum(l.lines, (x) => x.orderedQty), loaded = sum(l.lines, (x) => x.loadedQty); return { id: l.id, poId: l.poId, poRef: l.poRef ?? poRef(l.poId), loadingPoint: n.supplier(l.loadingPointId), truck: l.truckId ? n.truck(l.truckId) : null, driver: l.driverId ? n.driver(l.driverId) : '', ordered, loaded: l.status === 'Loaded' ? loaded : null, status: l.status === 'Loaded' ? 'Loaded' : l.truckId ? 'Ready to load' : 'Waiting for a truck', at: l.loadedAt ?? null, docs: (l.documents ?? []).length }; })
      .sort((a, b) => ['Ready to load', 'Waiting for a truck', 'Loaded'].indexOf(a.status) - ['Ready to load', 'Waiting for a truck', 'Loaded'].indexOf(b.status));
    const queue = (c.src.waiting ?? []).filter((w) => w.status === 'Waiting' && (!mine || mine.includes(w.loadingPointId))).map((w) => ({ id: w.id, truck: n.truck(w.truckId), driver: n.driver(w.driverId), loadingPoint: n.supplier(w.loadingPointId), position: w.position, since: w.arrivedAt }));
    return out({ rows, queue }, { definition: 'Orders to load at your loading point: ready to load (truck assigned), waiting for a truck, and trucks loaded today; the queue of trucks waiting. Quantities only — no prices or payments.', unit: 'cases', period: { from: iso(dayStart), to: iso(dayStart + DAY), label: 'Today' }, freshness: newest(c.src.loadings.map((l) => l.loadedAt), queue.map((q) => q.since)), empty: !rows.length && !queue.length });
  },
  // C-P1-10 ----------------------------------------------------------------------------------------------------
  'loading-status': (c) => {
    const n = names(c.src);
    const rows = poFacts(c).filter((p) => p.stage === 'Loading' || p.stage === 'Created' || p.stage === 'Sent' || (p.stage === 'On the road' && p.trucksLoaded < p.trucks) || inPeriod(c, p.lastAt)).filter((p) => p.stage !== 'Delivered').sort((a, b) => t(b.lastAt) - t(a.lastAt)).slice(0, 15)
      .map((p) => ({ id: p.id, ref: p.ref, pair: `${n.entity(p.entityId)}–${n.supplier(p.supplierId)}`, ordered: p.ordered, loaded: p.loaded, pct: p.loaded !== null && p.ordered ? r2(p.loaded / p.ordered) : null, trucks: p.trucks, trucksLoaded: p.trucksLoaded, docs: p.docs, photos: p.photos, stage: p.stage, at: p.lastAt }));
    return out({ rows }, { definition: 'Cases loaded of cases ordered per order (all its trucks), trucks loaded, and the documents and photos the loader attached. Open orders and orders loaded in the period.', unit: 'cases', freshness: newest(rows.map((r) => r.at)), empty: !rows.length });
  },
  'dispatched-today': (c) => {
    const n = names(c.src); const since = c.now - 24 * H;
    const lpOf = new Map(c.raw.pos.map((p) => [p.id, p.supplierId]));
    const rows = c.src.shipments.filter((s) => { const d0 = s.legs[0]?.passes[0]?.departedAt ?? s.legs[0]?.departedAt; return d0 && t(d0) >= since; })
      .map((s) => ({ id: s.id, ref: s.ref, truck: n.truck(s.legs[0].truckId), from: s.fromWarehouseId ? n.warehouse(s.fromWarehouseId) : n.supplier(lpOf.get(s.poId) ?? ''), to: n.warehouse(s.warehouseId), at: s.legs[0].passes[0]?.departedAt ?? s.legs[0].departedAt!, cases: casesOn(s) }))
      .sort((a, b) => t(b.at) - t(a.at));
    return out({ rows }, { definition: 'Trucks that left their loading point (or warehouse) in the last 24 hours, grouped by where they left from.', unit: 'trucks · cases', period: { from: iso(since), to: iso(c.now), label: 'Last 24 hours' }, freshness: newest(rows.map((r) => r.at)), empty: !rows.length });
  },
  // C-P1-11 ----------------------------------------------------------------------------------------------------
  'fleet-board': (c) => {
    const n = names(c.src);
    const col = (r: TruckRow) => (r.state === 'Loading' ? 'loaded' : r.state === 'In transit' ? 'transit' : r.state === 'At border' ? 'border' : r.state === 'Delayed' ? 'delayed' : 'arrived');
    const cards = desk(c).map((r) => {
      const leg = legOf(c, r); const last = leg ? lastUpdate(leg) : null; const gap = last ? (c.now - t(last)) / H : null;
      const onRoad = ['In transit', 'At border', 'Delayed'].includes(r.state);
      const sh = c.src.shipments.find((s) => s.id === r.shipmentId);
      return {
        id: r.legId ?? r.truck.id, shipmentId: r.shipmentId, column: col(r), title: r.truck.reg, group: leg ? n.route(leg.routeId) : '',
        subtitle: [r.driver?.name, r.provider?.name].filter(Boolean).join(' · '), where: r.where, eta: r.eta?.eta ?? null, lastUpdate: last,
        status: r.state === 'Delayed' ? 'bad' : r.state === 'Loading' ? 'none' : r.state === 'Arrived' ? 'warn' : r.eta?.state === 'Late' && (r.eta.hours ?? 0) >= 2 ? 'warn' : 'good',
        statusLabel: r.state === 'Delayed' ? 'Delayed' : r.state === 'Loading' ? 'Not started' : r.state === 'Arrived' ? 'To acknowledge' : r.eta?.state === 'Late' && (r.eta.hours ?? 0) >= 2 ? `${r.eta.hours} h late` : 'On time',
        stale: onRoad && gap !== null && gap > UPDATE_GAP.red, reexport: !!sh?.fromWarehouseId,
      };
    });
    return out({ columns: [{ key: 'loaded', label: 'Loaded', status: 'none' }, { key: 'transit', label: 'In transit', status: 'good' }, { key: 'border', label: 'At border', status: 'warn' }, { key: 'delayed', label: 'Stopped / delayed', status: 'bad' }, { key: 'arrived', label: 'Arrived', status: 'good' }], cards }, {
      definition: `Every truck on an unfinished trip, by status from the latest driver / Testfie check-in, grouped by route. ETA carries the delay forward. Faded cards have not updated for over ${UPDATE_GAP.red} hours.`,
      unit: 'trucks', period: null, freshness: newest(cards.map((x) => x.lastUpdate)), empty: !cards.length,
    });
  },
  // C-P1-12 ----------------------------------------------------------------------------------------------------
  'delayed-trucks': (c) => {
    const n = names(c.src); const owner = followUp(c);
    const rows = desk(c).filter((r) => r.state === 'Delayed' || (r.eta?.state === 'Late' && r.eta.hours >= 6 && r.state !== 'Arrived')).map((r) => {
      const leg = legOf(c, r)!; const issue = r.issues[0]; const late = r.eta?.state === 'Late' ? r.eta.hours : 0;
      const days = r1(Math.max(late / 24, issue ? (c.now - t(issue.at)) / DAY : 0));
      const sh = c.src.shipments.find((s) => s.id === r.shipmentId);
      return { shipmentId: r.shipmentId, ref: r.shipmentRef, truck: r.truck.reg, route: n.route(leg.routeId), where: r.where, daysLate: days, reason: issue ? `${issue.reason} (${issue.place})` : `Behind plan by ${late} h`, owner: sh?.fromWarehouseId && !owner ? null : owner, severity: days >= 3 ? 'critical' : days >= 1 ? 'high' : 'medium', eta: r.eta?.eta ?? null };
    }).sort((a, b) => b.daysLate - a.daysLate);
    return out({ rows }, { definition: 'Trucks past their plan by 6 hours or more, or stopped by an open issue. Days late = the larger of the ETA delay and the time stopped. Owner = who follows up the truck.', unit: 'days late', period: null, freshness: newest(desk(c).map((r) => r.lastMoveAt)), empty: !rows.length });
  },
  // C-P1-13 ----------------------------------------------------------------------------------------------------
  'truck-issues': (c) => {
    const n = names(c.src);
    const all = c.src.shipments.flatMap((s) => s.legs.flatMap((l) => l.issues.map((i) => ({ i, l, s }))));
    const open = all.filter((x) => !x.i.fixedAt).map((x) => ({ id: x.i.id, shipmentId: x.s.id, truck: n.truck(x.l.truckId), provider: n.provider(n.truckProvider(x.l.truckId)), place: x.i.place || n.checkpoint(x.i.checkpointId), reason: x.i.reason, at: x.i.at, daysStopped: r1((c.now - t(x.i.at)) / DAY), newDue: x.i.newDueDate ?? null }))
      .sort((a, b) => b.daysStopped - a.daysStopped);
    const recent = all.filter((x) => inPeriod(c, x.i.at));
    const count = (k: (x: typeof all[number]) => string) => { const m = new Map<string, number>(); for (const x of recent) m.set(k(x), (m.get(k(x)) ?? 0) + 1); return [...m].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value); };
    const fixed = recent.filter((x) => x.i.fixedAt);
    return out({ open, byTruck: count((x) => n.truck(x.l.truckId)).slice(0, 10), byProvider: count((x) => n.provider(n.truckProvider(x.l.truckId))), reported: recent.length, avgDaysToFix: fixed.length ? r1(sum(fixed, (x) => (t(x.i.fixedAt) - t(x.i.at)) / DAY) / fixed.length) : null }, {
      definition: 'Open issues reported by drivers or Testfie (what, where, days stopped), and issues reported in the period by truck and by transport provider — repeats stand out.', unit: 'issues · days', freshness: newest(all.map((x) => x.i.fixedAt ?? x.i.at)), empty: !open.length && !recent.length,
    });
  },
  // C-P1-14 ----------------------------------------------------------------------------------------------------
  'driver-updates': (c) => {
    const n = names(c.src); const since = c.now - 48 * H;
    const feed: { at: string; truck: string; shipmentId: ID; text: string; source: string; kind: 'arrived' | 'departed' | 'issue' | 'fixed' | 'gps' }[] = [];
    for (const s of c.src.shipments) for (const l of s.legs) {
      if (!l.passes.some((p) => t(p.arrivedAt) >= since || t(p.departedAt) >= since) && !l.issues.some((i) => t(i.at) >= since) && !(t(l.lastPing?.at) >= since)) continue;
      const truck = n.truck(l.truckId);
      for (const p of l.passes) {
        if (t(p.arrivedAt) >= since) feed.push({ at: p.arrivedAt!, truck, shipmentId: s.id, text: `Arrived at ${n.checkpoint(p.checkpointId)}`, source: p.source ?? 'driver', kind: 'arrived' });
        if (t(p.departedAt) >= since) feed.push({ at: p.departedAt!, truck, shipmentId: s.id, text: `Left ${n.checkpoint(p.checkpointId)}`, source: p.source ?? 'driver', kind: 'departed' });
      }
      for (const i of l.issues) { if (t(i.at) >= since) feed.push({ at: i.at, truck, shipmentId: s.id, text: `Issue: ${i.reason}${i.place ? ` at ${i.place}` : ''}`, source: 'driver', kind: 'issue' }); if (t(i.fixedAt) >= since) feed.push({ at: i.fixedAt!, truck, shipmentId: s.id, text: `Fixed: ${i.reason}`, source: 'driver', kind: 'fixed' }); }
      if (l.lastPing && t(l.lastPing.at) >= since) feed.push({ at: l.lastPing.at, truck, shipmentId: s.id, text: 'GPS position', source: 'gps', kind: 'gps' });
    }
    feed.sort((a, b) => t(b.at) - t(a.at));
    const trucks = desk(c).filter((r) => ['In transit', 'At border', 'Delayed'].includes(r.state)).map((r) => {
      const leg = legOf(c, r); const last = leg ? lastUpdate(leg) : null; const gap = last ? r1((c.now - t(last)) / H) : null;
      return { truck: r.truck.reg, shipmentId: r.shipmentId, driver: r.driver?.name ?? '', hasApp: !!r.driver?.hasApp, last, hours: gap, status: gap === null ? 'none' : gap > UPDATE_GAP.red ? 'bad' : gap > UPDATE_GAP.amber ? 'warn' : 'good' };
    }).sort((a, b) => (b.hours ?? 1e9) - (a.hours ?? 1e9));
    return out({ feed: feed.slice(0, 60), trucks, gap: UPDATE_GAP }, {
      definition: `Updates received from the driver app (check-ins, issues, GPS) and the office in the last 48 hours, newest first — offline updates appear when the phone syncs, at the time they were made. Badges: last update per truck on the road; amber after ${UPDATE_GAP.amber} h, red after ${UPDATE_GAP.red} h.`,
      unit: 'hours since update', period: { from: iso(since), to: iso(c.now), label: 'Last 48 hours' }, freshness: feed[0]?.at ?? null, empty: !feed.length && !trucks.length,
    });
  },
  // C-X-02 -----------------------------------------------------------------------------------------------------
  'border-stops': (c) => {
    const n = names(c.src); const cells = new Map<string, { route: string; stop: string; days: number[] }>();
    const from = Math.min(c.from, c.now - 90 * DAY);
    for (const s of c.src.shipments) for (const l of s.legs) for (const p of l.passes) {
      if (!p.arrivedAt || !p.departedAt || t(p.arrivedAt) < from || t(p.arrivedAt) >= c.to) continue;
      const kind = n.checkpointKind(p.checkpointId); if (kind !== 'border' && kind !== 'weighbridge') continue;
      const k = `${l.routeId}|${p.checkpointId}`; const x = cells.get(k) ?? { route: n.route(l.routeId), stop: n.checkpoint(p.checkpointId), days: [] };
      x.days.push((t(p.departedAt) - t(p.arrivedAt)) / DAY); cells.set(k, x);
    }
    const xs = [...cells.values()].map((x) => ({ route: x.route, stop: x.stop, avgDays: r2(sum(x.days, (d0) => d0) / x.days.length), trips: x.days.length }));
    const routes = [...new Set(xs.map((x) => x.route))].sort(); const stops = [...new Set(xs.map((x) => x.stop))];
    return out({ routes, stops, cells: xs, slowest: [...xs].filter((x) => x.trips >= 3).sort((a, b) => b.avgDays - a.avgDays).slice(0, 5), minTrips: 5 }, {
      definition: 'Average days between arriving at and leaving each border or weighbridge, per route, over at least the last 90 days. Each cell shows the number of trips — fewer than 5 is not a stable pattern.',
      unit: 'days', period: periodOf(from, c.to), freshness: newest(xs.length ? c.src.shipments.flatMap((s) => s.legs.flatMap((l) => l.passes.map((p) => p.departedAt))) : []), empty: !xs.length,
    });
  },
  // C-P1-15 ----------------------------------------------------------------------------------------------------
  'agreed-vs-actual': (c) => {
    const n = names(c.src);
    const rows = (c.src.fees ?? []).filter((x) => inPeriod(c, x.loadedAt) && !x.reexport).sort((a, b) => t(b.loadedAt) - t(a.loadedAt)).slice(0, 15).reverse().map((x) => {
      const actual = r2(sum(x.costs.filter((k) => !NOT_TRANSPORT.includes(k.kind)), (k) => k.amountUsd));
      return { shipmentId: x.shipmentId, ref: x.ref, truck: n.truck(x.truckId), provider: n.provider(x.providerId), agreed: x.agreedUsd, actual: x.costs.length ? actual : null, variance: x.agreedUsd !== null && x.costs.length ? r2(actual - x.agreedUsd) : null, legs: x.legs.length };
    });
    return out({ rows }, { definition: 'Agreed = the transport price Testfie recorded after loading. Actual = what moving the truck cost: transport on every leg + loading / offloading, storage and other charges (taxes, duties and clearing are not transport and are left out). Variance red when actual is over agreed. "Not recorded" = no agreed price yet (never zero).', currency: 'USD', unit: 'USD per trip', freshness: newest((c.src.fees ?? []).map((x) => x.loadedAt)), empty: !rows.length });
  },
  // C-P1-16 ----------------------------------------------------------------------------------------------------
  'fee-payments': (c) => {
    const n = names(c.src);
    const rows = (c.src.fees ?? []).filter((x) => inPeriod(c, x.loadedAt) || x.status === 'Unpaid' || x.status === 'Part paid').map((x) => ({
      shipmentId: x.shipmentId, ref: x.ref, truck: n.truck(x.truckId), provider: n.provider(x.providerId), loadedAt: x.loadedAt, ageDays: x.ageDays, agreed: x.agreedUsd, paid: x.paidUsd, pending: x.pendingUsd, balance: x.balanceUsd, status: x.status, flag: x.flag, references: x.references,
    })).sort((a, b) => ['Unpaid', 'Part paid', 'Not recorded', 'Paid'].indexOf(a.status) - ['Unpaid', 'Part paid', 'Not recorded', 'Paid'].indexOf(b.status) || b.ageDays - a.ageDays);
    const cnt = (s: string) => rows.filter((r) => r.status === s).length;
    return out({ rows, counts: { Paid: cnt('Paid'), 'Part paid': cnt('Part paid'), Unpaid: cnt('Unpaid'), 'Not recorded': cnt('Not recorded') }, balance: r2(sum(rows, (r) => Math.max(0, r.balance ?? 0))) }, {
      definition: `Each trip's agreed transport price against payments made with their document references: paid, part paid, unpaid, or agreed price not recorded. Age = days since loading; amber from ${c.raw.config?.fees?.amberDays ?? 14} days, red from ${c.raw.config?.fees?.redDays ?? 30} days while unpaid. Trips loaded in the period + every open balance.`,
      currency: 'USD', unit: 'USD', freshness: newest((c.src.fees ?? []).map((x) => x.loadedAt), c.src.payments.map((p) => p.at)), empty: !rows.length,
    });
  },
  // C-P1-17 ----------------------------------------------------------------------------------------------------
  'unpaid-fees': (c) => {
    const n = names(c.src); const a = M.feeAgeing(c.src.fees ?? [], c.raw.config);
    return out({ providers: a.providers.map((p) => (p === '—' ? 'Unknown provider' : n.provider(p))), providerIds: a.providers, bands: a.bands, total: r2(sum(a.bands, (b) => sum(b.values, (x) => x))) }, {
      definition: 'Open balances of agreed transport prices (agreed − paid, USD) per provider by days since loading. Bands follow config [fees] (amber / red).', currency: 'USD', unit: 'USD', period: null,
      freshness: newest((c.src.fees ?? []).map((x) => x.loadedAt), c.src.payments.map((p) => p.at)), empty: !a.providers.length,
    });
  },
  // C-P1-18 ----------------------------------------------------------------------------------------------------
  'truck-expenses': (c) => {
    const n = names(c.src); const kinds: CostKind[] = ['Transport', 'Taxes & duties', 'Clearing & forwarding', 'Loading & offloading', 'Storage', 'Other'];
    const rows = (c.src.fees ?? []).filter((x) => inPeriod(c, x.loadedAt) && x.costs.length).sort((a, b) => t(b.loadedAt) - t(a.loadedAt)).slice(0, 15).map((x) => {
      const byKind = Object.fromEntries(kinds.map((k) => [k, r2(sum(x.costs.filter((q) => q.kind === k), (q) => q.amountUsd))]));
      const legs = x.legs.map((l) => ({ seq: l.seq, route: n.route(l.routeId), byKind: Object.fromEntries(kinds.map((k) => [k, r2(sum(x.costs.filter((q) => q.kind === k && (q.legId === l.id || (!q.legId && l.seq === 1))), (q) => q.amountUsd))])) }));
      return { shipmentId: x.shipmentId, ref: x.ref, truck: n.truck(x.truckId), byKind, total: r2(sum(kinds, (k) => byKind[k])), legs, agreedRecorded: x.agreedUsd !== null };
    });
    const totals = Object.fromEntries(kinds.map((k) => [k, r2(sum(rows, (r) => r.byKind[k]))]));
    return out({ kinds, rows, totals }, { definition: 'Every cost recorded on trips loaded in the period, per category, in USD at the approved month rate. Legs: costs recorded against each leg (costs without a leg count on leg 1).', currency: 'USD', unit: 'USD per trip', freshness: newest((c.src.fees ?? []).map((x) => x.loadedAt)), empty: !rows.length });
  },
  // C-P1-19 ----------------------------------------------------------------------------------------------------
  'incoming': (c) => {
    const n = names(c.src); const mine = A.isDirector(c.v) ? null : c.v.warehouseIds;
    const rows = c.src.shipments.filter((s) => s.status !== 'Acknowledged' && s.status !== 'Cancelled' && (!mine || mine.includes(s.warehouseId))).map((s) => {
      const leg = s.legs.find(ACTIVE) ?? s.legs.at(-1)!; const eta = etaOf(leg, n.stops(leg.routeId), c.now);
      return { shipmentId: s.id, ref: s.ref, truck: n.truck(leg.truckId), warehouse: n.warehouse(s.warehouseId), from: s.fromWarehouseId ? n.warehouse(s.fromWarehouseId) : n.supplier(c.raw.pos.find((p) => p.id === s.poId)?.supplierId ?? ''), eta: eta.eta, late: eta.state === 'Late' ? eta.hours : 0, status: s.status, toAcknowledge: leg.status === 'Arrived', cases: casesOn(s), products: leg.lines.length };
    }).sort((a, b) => Number(b.toAcknowledge) - Number(a.toAcknowledge) || t(a.eta) - t(b.eta));
    return out({ rows }, { definition: 'Trucks heading to your warehouse by expected arrival; arrived trucks wait for your acknowledgement first. Quantities only.', unit: 'cases', period: null, freshness: newest(c.src.shipments.flatMap((s) => s.legs.map(lastUpdate))), empty: !rows.length });
  },
  // C-P1-20 ----------------------------------------------------------------------------------------------------
  'received-damaged-short': (c) => {
    const n = names(c.src);
    const rows = c.src.acks.filter((a) => inPeriod(c, a.at)).sort((a, b) => t(b.at) - t(a.at)).slice(0, 15).map((a) => {
      const sh = c.src.shipments.find((s) => s.id === a.shipmentId);
      const exp = sum(a.lines, (l) => l.expected), rec = sum(a.lines, (l) => l.received), dmg = sum(a.lines, (l) => l.damaged);
      return { ackId: a.id, shipmentId: a.shipmentId, ref: sh?.ref ?? a.shipmentId, warehouse: n.warehouse(a.warehouseId), at: a.at, expected: exp, good: rec - dmg, damaged: dmg, short: Math.max(0, exp - rec), photos: a.photos.length, signed: !!a.signature, receiver: a.receiverName, reasons: [...new Set(a.lines.map((l) => l.reason).filter(Boolean))] };
    }).reverse();
    const all = c.src.acks.filter((a) => inPeriod(c, a.at));
    const tot = { expected: sum(all, (a) => sum(a.lines, (l) => l.expected)), damaged: sum(all, (a) => sum(a.lines, (l) => l.damaged)), short: sum(all, (a) => sum(a.lines, (l) => Math.max(0, l.expected - l.received))), deliveries: all.length };
    return out({ rows, totals: tot }, { definition: 'Per acknowledged delivery: cases received good, damaged and short (expected − received), with the number of photos and whether it was signed. The latest 15 in the period.', unit: 'cases', freshness: newest(c.src.acks.map((a) => a.at)), empty: !rows.length });
  },
  // C-X-03 -----------------------------------------------------------------------------------------------------
  'delivery-losses': (c) => {
    const acks = c.src.acks.filter((a) => t(a.at) >= Math.min(c.from, c.now - 90 * DAY) && t(a.at) < c.to);
    const items = M.lossByReason(acks);
    return out({ items }, { definition: 'Cases short or damaged at acknowledgement, by the reason the receiver chose ("Not given" = no reason recorded), over at least the last 90 days. Line = cumulative share; dashed = 80 %.', unit: 'cases', period: periodOf(Math.min(c.from, c.now - 90 * DAY), c.to), freshness: newest(acks.map((a) => a.at)), empty: !items.length });
  },
  // C-P1-21 ----------------------------------------------------------------------------------------------------
  'stock-on-hand': (c) => {
    const items = stockItems(c);
    return out({ items: items.map((x) => ({ ...x, min: COVER.min, max: COVER.max })), totalHeld: sum(items, (x) => Math.max(0, x.held)), noSales: items.filter((x) => x.cover === null).length }, {
      definition: `Cases held now per product (all your warehouses unless filtered): received + transfers in − damaged − sent on / re-exported − sold − moved out ± counts. Days of cover = held ÷ average daily sales of the last 30 days; minimum ${COVER.min} days, slow above ${COVER.max} days (to confirm per category). No sales = no cover figure.`,
      unit: 'cases · days', period: { from: iso(c.now - 30 * DAY), to: iso(c.now), label: 'Now · sales speed over 30 days' }, freshness: newest(c.src.moves.map((m) => m.at)), empty: !items.length,
    });
  },
  // C-P1-22 ----------------------------------------------------------------------------------------------------
  'stock-in-transit': (c) => {
    const n = names(c.src);
    const rows = c.src.shipments.filter((s) => s.status !== 'Acknowledged' && s.status !== 'Cancelled').map((s) => {
      const leg = s.legs.find(ACTIVE) ?? s.legs.at(-1)!; const last = s.legs.at(-1)!; const eta = etaOf(last.id === leg.id ? leg : last, n.stops(last.routeId), c.now);
      return { shipmentId: s.id, ref: s.ref, truck: n.truck(leg.truckId), warehouseId: s.warehouseId, warehouse: n.warehouse(s.warehouseId), eta: eta.eta, late: eta.state === 'Late', status: s.status, cases: casesOn(s) };
    }).sort((a, b) => t(a.eta) - t(b.eta));
    const byWarehouse = [...new Set(rows.map((r) => r.warehouseId))].map((w) => ({ warehouse: n.warehouse(w), trucks: rows.filter((r) => r.warehouseId === w).length, cases: sum(rows.filter((r) => r.warehouseId === w), (r) => r.cases) }));
    return out({ rows, byWarehouse }, { definition: 'Goods on the road (loaded, not yet acknowledged) per truck with the expected arrival at the destination warehouse; totals per warehouse.', unit: 'cases', period: null, freshness: newest(c.src.shipments.filter((s) => s.status !== 'Acknowledged').flatMap((s) => s.legs.map(lastUpdate))), empty: !rows.length });
  },
  // C-P1-23 ----------------------------------------------------------------------------------------------------
  'warehouse-expenses': (c) => {
    const from = Math.min(c.from, Date.UTC(new Date(c.now).getUTCFullYear(), new Date(c.now).getUTCMonth() - 5, 1));
    const rows = (c.src.expenses ?? []).filter((e) => t(e.date) >= from && t(e.date) < c.to);
    const s = M.expenseSummary(rows);
    return out({ ...s, categories: M.WAREHOUSE_EXPENSE_CATEGORIES }, { definition: 'Warehouse expenses recorded by Asie, Yonas and the directors (offloading, storage, salary, rent, utilities, damaged goods, other), in USD at the approved month rate, by month and category — at least the last 6 months.', currency: 'USD', unit: 'USD', period: periodOf(from, c.to), freshness: newest(rows.map((e) => e.at)), empty: !rows.length });
  },
  'reexports': (c) => {
    const n = names(c.src);
    const people = new Map((c.src.people ?? []).map((p) => [p.id, p.name]));
    const rows = (c.src.reexports ?? []).sort((a, b) => t(b.createdAt) - t(a.createdAt)).slice(0, 12).map((o) => ({
      id: o.id, ref: o.ref, status: o.status, from: n.warehouse(o.fromWarehouseId), to: n.warehouse(o.toWarehouseId), cases: sum(o.lines, (l) => l.loadedQty ?? l.qty), truck: o.truckId ? n.truck(o.truckId) : null,
      createdAt: o.createdAt, loadedAt: o.loadedAt ?? null, deliveredAt: o.deliveredAt ?? null, owner: o.followUpById ? people.get(o.followUpById) ?? null : null, shipmentId: o.shipmentId ?? null,
    }));
    return out({ rows }, { definition: 'Re-export orders Rwanda → Juba raised from Asie\'s stock and acknowledged by Yonas. Follow-up owner to confirm (Q3).', unit: 'cases', period: null, freshness: newest((c.src.reexports ?? []).flatMap((o) => [o.createdAt, o.loadedAt, o.deliveredAt])), empty: !rows.length });
  },
  // C-P1-24 ----------------------------------------------------------------------------------------------------
  'sales-summary': (c) => {
    const n = names(c.src); const total = (s: ReportData['sales'][number]) => sum(s.lines, (l) => l.qty * l.price);
    const ms = months(c.now, 6).map((m) => { const xs = c.usd.sales.filter((s) => t(s.at) >= m.from && t(s.at) < m.to); return { month: m.key, Cash: r2(sum(xs.filter((s) => s.kind === 'Cash'), total)), Credit: r2(sum(xs.filter((s) => s.kind === 'Credit'), total)), Batch: r2(sum(xs.filter((s) => s.kind === 'Batch'), total)) }; });
    const inP = c.usd.sales.filter((s) => inPeriod(c, s.at));
    const rank = (k: (s: typeof inP[number], l: typeof inP[number]['lines'][number]) => string) => { const m = new Map<string, number>(); for (const s of inP) for (const l of s.lines) m.set(k(s, l), (m.get(k(s, l)) ?? 0) + l.qty * l.price); return [...m].map(([label, value]) => ({ label, value: r2(value) })).sort((a, b) => b.value - a.value).slice(0, 8); };
    return out({ months: ms, topProducts: rank((_, l) => n.product(l.productId)), topCustomers: rank((s) => s.customer), total: r2(sum(inP, total)), count: inP.length }, {
      definition: 'Sales value (cases × price, USD at the approved month rate) by month and kind — cash, credit, batch — and the top products and customers in the period. Sales between our own companies are removed in a multi-company view.',
      currency: 'USD', unit: 'USD', freshness: newest(c.usd.sales.map((s) => s.at)), empty: !c.usd.sales.length,
    });
  },
  // C-P1-25 ----------------------------------------------------------------------------------------------------
  'customer-balances': (c) => {
    const open = c.usd.sales.filter((s) => s.status !== 'Paid').map((s) => ({ customer: s.customer, age: Math.floor((c.now - t(s.at)) / DAY), balance: r2(sum(s.lines, (l) => l.qty * l.price) - s.paid), at: s.at })).filter((x) => x.balance > 0.5);
    const bands = [{ name: `Within terms (≤ ${TERMS_DAYS} d)`, lo: 0, hi: TERMS_DAYS + 1 }, { name: '1–30 days overdue', lo: TERMS_DAYS + 1, hi: TERMS_DAYS + 31 }, { name: 'Over 30 days overdue', lo: TERMS_DAYS + 31, hi: Infinity }];
    const cust = [...new Set(open.map((x) => x.customer))].map((cu) => ({ cu, total: sum(open.filter((x) => x.customer === cu), (x) => x.balance) })).sort((a, b) => b.total - a.total).slice(0, 10).map((x) => x.cu);
    const values = bands.map((b) => ({ name: b.name, values: cust.map((cu) => r2(sum(open.filter((x) => x.customer === cu && x.age >= b.lo && x.age < b.hi), (x) => x.balance))) }));
    return out({ customers: cust, bands: values, total: MX.owedByCustomers(c.usd.sales, c.now), overdue: MX.overdueByCustomers(c.usd.sales, c.now), terms: TERMS_DAYS }, {
      definition: `Unpaid and part-paid sales (value − paid, USD) per customer by days since the sale. Overdue = past ${TERMS_DAYS} days payment terms (to confirm). Top 10 customers by balance.`, currency: 'USD', unit: 'USD', period: null,
      freshness: newest(c.usd.sales.map((s) => s.at)), empty: !open.length,
    });
  },
  // C-P1-28 ----------------------------------------------------------------------------------------------------
  'alerts': (c) => {
    const al = alerts(c);
    const impacts = ['High', 'Medium', 'Low'], sevs = ['Low', 'Medium', 'High'];
    const counts = impacts.map((i) => sevs.map((s) => al.filter((a) => a.impact === i && SEV_COL(a.severity) === s).length));
    const kinds = [...new Set(al.map((a) => a.kind))].map((k) => ({ kind: k, n: al.filter((a) => a.kind === k).length })).sort((a, b) => b.n - a.n);
    return out({ items: al.map((a) => ({ ...a, sevCol: SEV_COL(a.severity) })), impacts, sevs, counts, kinds }, {
      definition: 'Alerts worked out from the records you may see: delayed and quiet trucks, deliveries not acknowledged, shortages and damages, unpaid fees and missing agreed prices, orders waiting to load, low stock, warehouses without expense entries. Severity = how bad; impact = money or customers affected. Each keeps an owner, a due time and a status.',
      unit: 'alerts', period: null, freshness: newest(al.map((a) => a.at)), empty: !al.length,
    });
  },
  // C-P1-26 ----------------------------------------------------------------------------------------------------
  'users-logins': (c) => {
    const us = c.src.users ?? []; const cut = c.now - 30 * DAY;
    const rows = us.map((u) => ({ id: u.id, name: u.name, roles: u.roles, active: u.active, lastLoginAt: u.lastLoginAt ?? null, inactive: u.active && (!u.lastLoginAt || t(u.lastLoginAt) < cut) })).sort((a, b) => t(b.lastLoginAt) - t(a.lastLoginAt) || a.name.localeCompare(b.name));
    return out({ rows, counts: { total: rows.length, active: rows.filter((r) => r.active && !r.inactive).length, inactive: rows.filter((r) => r.inactive).length, deactivated: rows.filter((r) => !r.active).length } }, {
      definition: 'Every login with its roles and last sign-in. Inactive = active account with no sign-in in 30 days; deactivated = switched off by a director.', unit: 'users', period: null, freshness: newest(rows.map((r) => r.lastLoginAt)), empty: !rows.length,
    });
  },
};

/** Throw-free check used by the server and the mock before building: unknown keys and keys this person may not open. */
export function invalidKeys(u: { roles: Role[] }, keys: string[]): string[] { return keys.filter((k) => !canSeeDash(u, k) || !!dashDef(k)?.client); }
/** Does a feature key give access to this group (for nav)? */
export const hasAnyDashboard = (u: { roles: Role[] }) => dashboardsFor(u).length > 0;
export { hasFeature };
