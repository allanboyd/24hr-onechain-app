import { Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { and, arrayOverlaps, asc, desc, eq, gte, ilike, inArray, isNull, lte, or, sql, type SQL } from 'drizzle-orm';
import { db, schema as t } from '../db/client';
import { randomInt } from 'node:crypto';
import type { AuditFilter, AuditPage, DocumentRef, DriverInput, EntityInput, ProductInput, ProviderInput, ReceivingCompanyInput, Role, RouteStop, SupplierInput, TruckInput, UserPair, WarehouseInput } from '@btw/api/types';
import { canEditTransport, checkpointCodes, countryCode, hasFeature, normPhone as toE164, normReg, validateDriver, validateProvider, validateRoute, validateTruck, validateWarehouse } from '@btw/api/rules';
import { validateEntity, validateProduct, validateReceivingCompany, validateSupplier } from '@btw/api/static-data';
import { auditNote } from '../common/audit-context';
import { invalidateEntities } from '../auth/entity-scope';
import { fail, forbidden, notFound } from '../common/errors';
import { iso, uid } from '../common/ids';
import { has, isGlobal, type Principal } from '../auth/principal';
import { accessOf } from '../auth/entity-scope';
import { clearLoginLock } from '../auth/auth.service';
import { normalizePhone } from '../auth/auth.service';
import { RefService } from './ref.service';

const ROLES: Role[] = ['director', 'planner', 'operations', 'loader', 'fleet', 'truck_planner', 'receiver', 'reexport', 'sales', 'accounts', 'driver', 'admin'];
/** Changed fields only (audit before / after). */
const pick = (o: object | null | undefined, keys: string[]) => (o ? Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, (o as Record<string, unknown>)[k]])) : null);
const conflictOr422 = (errs: string[]) => fail(errs.join('; '), errs.some((e) => /already/.test(e)) ? 409 : 422, errs.some((e) => /already/.test(e)) ? 'duplicate' : 'rule');

/** Trimmed string or '' for any other input type. */
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

@Injectable()
export class PlatformService {
  constructor(private ref: RefService) {}

  // ---- Notifications (NT-01) ----------------------------------------------------
  async notifications(p: Principal) {
    const mine = eq(t.notifications.forUserId, p.id);
    const where = isGlobal(p) ? or(isNull(t.notifications.forUserId), mine) : or(arrayOverlaps(t.notifications.forRoles, p.roles), mine);
    // company scope: a notification about another company never shows (null = not company-specific)
    const scoped = p.scope.length ? or(isNull(t.notifications.entityId), inArray(t.notifications.entityId, p.scope)) : isNull(t.notifications.entityId);
    const rows = await db.select().from(t.notifications).where(and(where, scoped)).orderBy(desc(t.notifications.at)).limit(100);
    const reads = rows.length ? await db.select().from(t.notificationReads).where(and(eq(t.notificationReads.userId, p.id), inArray(t.notificationReads.notificationId, rows.map((r) => r.id)))) : [];
    const read = new Set(reads.map((r) => r.notificationId));
    return rows.map((r) => ({ id: r.id, at: new Date(r.at).toISOString(), title: r.title, body: r.body, link: r.link ?? undefined, read: read.has(r.id), forRoles: r.forRoles as Role[], entityId: r.entityId }));
  }
  async markRead(p: Principal, ids?: string[]) {
    const list = ids?.length ? ids : (await this.notifications(p)).map((n) => n.id);
    if (list.length) await db.insert(t.notificationReads).values(list.map((id) => ({ notificationId: id, userId: p.id }))).onConflictDoNothing();
    return true;
  }

  async demoUsers() {
    const rows = await db.select().from(t.users).where(eq(t.users.active, true));
    return Promise.all(rows.map(async (u) => ({ id: u.id, name: u.name, phone: u.phone, roles: u.roles as Role[], entityIds: u.entityIds, loadingPointIds: u.loadingPointIds, warehouseIds: u.warehouseIds, ...(await accessOf(u)) })));
  }

  // ---- Devices (MA-07/08) -----------------------------------------------------------
  async registerDevice(p: Principal, input: { pushToken?: string; platform?: string; appVersion?: string }) {
    const id = p.deviceId ?? uid('dev');
    await db.insert(t.devices).values({ id, userId: p.id, pushToken: input.pushToken ?? null, platform: input.platform ?? 'app', appVersion: input.appVersion ?? null })
      .onConflictDoUpdate({ target: t.devices.id, set: { pushToken: input.pushToken ?? null, platform: input.platform ?? 'app', appVersion: input.appVersion ?? null, lastSeenAt: iso() } });
    return { id };
  }
  async devices(p: Principal, userId: string) {
    if (userId !== p.id && !has(p, 'admin', 'director')) forbidden();
    return (await db.select().from(t.devices).where(eq(t.devices.userId, userId))).map(({ pushToken, ...d }) => ({ ...d, hasPush: !!pushToken }));
  }

