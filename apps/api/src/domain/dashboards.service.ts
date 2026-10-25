// docs/15 — P1 dashboards (GET /v1/dashboards). Loads the company-wide data of the caller's company scope once, then runs the
// shared pure builders (@btw/api/dashboards), which cut it down to the caller's own scope (roles document §7: pairs, loading
// points, warehouses, routes; no money for loaders / receivers) — the in-browser mock runs the same code.
import { Injectable } from '@nestjs/common';
import { inArray } from 'drizzle-orm';
import { db, schema as t } from '../db/client';
import { hasFeature } from '@btw/api/rules';
import { buildDashboards, dashDef, dashboardsFor, homeFor, invalidKeys, type DashFilter, type DashKey, type DashResponse } from '@btw/api/dashboards';
import type { ReexportOrder, Role, SellingPrice, UserAdmin, WarehouseExpense } from '@btw/api/types';
import { fail, forbidden } from '../common/errors';
import type { Principal } from '../auth/principal';
import { appConfig } from '../config/app-config';
import { MoneyService } from './money.service';
import { PlatformService } from './platform.service';
import { ReportsService } from './reports.service';
import { map } from './store';

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);

@Injectable()
export class DashboardsService {
  constructor(private reports: ReportsService, private money: MoneyService, private platform: PlatformService) {}

  async get(p: Principal, keys: string[], f: DashFilter): Promise<DashResponse> {
    const unknown = keys.filter((k) => !dashDef(k));
    if (unknown.length) fail(`Unknown dashboard: ${unknown.join(', ')}`, 404, 'not-found');
    if (!dashboardsFor(p).length) forbidden('Dashboards are not part of your work — use the field app');
    const want = (keys.length ? keys : homeFor(p).filter((k) => !dashDef(k)?.client)) as DashKey[];
    const bad = invalidKeys(p, want);
    if (bad.length) forbidden(`Not available for your role: ${bad.join(', ')}`);
    if (f.entityId && !p.scope.includes(f.entityId)) forbidden('That company is not in your scope');
    // company-wide data of the caller's companies; the shared builders apply the person's own scope
    const office: Principal = { ...p, roles: ['director'] as Role[], pairs: [], routeIds: [] };
    const data = await this.reports.data(office, { report: 'reports' });
    const scope = p.scope;
    const [expenses, prices, orders, waiting, people, fees, users] = await Promise.all([
      hasFeature(p.roles, 'warehouse-expenses') ? db.select().from(t.warehouseExpenses) : Promise.resolve([]),
      hasFeature(p.roles, 'selling-prices') ? db.select().from(t.sellingPrices).where(inArray(t.sellingPrices.entityId, scope)) : Promise.resolve([]),
      hasFeature(p.roles, 're-export') ? db.select().from(t.reexportOrders).where(inArray(t.reexportOrders.entityId, scope)) : Promise.resolve([]),
      db.select().from(t.waitingEntries).where(inArray(t.waitingEntries.entityId, scope)),
      db.select({ id: t.users.id, name: t.users.name, roles: t.users.roles, warehouseIds: t.users.warehouseIds, loadingPointIds: t.users.loadingPointIds, pairs: t.users.pairs, active: t.users.active }).from(t.users),
      hasFeature(p.roles, 'transport-fees') ? this.money.fees(p) : Promise.resolve(null),
      hasFeature(p.roles, 'users') ? this.platform.users(p) : Promise.resolve(null),
    ]);
    return buildDashboards({
      ...data,
      expenses: expenses.map((r): WarehouseExpense => ({ ...r, category: r.category as WarehouseExpense['category'], currency: r.currency as WarehouseExpense['currency'], at: iso(r.at)!, receipt: r.receipt ?? null })),
      sellingPrices: prices.map((r): SellingPrice => ({ ...r, currency: r.currency as SellingPrice['currency'], at: iso(r.at)! })),
      reexports: orders.map((r): ReexportOrder => ({ ...r, status: r.status as ReexportOrder['status'], createdAt: iso(r.createdAt)!, loadedAt: iso(r.loadedAt), deliveredAt: iso(r.deliveredAt) })),
      waiting: waiting.map(map.waiting),
      people: people.filter((u) => u.active).map((u) => ({ id: u.id, name: u.name, roles: u.roles as Role[], warehouseIds: u.warehouseIds, loadingPointIds: u.loadingPointIds, pairs: u.pairs })),
      fees, users: users ? (users.map((u) => ({ ...u, lastLoginAt: iso(u.lastLoginAt) })) as unknown as UserAdmin[]) : null,
      config: appConfig,
    }, { ...p, id: p.id, name: p.name }, want, f);
  }
}
