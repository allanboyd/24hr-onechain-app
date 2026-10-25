// Demo-mode reports (mock client only — see reports.ts). Mirrors packages/api mock-client `reportData()` + `reports`:
// same ReportData from the demo database, same company scope (active company, or all allowed in the Group view),
// same role checks (rules.canOpenReport). Keep in step with mock-client.ts if its report data grows.
import { auth, entities, ref, type ID } from '@btw/api';
import * as m from '@btw/api/mock/db';
import * as seed from '@btw/api/mock/seed';
import * as RP from '@btw/api/reports';
import * as R from '@btw/api/rules';
import type { Reports } from './reports';

const wait = <T>(v: T): Promise<T> => new Promise((res) => setTimeout(() => res(v), 60));
function data(): RP.ReportData {
  const r = ref(); // loads the demo database
  const u = auth.me();
  const scope = R.resolveScope(u?.allowedEntityIds ?? r.entities.map((e) => e.id), entities.active()) ?? [];
  return {
    now: Date.now(), sales: m.db.sales, shipments: m.db.shipments.map((s) => ({ ...s, status: m.deriveShipmentStatus(s) })), acks: m.db.acks,
    costs: m.db.costs, payments: m.db.payments, plans: m.db.plans, pos: m.db.pos, loadings: m.db.loadings, moves: m.db.stockMoves, stock: m.stock(),
    products: r.products, priceList: r.priceList, warehouses: r.warehouses, routes: r.routes, checkpoints: r.checkpoints, suppliers: r.suppliers,
    trucks: r.trucks, drivers: r.drivers, providers: r.providers, entities: r.entities,
    fxRates: m.db.fxRates ?? seed.seedFxRates(), entityScope: scope,
    periodPlans: m.db.periodPlans ?? [], pvThresholds: m.db.pvThresholds ?? R.defaultPvThresholds,
  };
}
function check(f: { entityId?: ID }, report: string) {
  const u = auth.me();
  if (!u || !R.canOpenReport(u.roles, report)) throw Object.assign(new Error('Not available for your role'), { status: 403 });
  if (f.entityId && !u.allowedEntityIds.includes(f.entityId)) throw Object.assign(new Error('That belongs to another company'), { status: 403 });
}
export const mockReports: Reports = {
  resolvePeriod: RP.resolvePeriod,
  dashboard: (f = {}) => { check(f, 'dashboard'); return wait(RP.dashboardReport(data(), f)); },
  sales: (f = {}) => { check(f, 'sales'); return wait(RP.salesReport(data(), f)); },
  logistics: (f = {}) => { check(f, 'logistics'); return wait(RP.logisticsReport(data(), f)); },
  inventory: (f = {}) => { check(f, 'inventory'); return wait(RP.inventoryReport(data(), f)); },
  plannedVsActual: (f = {}) => { check(f, 'planned-vs-actual'); return wait(RP.plannedVsActual(data(), f)); },
  // docs/14 B-07 (directors): the mock's own performance() (mock/money.ts — the same lazy chunk the demo client loads for
  // warehouse money, so no extra chunk lands in the entry's preload list), given this module's report data.
  performance: async (f = {}) => {
    const mm = await import('../../../../packages/api/src/mock/money.ts');
    const err = (msg: string, status: number) => Object.assign(new Error(msg), { status });
    const ctx = { current: auth.me(), ensure: () => {}, wait, httpErr: err, reportData: data, config: ref().config ?? {} } as unknown as Parameters<typeof mm.performance>[0];
    return mm.performance(ctx, f);
  },
};