  // ---- Users (UA-01/02, admin) -----------------------------------------------------------
  private assertAdmin(p: Principal) { if (!hasFeature(p.roles, 'users')) forbidden('Only the directors manage users'); }
  /** docs/12 A-08: scope lists name known companies, loading points, warehouses, routes and buyer–supplier pairs. */
  private async checkScope(input: { entityIds?: unknown; loadingPointIds?: unknown; warehouseIds?: unknown; routeIds?: unknown; pairs?: unknown }) {
    const { bundle } = await this.ref.get();
    const known: Record<string, string[]> = { entityIds: bundle.entities.map((e) => e.id), loadingPointIds: bundle.suppliers.map((x) => x.id), warehouseIds: bundle.warehouses.map((w) => w.id), routeIds: bundle.routes.map((r) => r.id) };
    for (const k of Object.keys(known)) {
      const v = (input as Record<string, unknown>)[k];
      if (v === undefined) continue;
      if (!(Array.isArray(v) && v.every((x) => typeof x === 'string'))) fail(`${k} must be a list of ids`, 400, 'bad-request');
      const bad = (v as string[]).find((x) => !known[k].includes(x)); if (bad) fail(`${k}: unknown id ${bad}`);
    }
    if (input.pairs !== undefined) {
      if (!Array.isArray(input.pairs) || input.pairs.length > 50) fail('pairs must be a list of { entityId, supplierId }', 400, 'bad-request');
      for (const x of input.pairs as UserPair[]) if (!x || typeof x !== 'object' || !known.entityIds.includes(x.entityId) || !known.loadingPointIds.includes(x.supplierId)) fail('Each buyer–supplier pair needs a known company and supplier');
    }
  }
  private view(u: typeof t.users.$inferSelect) {
    const { passwordHash, pinHash, tokenVersion: _tv, ...rest } = u;
    return { ...rest, hasPassword: !!passwordHash, hasPin: !!pinHash };
  }
  async users(p: Principal) { this.assertAdmin(p); return (await db.select().from(t.users)).map((u) => this.view(u)); }
  async createUser(p: Principal, input: { name: string; phone: string; username?: string; email?: string; roles: Role[]; entityIds?: string[]; loadingPointIds?: string[]; warehouseIds?: string[]; pairs?: UserPair[]; routeIds?: string[]; password?: string; pin?: string }) {
    this.assertAdmin(p);
    await this.checkScope(input ?? {});
    if (typeof input.name !== 'string' || typeof input.phone !== 'string' || !input.name.trim() || !input.phone.trim()) fail('Name and phone are required');
    if (!Array.isArray(input.roles) || !input.roles.length || input.roles.some((r) => !ROLES.includes(r))) fail('Pick at least one valid role');
    for (const k of ['entityIds', 'loadingPointIds', 'warehouseIds'] as const) if (input[k] !== undefined && !(Array.isArray(input[k]) && input[k]!.every((x) => typeof x === 'string'))) fail(`${k} must be a list of ids`, 400, 'bad-request');
    if (input.pin !== undefined && !/^\d{4,6}$/.test(String(input.pin))) fail('PIN must be 4–6 digits');
    if (input.password !== undefined && (typeof input.password !== 'string' || input.password.length < 8)) fail('Password must be at least 8 characters');
    const phone = normalizePhone(input.phone);
    // Usernames are unique: "Peter Kamau" after "Peter Otieno" becomes peter2.
    const base = ((input.username || input.name.split(' ')[0]).toLowerCase().replace(/[^a-z0-9.]/g, '') || 'user').slice(0, 30);
    const taken = new Set((await db.select({ u: t.users.username }).from(t.users)).map((x) => x.u));
    if (input.username && taken.has(base)) fail('That username is taken', 409, 'duplicate');
    let username = base; for (let n = 2; taken.has(username); n++) username = `${base}${n}`;
    const [clash] = await db.select().from(t.users).where(eq(t.users.phone, phone));
    if (clash) fail('A user with this phone already exists', 409, 'duplicate');
    const { bundle } = await this.ref.get();
    const driverId = input.roles.includes('driver') ? bundle.drivers.find((d) => normalizePhone(d.phone) === phone)?.id ?? null : null;
    const row = { id: uid('u'), username, name: input.name.trim(), phone, email: input.email ?? null, roles: input.roles, entityIds: input.entityIds ?? [], loadingPointIds: input.loadingPointIds ?? [], warehouseIds: input.warehouseIds ?? [], pairs: (input.pairs ?? []).map((x) => ({ entityId: x.entityId, supplierId: x.supplierId })), routeIds: input.routeIds ?? [], driverId,
      passwordHash: input.password ? await bcrypt.hash(input.password, 10) : null, pinHash: input.pin ? await bcrypt.hash(input.pin, 10) : null };
    await db.insert(t.users).values(row);
    this.ref.invalidate();
    auditNote({ recordType: 'user', recordId: row.id, summary: `${row.name} (${row.roles.join(', ')})`, after: { roles: row.roles, entityIds: row.entityIds, pairs: row.pairs, loadingPointIds: row.loadingPointIds, warehouseIds: row.warehouseIds, routeIds: row.routeIds } });
    return this.view({ ...row, active: true, tokenVersion: 0, createdAt: iso(), lastLoginAt: null });
  }
  async updateUser(p: Principal, id: string, input: Partial<{ name: string; email: string; roles: Role[]; entityIds: string[]; loadingPointIds: string[]; warehouseIds: string[]; pairs: UserPair[]; routeIds: string[]; active: boolean }>) {
    this.assertAdmin(p);
    await this.checkScope(input ?? {});
    const [u] = await db.select().from(t.users).where(eq(t.users.id, id));
    if (!u) return notFound('User');
    const strList = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === 'string');
    if (input.roles !== undefined && (!strList(input.roles) || !input.roles.length || input.roles.some((r) => !ROLES.includes(r)))) fail('Pick at least one valid role');
    for (const k of ['entityIds', 'loadingPointIds', 'warehouseIds'] as const) if (input[k] !== undefined && !strList(input[k])) fail(`${k} must be a list of ids`, 400, 'bad-request');
    if (input.name !== undefined && (typeof input.name !== 'string' || !input.name.trim())) fail('Name must be text', 400, 'bad-request');
    if (input.active !== undefined && typeof input.active !== 'boolean') fail('active must be true or false', 400, 'bad-request');
    const patch = Object.fromEntries(Object.entries(input).filter(([k, v]) => v !== undefined && ['name', 'email', 'roles', 'entityIds', 'loadingPointIds', 'warehouseIds', 'pairs', 'routeIds', 'active'].includes(k)));
    if (id === p.id && (patch.active === false || (patch.roles && !(patch.roles as Role[]).some((r) => r === 'director' || r === 'admin')))) fail('You cannot deactivate yourself or remove your own director role', 409, 'self');
    auditNote({ recordType: 'user', recordId: id, summary: u.name, before: pick(u, Object.keys(patch)), after: patch });
    // Scope or role change, or deactivation, invalidates existing sessions.
    await db.update(t.users).set({ ...patch, tokenVersion: u.tokenVersion + 1 }).where(eq(t.users.id, id));
    this.ref.invalidate();
    const [n] = await db.select().from(t.users).where(eq(t.users.id, id));
    return this.view(n);
  }
  async setSecret(p: Principal, id: string, input: { pin?: string; password?: string }) {
    if (id !== p.id) this.assertAdmin(p);
    if (input.pin !== undefined && !/^\d{4,6}$/.test(input.pin)) fail('PIN must be 4–6 digits');
    if (input.password !== undefined && input.password.length < 8) fail('Password must be at least 8 characters');
    const set: Partial<typeof t.users.$inferInsert> = {};
    if (input.pin) set.pinHash = await bcrypt.hash(input.pin, 10);
    if (input.password) set.passwordHash = await bcrypt.hash(input.password, 10);
    if (!Object.keys(set).length) fail('Send pin or password');
    // A new secret ends every existing session (lost/shared phone) and clears any brute-force lockout.
    await db.update(t.users).set({ ...set, tokenVersion: sql`${t.users.tokenVersion} + 1` }).where(eq(t.users.id, id));
    await db.update(t.refreshTokens).set({ revokedAt: iso() }).where(and(eq(t.refreshTokens.userId, id), isNull(t.refreshTokens.revokedAt)));
    clearLoginLock(`u:${id}`);
    return true;
  }

  // ---- Master data writes (MD-*) ------------------------------------------------------------
  async updateRouteStops(p: Principal, routeId: string, stops: RouteStop[]) {
    if (!canEditTransport(p.roles)) forbidden('Only Kabonge (static data) and the directors change routes');
    const [r] = await db.select().from(t.routes).where(eq(t.routes.id, routeId));
    if (!r) return notFound('Route');
    if (stops.length !== r.stops.length || stops.some((s, i) => s.checkpointId !== r.stops[i].checkpointId)) fail('Only timings can change here; the checkpoint order is fixed');
    if (stops.some((s, i) => s.plannedHours < 0 || s.plannedDwellHours < 0 || (i > 0 && s.plannedHours < stops[i - 1].plannedHours + stops[i - 1].plannedDwellHours))) fail('Planned hours must increase along the route (including dwell)');
    await db.update(t.routes).set({ stops }).where(eq(t.routes.id, routeId));
    this.ref.invalidate();
    return { ...r, stops };
  }
  /** Doc 08 §3: add or edit a warehouse (admin, director). The geofence is its warehouse checkpoint (used by routes and GPS). */
  async saveWarehouse(p: Principal, id: string | null, input: WarehouseInput) {
    if (!has(p, 'admin', 'director')) forbidden('Only an admin or director manages warehouses');
    const { bundle } = await this.ref.get();
    const cur = id ? bundle.warehouses.find((w) => w.id === id) ?? notFound('Warehouse') : null;
    const cp = cur ? bundle.checkpoints.find((c) => c.id === cur.checkpointId) : null;
    const merged = { name: cur?.name, country: cur?.country, town: cur?.town, receivingCompanyId: cur?.receivingCompanyId, lat: cp?.lat, lng: cp?.lng, radiusM: cp?.radiusM, ...((input ?? {}) as Partial<WarehouseInput>) };
    const errs = validateWarehouse(merged, bundle.receivingCompanies.map((r) => r.id));
    if (errs.length) fail(errs.join('; '));
    const w = { name: text(merged.name), country: text(merged.country), town: text(merged.town), receivingCompanyId: merged.receivingCompanyId!, active: merged.active ?? (cur as { active?: boolean } | null)?.active ?? true };
    const point = { lat: merged.lat!, lng: merged.lng!, radiusM: merged.radiusM ?? 500 };
    const geog = sql`ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geography` as unknown as string;
    const row = await db.transaction(async (tx) => {
      if (cur) {
        await tx.update(t.checkpoints).set({ name: w.name, country: countryCode(w.country), ...point, geog }).where(eq(t.checkpoints.id, cur.checkpointId));
        await tx.update(t.warehouses).set(w).where(eq(t.warehouses.id, cur.id));
        return { ...cur, ...w };
      }
      const codes = checkpointCodes(`${w.name} ${w.town}`, 'warehouse');
      const cpId = uid('cp-wh');
      await tx.insert(t.checkpoints).values({ id: cpId, name: w.name, kind: 'warehouse', country: countryCode(w.country), ...point, code: codes[0], aliases: codes, geog });
      const nw = { id: uid('w'), checkpointId: cpId, ...w };
      await tx.insert(t.warehouses).values(nw);
      return nw;
    });
    this.ref.invalidate();
    return row;
  }
  /** Doc 08 §3: a new route (pick checkpoints in order), e.g. one that ends at a new warehouse. */
  async addRoute(p: Principal, input: { name: string; code?: string; distanceKm?: number; stops: RouteStop[] }) {
    if (!canEditTransport(p.roles)) forbidden('Only Kabonge (static data) and the directors add routes');
    const { bundle } = await this.ref.get();
    const errs = validateRoute(input ?? {}, bundle.checkpoints.map((c) => c.id));
    if (errs.length) fail(errs.join('; '));
    const stops = input.stops.map((s) => ({ checkpointId: s.checkpointId, plannedHours: s.plannedHours, plannedDwellHours: s.plannedDwellHours }));
    const short = (cpId: string) => (bundle.checkpoints.find((c) => c.id === cpId)?.code ?? 'X').slice(0, 3);
    const row = { id: uid('r'), code: text(input.code) || `${short(stops[0].checkpointId)}-${short(stops.at(-1)!.checkpointId)}`, name: text(input.name), distanceKm: Number.isInteger(input.distanceKm) && input.distanceKm! > 0 ? input.distanceKm! : 0, stops };
    await db.insert(t.routes).values(row); this.ref.invalidate(); return row;
  }
  // ---- Transport onboarding (docs/10): providers, trucks, drivers ----------------------------------------
  private assertTransport(p: Principal) { if (!canEditTransport(p.roles)) forbidden('Only Kabonge (static data) and the directors manage transport providers, trucks and drivers'); }
  /** Add (id null) or edit a provider: company / sacco / individual / market, contact, regular, notes; `active: false` deactivates. */
  async saveProvider(p: Principal, id: string | null, input: Partial<ProviderInput>) {
    this.assertTransport(p);
    if (!input || typeof input !== 'object') fail('Send the provider details', 400, 'bad-request');
    const all = await db.select().from(t.providers);
    const cur = id ? all.find((x) => x.id === id) ?? notFound('Provider') : null;
    const v = { name: cur?.name, kind: cur?.kind, regular: cur?.regular, phone: cur?.phone, contactName: cur?.contactName, email: cur?.email, notes: cur?.notes, active: cur?.active ?? true, ...input } as Partial<ProviderInput>;
    const errs = validateProvider(v, all, id);
    if (errs.length) fail(errs.join('; '), errs.some((e) => /already registered/.test(e)) ? 409 : 422, errs.some((e) => /already registered/.test(e)) ? 'duplicate' : undefined);
    if (v.regular !== undefined && typeof v.regular !== 'boolean') fail('regular must be true or false', 400, 'bad-request');
    const row = { id: cur?.id ?? uid('pr'), name: text(v.name), kind: v.kind!, regular: v.regular ?? v.kind !== 'market', phone: text(v.phone) ? toE164(v.phone) : '', contactName: text(v.contactName), email: text(v.email), notes: text(v.notes), active: v.active !== false };
    if (cur) await db.update(t.providers).set(row).where(eq(t.providers.id, cur.id)); else await db.insert(t.providers).values(row);
    auditNote({ recordType: 'provider', recordId: row.id, summary: row.name, before: pick(cur, Object.keys(input)), after: pick(row, Object.keys(input)) });
    this.ref.invalidate();
    return row;
  }
  /** Add or edit a truck: unique registration, capacity (cases), default driver, optional documents; `active: false` takes it off queues. */
  async saveTruck(p: Principal, id: string | null, input: Partial<TruckInput>) {
    this.assertTransport(p);
    if (!input || typeof input !== 'object') fail('Send the truck details', 400, 'bad-request');
    const [providers, trucks, drivers] = await Promise.all([db.select({ id: t.providers.id }).from(t.providers), db.select().from(t.trucks), db.select({ id: t.drivers.id, providerId: t.drivers.providerId }).from(t.drivers)]);
    const cur = id ? trucks.find((x) => x.id === id) ?? notFound('Truck') : null;
    const v = { providerId: cur?.providerId, reg: cur?.reg, trailer: cur?.trailer ?? '', capacityCases: cur?.capacityCases ?? (id ? undefined : 2000), defaultDriverId: cur?.defaultDriverId ?? null, active: cur?.active ?? true, note: cur?.note ?? null, documents: cur?.documents ?? [], ...input } as Partial<TruckInput>;
    const errs = validateTruck(v, { providers, trucks, drivers }, id);
    if (errs.length) fail(errs.join('; '), errs.some((e) => /already registered/.test(e)) ? 409 : 422, errs.some((e) => /already registered/.test(e)) ? 'duplicate' : undefined);
    if (v.note !== undefined && v.note !== null && typeof v.note !== 'string') fail('note must be text', 400, 'bad-request');
    if (cur && v.active === false && cur.active) {
      const [q] = await db.select({ id: t.waitingEntries.id }).from(t.waitingEntries).where(and(eq(t.waitingEntries.truckId, cur.id), eq(t.waitingEntries.status, 'Waiting')));
      if (q) fail(`${cur.reg} is in a loading queue — remove it from the queue first`, 409, 'state');
    }
    const documents: DocumentRef[] = (v.documents ?? []).map((d) => ({ id: typeof d.id === 'string' && d.id ? d.id : uid('doc'), kind: (['delivery-note', 'invoice', 'gate-pass', 'photo', 'signature', 'receipt', 'po-pdf'] as const).includes(d.kind as never) ? d.kind : 'photo', name: text(d.name).slice(0, 200), ...(typeof d.url === 'string' ? { url: d.url } : {}) }));
    const row = { id: cur?.id ?? uid('t'), providerId: v.providerId!, reg: normReg(v.reg), trailer: text(v.trailer).toUpperCase(), capacityCases: v.capacityCases!, defaultDriverId: v.defaultDriverId || null, fleetNo: cur?.fleetNo ?? null, note: v.note ?? null, active: v.active !== false, documents };
    try {
      if (cur) await db.update(t.trucks).set(row).where(eq(t.trucks.id, cur.id)); else await db.insert(t.trucks).values(row);
      auditNote({ recordType: 'truck', recordId: row.id, summary: row.reg, before: pick(cur, Object.keys(input)), after: pick(row, Object.keys(input)) });
    } catch (e) { if (/unique|duplicate/i.test(String((e as Error)?.message) + String((e as { cause?: Error })?.cause?.message))) fail(`${row.reg} is already registered`, 409, 'duplicate'); throw e; }
    this.ref.invalidate();
    return { ...row, defaultDriverId: row.defaultDriverId ?? undefined };
  }
  /** Add or edit a driver (unique phone). `appLogin: true` with `hasApp` gives a new driver a field-app login: a driver
   *  user linked to this driver, with a random 4-digit PIN returned once (like a PIN reset in Users & devices). */
  async saveDriver(p: Principal, id: string | null, input: Partial<DriverInput> & { appLogin?: boolean }) {
    this.assertTransport(p);
    if (!input || typeof input !== 'object') fail('Send the driver details', 400, 'bad-request');
    const [providers, drivers] = await Promise.all([db.select({ id: t.providers.id }).from(t.providers), db.select().from(t.drivers)]);
    const cur = id ? drivers.find((x) => x.id === id) ?? notFound('Driver') : null;
    const v = { providerId: cur?.providerId, name: cur?.name, phone: cur?.phone, licence: cur?.licence ?? '', hasApp: cur?.hasApp ?? false, active: cur?.active ?? true, ...input };
    const errs = validateDriver(v, { providers, drivers }, id);
    if (errs.length) fail(errs.join('; '), errs.some((e) => /already uses/.test(e)) ? 409 : 422, errs.some((e) => /already uses/.test(e)) ? 'duplicate' : undefined);
    if (input.appLogin !== undefined && typeof input.appLogin !== 'boolean') fail('appLogin must be true or false', 400, 'bad-request');
    const phone = toE164(v.phone);
    const row = { id: cur?.id ?? uid('d'), providerId: v.providerId!, name: text(v.name), phone, licence: text(v.licence), hasApp: v.hasApp === true, active: v.active !== false,
      localPhone: cur && cur.phone === phone ? cur.localPhone : null, phoneNote: cur && cur.phone === phone ? cur.phoneNote : null };
    const login = await db.transaction(async (tx) => {
      if (cur) await tx.update(t.drivers).set(row).where(eq(t.drivers.id, cur.id)); else await tx.insert(t.drivers).values(row);
      auditNote({ recordType: 'driver', recordId: row.id, summary: row.name, before: pick(cur, Object.keys(input)), after: pick(row, Object.keys(input)) });
      if (!(input.appLogin && row.hasApp)) return undefined;
      const [owner] = await tx.select().from(t.users).where(eq(t.users.phone, normalizePhone(phone)));
      if (owner && !(owner.roles as Role[]).includes('driver')) fail('This phone number belongs to an office user — use another number for the driver', 409, 'duplicate');
      if (owner) { if (owner.driverId !== row.id) await tx.update(t.users).set({ driverId: row.id }).where(eq(t.users.id, owner.id)); return { userId: owner.id, username: owner.username }; }
      const taken = new Set((await tx.select({ u: t.users.username }).from(t.users)).map((x) => x.u));
      const base = (row.name.split(' ')[0].toLowerCase().replace(/[^a-z0-9.]/g, '') || 'driver').slice(0, 30);
      let username = base; for (let n = 2; taken.has(username); n++) username = `${base}${n}`;
      const pin = String(randomInt(1000, 10000));
      const u = { id: uid('u'), username, name: row.name, phone: normalizePhone(phone), email: null, roles: ['driver'], entityIds: [], loadingPointIds: [], warehouseIds: [], driverId: row.id, passwordHash: null, pinHash: await bcrypt.hash(pin, 10) };
      await tx.insert(t.users).values(u);
      return { userId: u.id, username, pin };
    });
    this.ref.invalidate();
    return { ...row, localPhone: row.localPhone ?? undefined, phoneNote: row.phoneNote ?? undefined, ...(login ? { login } : {}) };
  }

  // ---- Static data (docs/12 A-05): companies, suppliers, goods, receiving companies — Kabonge and the directors ----
  private assertStatic(p: Principal) { if (!hasFeature(p.roles, 'master-data.static')) forbidden('Only Kabonge (static data) and the directors edit companies, suppliers, goods and receiving companies'); }
  private input<T>(b: unknown): Partial<T> { if (!b || typeof b !== 'object' || Array.isArray(b)) fail('Send the record as an object', 400, 'bad-request'); return b as Partial<T>; }

  /** Add (id null) or edit a company; `active: false` deactivates it (kept for history). Room for 5 (to confirm). */
  async saveEntity(p: Principal, id: string | null, body: unknown) {
    this.assertStatic(p);
    const input = this.input<EntityInput>(body);
    const all = await db.select().from(t.entities);
    const cur = id ? all.find((x) => x.id === id) ?? notFound('Company') : null;
    const v = { code: cur?.code, name: cur?.name, shortName: cur?.shortName, poPrefix: cur?.poPrefix, address: cur?.address, phones: cur?.phones, email: cur?.email, website: cur?.website ?? undefined, tagline: cur?.tagline, reportingCurrency: cur?.reportingCurrency, active: cur?.active ?? true, ...input } as Partial<EntityInput>;
    const errs = validateEntity(v, all, id); if (errs.length) conflictOr422(errs);
    const code = text(v.code).toUpperCase();
    const newId = cur?.id ?? (all.some((x) => x.id === `e-${code.toLowerCase()}`) ? uid('e') : `e-${code.toLowerCase()}`);
    const row = { code, name: text(v.name), shortName: text(v.shortName) || code, poPrefix: (text(v.poPrefix) || `${code}-PO`).toUpperCase(), address: v.address ?? [], phones: v.phones ?? [], email: text(v.email), website: text(v.website) || null, tagline: text(v.tagline), reportingCurrency: v.reportingCurrency ?? 'USD', active: v.active !== false };
    if (cur) await db.update(t.entities).set(row).where(eq(t.entities.id, cur.id));
    else await db.insert(t.entities).values({ id: newId, ...row, logoKey: code.toLowerCase(), letterhead: { header: '', footer: '' } });
    invalidateEntities(); this.ref.invalidate();
    auditNote({ recordType: 'entity', recordId: newId, summary: row.name, before: pick(cur, Object.keys(input)), after: pick(row, Object.keys(input)) });
    const [out] = await db.select().from(t.entities).where(eq(t.entities.id, newId));
    return (await import('./companies')).toEntity(out);
  }
  /** Add or edit a supplier (export section). A location (lat/lng) creates or moves its loading-point checkpoint. Room for 7. */
  async saveSupplier(p: Principal, id: string | null, body: unknown) {
    this.assertStatic(p);
    const input = this.input<SupplierInput>(body);
    const all = await db.select().from(t.suppliers);
    const cur = id ? all.find((x) => x.id === id) ?? notFound('Supplier') : null;
    const v = { code: cur?.code, name: cur?.name, city: cur?.city, country: cur?.country, email: cur?.email, active: cur?.active ?? true, ...input } as Partial<SupplierInput>;
    const errs = validateSupplier(v, all, id); if (errs.length) conflictOr422(errs);
    const code = text(v.code).toUpperCase();
    const sid = cur?.id ?? (all.some((x) => x.id === `s-${code.toLowerCase()}`) ? uid('s') : `s-${code.toLowerCase()}`);
    const row = await db.transaction(async (tx) => {
      let checkpointId = cur?.checkpointId ?? '';
      if (typeof v.lat === 'number' && typeof v.lng === 'number') {
        const geog = sql`ST_SetSRID(ST_MakePoint(${v.lng}, ${v.lat}), 4326)::geography` as unknown as string;
        const name = `${code} ${text(v.city)} (loading)`; const codes = checkpointCodes(name, 'loading');
        const [cp] = checkpointId ? await tx.select({ id: t.checkpoints.id }).from(t.checkpoints).where(eq(t.checkpoints.id, checkpointId)) : [];
        if (cp) await tx.update(t.checkpoints).set({ name, country: countryCode(text(v.country)), lat: v.lat, lng: v.lng, geog }).where(eq(t.checkpoints.id, cp.id));
        else { checkpointId = uid('cp'); await tx.insert(t.checkpoints).values({ id: checkpointId, name, kind: 'loading', country: countryCode(text(v.country)), lat: v.lat, lng: v.lng, radiusM: 400, code: codes[0], aliases: codes, geog }); }
      }
      const r = { code, name: text(v.name), city: text(v.city), country: text(v.country), email: text(v.email), checkpointId, active: v.active !== false };
      if (cur) await tx.update(t.suppliers).set(r).where(eq(t.suppliers.id, cur.id)); else await tx.insert(t.suppliers).values({ id: sid, ...r });
      return { id: sid, ...r };
    });
    this.ref.invalidate();
    auditNote({ recordType: 'supplier', recordId: sid, summary: row.name, before: pick(cur, Object.keys(input)), after: pick(row, Object.keys(input)) });
    return row;
  }
  /** Add or edit goods (SKU, brand, pack, units per case, size, supplier, category) and optionally its purchase price (USD). */
  async saveProduct(p: Principal, id: string | null, body: unknown) {
    this.assertStatic(p);
    const input = this.input<ProductInput>(body);
    const [all, sups] = await Promise.all([db.select().from(t.products), db.select({ id: t.suppliers.id }).from(t.suppliers)]);
    const cur = id ? all.find((x) => x.id === id) ?? notFound('Product') : null;
    const v = { sku: cur?.sku, brand: cur?.brand, pack: cur?.pack, unitsPerCase: cur?.unitsPerCase, sizeMl: cur?.sizeMl, supplierId: cur?.supplierId, category: cur?.category ?? null, active: cur?.active ?? true, ...input } as Partial<ProductInput>;
    const errs = validateProduct(v, { products: all, supplierIds: sups.map((x) => x.id) }, id); if (errs.length) conflictOr422(errs);
    const pid = cur?.id ?? uid('p');
    const row = { sku: text(v.sku).toUpperCase(), brand: text(v.brand), pack: text(v.pack), unitsPerCase: v.unitsPerCase!, sizeMl: v.sizeMl!, supplierId: v.supplierId!, category: v.category || null, active: v.active !== false };
    const before = cur ? { ...cur, price: (await db.select().from(t.priceList).where(eq(t.priceList.productId, cur.id)))[0]?.price } : null;
    await db.transaction(async (tx) => {
      if (cur) await tx.update(t.products).set(row).where(eq(t.products.id, cur.id)); else await tx.insert(t.products).values({ id: pid, ...row, packConfirmed: true, sheetNo: null });
      if (typeof input.price === 'number') {
        await tx.delete(t.priceList).where(eq(t.priceList.productId, pid));
        await tx.insert(t.priceList).values({ productId: pid, supplierId: row.supplierId, price: Math.round(input.price * 100) / 100, currency: 'USD', from: iso().slice(0, 10), note: null });
      } else if (cur && cur.supplierId !== row.supplierId) await tx.update(t.priceList).set({ supplierId: row.supplierId }).where(eq(t.priceList.productId, pid));
    });
    this.ref.invalidate();
    auditNote({ recordType: 'product', recordId: pid, summary: `${row.brand} ${row.pack}`, before: pick(before, Object.keys(input)), after: pick({ ...row, price: input.price }, Object.keys(input)) });
    return { id: pid, ...row };
  }
  /** Add or edit a receiving company (e.g. Asie Company, Yonas Company). */
  async saveReceivingCompany(p: Principal, id: string | null, body: unknown) {
    this.assertStatic(p);
    const input = this.input<ReceivingCompanyInput>(body);
    const all = await db.select().from(t.receivingCompanies);
    const cur = id ? all.find((x) => x.id === id) ?? notFound('Receiving company') : null;
    const v = { name: cur?.name, countries: cur?.countries, active: cur?.active ?? true, ...input } as Partial<ReceivingCompanyInput>;
    const errs = validateReceivingCompany(v, all, id); if (errs.length) conflictOr422(errs);
    const rid = cur?.id ?? uid('rc');
    const row = { name: text(v.name), countries: (v.countries ?? []).map((c) => text(c)), active: v.active !== false };
    if (cur) await db.update(t.receivingCompanies).set(row).where(eq(t.receivingCompanies.id, cur.id)); else await db.insert(t.receivingCompanies).values({ id: rid, ...row });
    this.ref.invalidate();
    auditNote({ recordType: 'receiving-company', recordId: rid, summary: row.name, before: pick(cur, Object.keys(input)), after: pick(row, Object.keys(input)) });
    return { id: rid, ...row };
  }

  // ---- Audit log (docs/12 A-07): directors view and search ----------------------------------------------------
  async audit(p: Principal, f: AuditFilter & Record<string, unknown>): Promise<AuditPage> {
    if (!hasFeature(p.roles, 'audit')) forbidden('The audit log is for the directors');
    const str = (v: unknown, max = 120) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
    const date = (v: unknown, end = false) => { const s0 = str(v, 40); if (!s0) return undefined; const d = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(s0) ? `${s0}T${end ? '23:59:59.999' : '00:00:00.000'}Z` : s0); if (Number.isNaN(d)) fail('Dates must look like 2026-10-25', 400, 'bad-request'); return new Date(d).toISOString(); };
    const page = Math.max(1, Math.min(10_000, Math.floor(Number(f.page) || 1))), pageSize = Math.max(1, Math.min(200, Math.floor(Number(f.pageSize) || 50)));
    const conds: SQL[] = [];
    const userId = str(f.userId, 64), feature = str(f.feature, 40), q = str(f.q), from = date(f.from), to = date(f.to, true);
    if (userId) conds.push(eq(t.auditLog.userId, userId));
    if (feature) conds.push(eq(t.auditLog.feature, feature));
    if (from) conds.push(gte(t.auditLog.at, from));
    if (to) conds.push(lte(t.auditLog.at, to));
    if (q) { const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`; conds.push(or(ilike(t.auditLog.path, like), ilike(t.auditLog.summary, like), ilike(t.auditLog.recordId, like), sql`${t.auditLog.userId} IN (SELECT id FROM users WHERE name ILIKE ${like})`)!); }
    // company scope: rows of other companies stay hidden (null = not company-specific)
    conds.push(or(isNull(t.auditLog.entityId), inArray(t.auditLog.entityId, p.scope.length ? p.scope : ['-']))!);
    const where = and(...conds);
    const [rows, [{ n }], byDay, users] = await Promise.all([
      db.select().from(t.auditLog).where(where).orderBy(desc(t.auditLog.at), desc(t.auditLog.id)).limit(pageSize).offset((page - 1) * pageSize),
      db.select({ n: sql<number>`count(*)::int` }).from(t.auditLog).where(where),
      db.select({ day: sql<string>`to_char(date_trunc('day', ${t.auditLog.at} AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`, n: sql<number>`count(*)::int` }).from(t.auditLog).where(where).groupBy(sql`1`).orderBy(asc(sql`1`)),
      db.select({ id: t.users.id, name: t.users.name }).from(t.users),
    ]);
    const names = new Map(users.map((u) => [u.id, u.name]));
    return {
      rows: rows.map((r) => ({ id: String(r.id), at: new Date(r.at).toISOString(), userId: r.userId, userName: r.userId ? names.get(r.userId) ?? r.userId : 'system', channel: r.channel, method: r.method, path: r.path, status: r.status, entityId: r.entityId, feature: r.feature, recordType: r.recordType, recordId: r.recordId, summary: r.summary, before: r.before ?? undefined, after: r.after ?? undefined })),
      total: n, page, pageSize, byDay,
    };
  }
}
