// Demo seed: master data + the mock's demo dataset (same trucks, shipments, sales as the browser mock).
// Run: pnpm --filter @btw/server db:seed   (wipes operational tables first)
import { sql } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import * as seed from '@btw/api/mock/seed';
import { demoSnapshot } from '@btw/api/mock/db';
import { checkpointCodes, defaultPvThresholds, defaultThresholds } from '@btw/api/rules';
import type { Db } from './client';
import * as t from './schema';

export const DEMO_PASSWORD = 'demo1234';
export const DEMO_PIN = '1234';

const TABLES = [
  'users', 'entities', 'receiving_companies', 'warehouses', 'suppliers', 'products', 'price_list', 'providers', 'trucks', 'drivers',
  'checkpoints', 'routes', 'plans', 'plan_versions', 'period_plans', 'period_plan_versions', 'pos', 'waiting_entries', 'loadings', 'shipments', 'legs', 'acks', 'positions',
  'stock_moves', 'sales', 'trip_costs', 'trip_payments', 'notifications', 'notification_reads', 'audit_log', 'idempotency_keys',
  'devices', 'refresh_tokens', 'files', 'settings', 'fx_rates',
];

export async function seedDemo(db: Db) {
  const d = demoSnapshot();
  const pw = await bcrypt.hash(DEMO_PASSWORD, 8);
  const pin = await bcrypt.hash(DEMO_PIN, 8);
  const drivers = d.drivers;
  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`TRUNCATE ${TABLES.map((x) => `"${x}"`).join(', ')}`));
    await tx.insert(t.users).values(seed.users.map((u) => ({
      id: u.id, username: u.id.replace(/^u-/, ''), name: u.name, phone: u.phone, email: `${u.id.replace(/^u-/, '')}@btw.local`,
      passwordHash: pw, pinHash: pin, roles: u.roles, entityIds: u.entityIds, loadingPointIds: u.loadingPointIds, warehouseIds: u.warehouseIds,
      driverId: drivers.find((x) => x.phone === u.phone)?.id ?? null,
    })));
    await tx.insert(t.entities).values(seed.entities.map((e) => ({ ...e, website: e.website ?? null })));
    await tx.insert(t.fxRates).values(d.fxRates ?? seed.seedFxRates());
    await tx.insert(t.receivingCompanies).values(seed.receivingCompanies);
    await tx.insert(t.warehouses).values(seed.warehouses);
    await tx.insert(t.suppliers).values(seed.suppliers);
    await tx.insert(t.products).values(seed.products);
    await tx.insert(t.priceList).values(seed.priceList);
    await tx.insert(t.providers).values(d.providers.map((x) => ({ ...x, kind: x.kind ?? (x.regular ? 'company' : 'market'), contactName: x.contactName ?? '', email: x.email ?? '', notes: x.notes ?? '', active: x.active !== false })));
    await tx.insert(t.drivers).values(drivers.map((x) => ({ ...x, active: x.active !== false })));
    await tx.insert(t.trucks).values(d.trucks.map((x) => ({ ...x, defaultDriverId: x.defaultDriverId ?? null, active: x.active !== false, documents: x.documents ?? [] })));
    await tx.insert(t.checkpoints).values(seed.checkpoints.map((c) => {
      const codes = checkpointCodes(c.name, c.kind);
      return { ...c, code: codes[0], aliases: codes, geog: sql`ST_SetSRID(ST_MakePoint(${c.lng}, ${c.lat}), 4326)::geography` as unknown as string };
    }));
    await tx.insert(t.routes).values(d.routes);
    await tx.insert(t.plans).values(d.plans.map((p) => ({ ...p, poId: p.poId ?? null, revisionOf: p.revisionOf ?? null, revision: p.revision ?? null, supersededById: p.supersededById ?? null })));
    for (const p of d.plans.filter((x) => x.status === 'Approved'))
      await tx.insert(t.planVersions).values({ planId: p.id, version: p.version, snapshot: p, byUserId: 'u-dir' });
    const pps = d.periodPlans ?? [];
    if (pps.length) await tx.insert(t.periodPlans).values(pps.map((x) => ({ ...x, copiedFromId: x.copiedFromId ?? null, amendReason: null, replacedById: x.replacedById ?? null })));
    for (const x of pps)
      await tx.insert(t.periodPlanVersions).values({ planId: x.id, version: x.version, snapshot: x, byUserId: 'u-dir' });
    if (d.pos.length) await tx.insert(t.pos).values(d.pos.map((p) => ({ ...p, sentAt: p.sentAt ?? null, signature: p.signature ?? null, approval: p.approval ?? 'director', revisionOf: p.revisionOf ?? null, revision: p.revision ?? null, changes: p.changes ?? null, revisionReason: p.revisionReason ?? null, createdBy: p.createdBy ?? null, onBehalfOfId: p.onBehalfOfId ?? null, supersededById: p.supersededById ?? null })));
    if (d.waiting.length) await tx.insert(t.waitingEntries).values(d.waiting);
    const poSupplier = new Map(d.pos.map((p) => [p.id, p]));
    if (d.loadings.length) await tx.insert(t.loadings).values(d.loadings.map((l) => ({ ...l, loadedAt: l.loadedAt ?? null })));
    for (const sh of d.shipments) {
      const po = poSupplier.get(sh.poId)!;
      await tx.insert(t.shipments).values({ id: sh.id, ref: sh.ref, poId: sh.poId, truckNo: sh.truckNo, receivingCompanyId: sh.receivingCompanyId, warehouseId: sh.warehouseId, status: sh.status, entityId: sh.entityId ?? po.entityId, loadingPointId: po.supplierId, parentShipmentId: sh.parentShipmentId ?? null, originShipmentId: sh.originShipmentId ?? null, fromWarehouseId: sh.fromWarehouseId ?? null, plannedWarehouseId: sh.plannedWarehouseId ?? null, ...(sh.legs[0]?.departedAt ? { createdAt: sh.legs[0].departedAt } : {}) });
      for (const l of sh.legs) await tx.insert(t.legs).values({ ...l, shipmentId: sh.id, departedAt: l.departedAt ?? null, lastPing: l.lastPing ?? null, ackId: l.ackId ?? null });
    }
    if (d.acks.length) await tx.insert(t.acks).values(d.acks.map((a) => ({ ...a, signature: a.signature ?? null })));
    for (let i = 0; i < d.stockMoves.length; i += 1000) await tx.insert(t.stockMoves).values(d.stockMoves.slice(i, i + 1000));
    for (let i = 0; i < d.sales.length; i += 500) await tx.insert(t.sales).values(d.sales.slice(i, i + 500).map((x) => ({ ...x, counterpartyEntityId: x.counterpartyEntityId ?? null })));
    if (d.costs.length) await tx.insert(t.tripCosts).values(d.costs.map((c) => ({ ...c, legId: c.legId ?? null, docRef: c.docRef ?? null, fxRate: c.fxRate ?? 1, amountUsd: c.amountUsd ?? (c.currency === 'USD' ? c.amount : null) })));
    if (d.payments.length) await tx.insert(t.tripPayments).values(d.payments.map((p) => ({ ...p, approvedById: p.approvedById ?? null, fxRate: p.fxRate ?? 1, amountUsd: p.amountUsd ?? p.amount })));
    if (d.notifications.length) await tx.insert(t.notifications).values(d.notifications.map((n) => ({ id: n.id, at: n.at, title: n.title, body: n.body, link: n.link ?? null, forRoles: n.forRoles, entityId: n.entityId ?? null })));
    await tx.insert(t.settings).values([
      { key: 'thresholds', value: defaultThresholds },
      { key: 'paymentApprovalThreshold', value: 500 },
      { key: 'minAppVersion', value: '0.0.0' },
      { key: 'noCheckinGraceHours', value: 3 },
      { key: 'pvThresholds', value: d.pvThresholds ?? defaultPvThresholds },
    ]);
  });
  return { users: seed.users.length, shipments: d.shipments.length, sales: d.sales.length };
}

if (require.main === module) {
  (async () => {
    const { db, sqlClient } = await import('./client');
    console.log('seeded', await seedDemo(db));
    await sqlClient.end();
  })().catch((e) => { console.error(e); process.exit(1); });
}
