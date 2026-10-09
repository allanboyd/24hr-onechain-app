import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, refDb, schema as t } from '../db/client';
import { config } from '../config/config';
import type { Checkpoint, RouteStop } from '@btw/api/types';
import { defaultThresholds, type Thresholds } from '@btw/api/rules';

type RefBundle = Awaited<ReturnType<RefService['loadBundle']>>;

/** Master data cache (small, read on almost every request). Invalidate after any master-data write. */
@Injectable()
export class RefService {
  private cache: { bundle: RefBundle; etag: string; at: number } | null = null;

  async loadBundle() {
    const [entities, receivingCompanies, warehouses, suppliers, products, priceList, providers, trucks, drivers, checkpoints, routes, users] = await Promise.all([
      refDb.select().from(t.entities), refDb.select().from(t.receivingCompanies), refDb.select().from(t.warehouses), refDb.select().from(t.suppliers),
      refDb.select().from(t.products), refDb.select().from(t.priceList), refDb.select().from(t.providers), refDb.select().from(t.trucks), refDb.select().from(t.drivers),
      refDb.select({ id: t.checkpoints.id, name: t.checkpoints.name, kind: t.checkpoints.kind, country: t.checkpoints.country, lat: t.checkpoints.lat, lng: t.checkpoints.lng, radiusM: t.checkpoints.radiusM, code: t.checkpoints.code, aliases: t.checkpoints.aliases }).from(t.checkpoints),
      refDb.select().from(t.routes),
      refDb.select({ id: t.users.id, name: t.users.name, phone: t.users.phone, roles: t.users.roles, entityIds: t.users.entityIds, loadingPointIds: t.users.loadingPointIds, warehouseIds: t.users.warehouseIds }).from(t.users),
    ]);
    const settings = await refDb.select().from(t.settings);
    const s = Object.fromEntries(settings.map((x) => [x.key, x.value]));
    return {
      entities, receivingCompanies, warehouses, suppliers, products, priceList, providers,
      trucks: trucks.map((x) => ({ ...x, defaultDriverId: x.defaultDriverId ?? undefined })), drivers,
      checkpoints: checkpoints as (Checkpoint & { code: string; aliases: string[] })[], routes, users,
      settings: { thresholds: (s.thresholds as Thresholds) ?? defaultThresholds, paymentApprovalThreshold: Number(s.paymentApprovalThreshold ?? 500), minAppVersion: String(s.minAppVersion ?? '0.0.0'), noCheckinGraceHours: Number(s.noCheckinGraceHours ?? 3) },
    };
  }

  private loading: Promise<NonNullable<RefService['cache']>> | null = null;
  private generation = 0;
  /** One load at a time (concurrent misses share it), on its own pool; a stale cache is served while it refreshes. */
  private reload() {
    const gen = this.generation;
    this.loading ??= this.loadBundle().then((bundle) => {
      const c = { bundle, etag: '"' + createHash('sha1').update(JSON.stringify(bundle)).digest('hex').slice(0, 16) + '"', at: Date.now() };
      if (gen === this.generation) this.cache = c; // an invalidate() during the load wins
      return c;
    }).finally(() => { this.loading = null; });
    return this.loading;
  }
  async get() {
    if (!this.cache) return this.reload();
    if (Date.now() - this.cache.at > config.REF_TTL_MS) void this.reload().catch(() => {});
    return this.cache;
  }
  /** After a master-data write: the next read loads fresh data (the writer's own read sees its change). */
  invalidate() { this.generation++; this.cache = null; this.loading = null; }

  async stopsOf(routeId: string): Promise<RouteStop[]> { return (await this.get()).bundle.routes.find((r) => r.id === routeId)?.stops ?? []; }
  async stopsFn() { const routes = (await this.get()).bundle.routes; return (id: string) => routes.find((r) => r.id === id)?.stops ?? []; }
  async checkpoint(id: string) { return (await this.get()).bundle.checkpoints.find((c) => c.id === id); }
  async warehouseByCheckpoint(cpId: string) { return (await this.get()).bundle.warehouses.find((w) => w.checkpointId === cpId); }
  async setSetting(key: string, value: unknown) {
    await db.insert(t.settings).values({ key, value: value as never }).onConflictDoUpdate({ target: t.settings.key, set: { value: value as never } });
    this.invalidate();
  }
  async truckReg(id: string) { return (await this.get()).bundle.trucks.find((x) => x.id === id)?.reg ?? '—'; }
  async priceOf() { const pl = (await this.get()).bundle.priceList; return (pid: string) => pl.find((x) => x.productId === pid)?.price ?? 0; }
  async user(id: string) { const [u] = await db.select().from(t.users).where(eq(t.users.id, id)); return u; }
}
