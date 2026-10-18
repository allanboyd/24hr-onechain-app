import { Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { and, arrayOverlaps, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { db, schema as t } from '../db/client';
import { randomInt } from 'node:crypto';
import type { DocumentRef, DriverInput, ProviderInput, Role, RouteStop, TruckInput, WarehouseInput } from '@btw/api/types';
import { canEditTransport, checkpointCodes, countryCode, normPhone as toE164, normReg, validateDriver, validateProvider, validateRoute, validateTruck, validateWarehouse } from '@btw/api/rules';
import { fail, forbidden, notFound } from '../common/errors';
import { iso, uid } from '../common/ids';
import { has, isGlobal, type Principal } from '../auth/principal';
import { accessOf } from '../auth/entity-scope';
import { clearLoginLock } from '../auth/auth.service';
import { normalizePhone } from '../auth/auth.service';
import { RefService } from './ref.service';

const ROLES: Role[] = ['director', 'planner', 'operations', 'loader', 'fleet', 'truck_planner', 'receiver', 'sales', 'accounts', 'driver', 'admin'];

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
  private assertAdmin(p: Principal) { if (!has(p, 'admin', 'director')) forbidden('Only administrators manage users'); }
  private view(u: typeof t.users.$inferSelect) {
    const { passwordHash, pinHash, tokenVersion: _tv, ...rest } = u;
    return { ...rest, hasPassword: !!passwordHash, hasPin: !!pinHash };
  }
  async users(p: Principal) { this.assertAdmin(p); return (await db.select().from(t.users)).map((u) => this.view(u)); }
  async createUser(p: Principal, input: { name: string; phone: string; username?: string; email?: string; roles: Role[]; entityIds?: string[]; loadingPointIds?: string[]; warehouseIds?: string[]; password?: string; pin?: string }) {
    this.assertAdmin(p);
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
    const row = { id: uid('u'), username, name: input.name.trim(), phone, email: input.email ?? null, roles: input.roles, entityIds: input.entityIds ?? [], loadingPointIds: input.loadingPointIds ?? [], warehouseIds: input.warehouseIds ?? [], driverId,
      passwordHash: input.password ? await bcrypt.hash(input.password, 10) : null, pinHash: input.pin ? await bcrypt.hash(input.pin, 10) : null };
    await db.insert(t.users).values(row);
    this.ref.invalidate();
    return this.view({ ...row, active: true, tokenVersion: 0, createdAt: iso() });
  }
  async updateUser(p: Principal, id: string, input: Partial<{ name: string; email: string; roles: Role[]; entityIds: string[]; loadingPointIds: string[]; warehouseIds: string[]; active: boolean }>) {
    this.assertAdmin(p);
    const [u] = await db.select().from(t.users).where(eq(t.users.id, id));
    if (!u) return notFound('User');
    const strList = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === 'string');
    if (input.roles !== undefined && (!strList(input.roles) || !input.roles.length || input.roles.some((r) => !ROLES.includes(r)))) fail('Pick at least one valid role');
    for (const k of ['entityIds', 'loadingPointIds', 'warehouseIds'] as const) if (input[k] !== undefined && !strList(input[k])) fail(`${k} must be a list of ids`, 400, 'bad-request');
    if (input.name !== undefined && (typeof input.name !== 'string' || !input.name.trim())) fail('Name must be text', 400, 'bad-request');
    if (input.active !== undefined && typeof input.active !== 'boolean') fail('active must be true or false', 400, 'bad-request');
    const patch = Object.fromEntries(Object.entries(input).filter(([k, v]) => v !== undefined && ['name', 'email', 'roles', 'entityIds', 'loadingPointIds', 'warehouseIds', 'active'].includes(k)));
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
    if (!has(p, 'planner', 'fleet', 'admin', 'director')) forbidden();
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
    if (!has(p, 'planner', 'fleet', 'admin', 'director')) forbidden();
    const { bundle } = await this.ref.get();
    const errs = validateRoute(input ?? {}, bundle.checkpoints.map((c) => c.id));
    if (errs.length) fail(errs.join('; '));
    const stops = input.stops.map((s) => ({ checkpointId: s.checkpointId, plannedHours: s.plannedHours, plannedDwellHours: s.plannedDwellHours }));
    const short = (cpId: string) => (bundle.checkpoints.find((c) => c.id === cpId)?.code ?? 'X').slice(0, 3);
    const row = { id: uid('r'), code: text(input.code) || `${short(stops[0].checkpointId)}-${short(stops.at(-1)!.checkpointId)}`, name: text(input.name), distanceKm: Number.isInteger(input.distanceKm) && input.distanceKm! > 0 ? input.distanceKm! : 0, stops };
    await db.insert(t.routes).values(row); this.ref.invalidate(); return row;
  }
  // ---- Transport onboarding (docs/10): providers, trucks, drivers ----------------------------------------
  private assertTransport(p: Principal) { if (!canEditTransport(p.roles)) forbidden('Only truck planners, fleet, planners, directors and admins manage transport providers'); }
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
}
