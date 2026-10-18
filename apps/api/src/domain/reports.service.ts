import { Injectable } from '@nestjs/common';
import { asc, inArray } from 'drizzle-orm';
import { db, schema as t } from '../db/client';
import { canOpenReport, defaultPvThresholds, deriveShipmentStatus, type StockMove } from '@btw/api/rules';
import { eq } from 'drizzle-orm';
import type { PvThresholds } from '@btw/api/types';
import * as RP from '@btw/api/reports';
import { forbidden } from '../common/errors';
import { canSeeWarehouse, has, isGlobal, type Principal } from '../auth/principal';
import { fxRates } from './companies';
import { RefService } from './ref.service';
import { StockService } from './stock.service';
import { loadShipments, map, publicShipment } from './store';

/** Reports & planning (§9, §10): loads the caller's data scope once and runs the shared pure functions in @btw/api/reports. */
@Injectable()
export class ReportsService {
  constructor(private ref: RefService, private stock: StockService) {}

  /** Role × feature matrix (docs/07 §E): each report needs the Reports feature or the feature it belongs to. */
  private assert(p: Principal, report: string) {
    if (!canOpenReport(p.roles, report)) forbidden('This report is not available for your role');
  }

  /** Raw data of the caller's companies (the active one, or all allowed) — or, for the Group report, every allowed
   *  company. The shared report functions then scope per company, convert to USD and eliminate intercompany. */
  async data(p: Principal, opts: { entityId?: string; group?: boolean; report?: string } = {}, now = Date.now()): Promise<RP.ReportData> {
    if (opts.group) { if (!p.canGroup) forbidden('The Group view is for directors'); } else this.assert(p, opts.report ?? 'reports');
    if (opts.group && !p.canGroup) forbidden('The Group view is for directors');
    const entityScope = opts.group ? p.allowedEntityIds : p.scope;
    if (opts.entityId && !entityScope.includes(opts.entityId)) forbidden('That company is not in your scope');
    const { bundle } = await this.ref.get();
    const stops = (id: string) => bundle.routes.find((r) => r.id === id)?.stops ?? [];
    const inE = (e: string | null | undefined) => !!e && entityScope.includes(e);
    const [periodPlans, pvRow] = await Promise.all([
      db.select().from(t.periodPlans).where(inArray(t.periodPlans.entityId, entityScope)), db.select().from(t.settings).where(eq(t.settings.key, 'pvThresholds')),
    ]);
    const [sales, ships, acks, costs, payments, plans, pos, loadings, moves, stock, rates] = await Promise.all([
      db.select().from(t.sales).where(inArray(t.sales.entityId, entityScope)).orderBy(asc(t.sales.at)), loadShipments(db), db.select().from(t.acks).where(inArray(t.acks.entityId, entityScope)),
      db.select().from(t.tripCosts).where(inArray(t.tripCosts.entityId, entityScope)), db.select().from(t.tripPayments).where(inArray(t.tripPayments.entityId, entityScope)),
      db.select().from(t.plans).where(inArray(t.plans.entityId, entityScope)), db.select().from(t.pos).where(inArray(t.pos.entityId, entityScope)),
      db.select().from(t.loadings).where(inArray(t.loadings.entityId, entityScope)), db.select().from(t.stockMoves).where(inArray(t.stockMoves.entityId, entityScope)), this.stock.stock(null, now), fxRates(),
    ]);
    const wh = (id: string) => canSeeWarehouse(p, id);
    const office = isGlobal(p) || has(p, 'planner', 'fleet', 'operations', 'accounts', 'truck_planner');
    // truck planners follow every truck of their companies (logistics) but see no stock or sales
    const whTrip = (id: string) => wh(id) || has(p, 'truck_planner');
    const shipments = ships.filter((s) => inE(s.entityId) && whTrip(s.warehouseId))
      .map((s) => publicShipment({ ...s, status: deriveShipmentStatus(s, bundle.warehouses.find((w) => w.id === s.warehouseId)?.checkpointId, stops, now) }));
    const shipIds = new Set(shipments.map((s) => s.id));
    const visiblePos = office ? pos.map(map.po) : [];
    const planIds = new Set(visiblePos.map((x) => x.planId));
    return {
      now, fxRates: rates, entityScope,
      periodPlans: office ? periodPlans.map(map.periodPlan) : [], pvThresholds: (pvRow[0]?.value as PvThresholds | undefined) ?? defaultPvThresholds,
      sales: sales.map(map.sale).filter((s) => wh(s.warehouseId)),
      shipments, acks: acks.map(map.ack).filter((a) => shipIds.has(a.shipmentId)),
      costs: costs.map(map.cost).filter((c) => shipIds.has(c.shipmentId)), payments: payments.map(map.payment).filter((x) => shipIds.has(x.shipmentId)),
      plans: office ? plans.map(map.plan).filter((x) => planIds.has(x.id) || !x.poId) : [], pos: visiblePos, loadings: office ? loadings.map(map.loading) : [],
      moves: moves.filter((m) => wh(m.warehouseId)).map((m): StockMove => ({ entityId: m.entityId, warehouseId: m.warehouseId, productId: m.productId, kind: m.kind as StockMove['kind'], qty: m.qty, at: new Date(m.at).toISOString(), ref: m.ref })),
      stock: stock.filter((r) => inE(r.entityId) && wh(r.warehouseId)),
      products: bundle.products, priceList: bundle.priceList as RP.ReportData['priceList'], warehouses: bundle.warehouses.filter((w) => wh(w.id)), routes: bundle.routes,
      checkpoints: bundle.checkpoints as RP.ReportData['checkpoints'], suppliers: bundle.suppliers, trucks: bundle.trucks, drivers: bundle.drivers, providers: bundle.providers, entities: bundle.entities,
    };
  }
}
