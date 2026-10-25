// P1 dashboards in the in-browser mock (docs/15-dashboards.md): the same pure builders as GET /v1/dashboards
// (../dashboards.ts) over the mock database. Lazily imported by mock-client.ts so it stays out of the apps' entry chunks.
import * as m from './db';
import * as seed from './seed';
import * as R from '../rules';
import { fill } from './money';
import { buildDashboards, dashboardsFor, invalidKeys, type DashFilter, type DashKey, type DashResponse, type DashSource } from '../dashboards';
import type { Subject } from '../access';
import type { AppConfig, ID, TransportFeeRow, User, UserAdmin } from '../types';

export interface DashCtx {
  current: User | null; me: () => Subject; ensure: () => void; wait: <T>(v: T) => Promise<T>; httpErr: (msg: string, code: number) => Error;
  scopeIds: () => ID[]; config: AppConfig; people: () => User[];
  fees: () => Promise<TransportFeeRow[]>; users: () => Promise<UserAdmin[]>;
}

/** Company-wide data of the active company scope (no role filtering — `buildDashboards` applies the person's scope). */
async function source(c: DashCtx): Promise<DashSource> {
  const sc = c.scopeIds(); const inS = (e?: ID | null) => !!e && sc.includes(e);
  const u = c.current!;
  const shipments = m.db.shipments.filter((s) => inS(s.entityId)).map((s) => ({ ...s, status: m.deriveShipmentStatus(s) }));
  const ids = new Set(shipments.map((s) => s.id));
  const [fees, users] = await Promise.all([
    R.hasFeature(u.roles, 'transport-fees') ? c.fees() : Promise.resolve(null),
    R.hasFeature(u.roles, 'users') ? c.users() : Promise.resolve(null),
  ]);
  return {
    now: Date.now(), entityScope: sc, fxRates: m.db.fxRates ?? seed.seedFxRates(),
    sales: m.db.sales.filter((s) => inS(s.entityId)), shipments, acks: m.db.acks.filter((a) => ids.has(a.shipmentId)),
    costs: m.db.costs.filter((x) => ids.has(x.shipmentId)), payments: m.db.payments.filter((x) => ids.has(x.shipmentId)),
    plans: m.db.plans.filter((p) => inS(p.entityId)), pos: m.db.pos.filter((p) => inS(p.entityId)), loadings: m.db.loadings.filter((l) => inS(l.entityId)),
    moves: m.db.stockMoves.filter((x) => inS(x.entityId)), stock: m.stock().filter((r) => inS(r.entityId)),
    products: seed.products, priceList: seed.priceList, warehouses: seed.warehouses, routes: m.db.routes, checkpoints: seed.checkpoints, suppliers: seed.suppliers,
    trucks: m.db.trucks, drivers: m.db.drivers, providers: m.db.providers, entities: seed.entities,
    periodPlans: (m.db.periodPlans ?? []).filter((p) => inS(p.entityId)), pvThresholds: m.db.pvThresholds ?? R.defaultPvThresholds,
    expenses: m.db.expenses ?? [], sellingPrices: (m.db.sellingPrices ?? []).filter((p) => inS(p.entityId)), reexports: (m.db.reexports ?? []).filter((o) => inS(o.entityId)),
    fees, users, people: c.people().map((p) => ({ id: p.id, name: p.name, roles: p.roles, warehouseIds: p.warehouseIds, loadingPointIds: p.loadingPointIds, pairs: p.pairs })),
    waiting: m.db.waiting.filter((w) => inS(w.entityId)), config: c.config,
  };
}

export async function dashboards(c: DashCtx, keys: DashKey[], f: DashFilter = {}): Promise<DashResponse> {
  c.ensure(); fill();
  const u = c.current;
  if (!u) throw c.httpErr('Sign in first', 401);
  if (!dashboardsFor(u).length) throw c.httpErr('Dashboards are not part of your work — use the field app', 403);
  const bad = invalidKeys(u, keys);
  if (bad.length) throw c.httpErr(`Not available for your role: ${bad.join(', ')}`, 403);
  if (f.entityId && !c.scopeIds().includes(f.entityId)) throw c.httpErr('That belongs to another company', 403);
  const v = { ...c.me(), id: u.id, name: u.name };
  return c.wait(buildDashboards(await source(c), v, keys, f));
}
