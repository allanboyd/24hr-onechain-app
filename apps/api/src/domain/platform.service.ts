import { Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { and, arrayOverlaps, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { db, schema as t } from '../db/client';
import type { Role, RouteStop } from '@btw/api/types';
import { fail, forbidden, notFound } from '../common/errors';
import { iso, uid } from '../common/ids';
import { has, isGlobal, type Principal } from '../auth/principal';
import { clearLoginLock } from '../auth/auth.service';
import { normalizePhone } from '../auth/auth.service';
import { RefService } from './ref.service';

const ROLES: Role[] = ['director', 'planner', 'operations', 'loader', 'fleet', 'receiver', 'sales', 'accounts', 'driver', 'admin'];

/** Trimmed string or '' for any other input type. */
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

@Injectable()
export class PlatformService {
  constructor(private ref: RefService) {}

  // ---- Notifications (NT-01) ----------------------------------------------------
  async notifications(p: Principal) {
    const mine = eq(t.notifications.forUserId, p.id);
    const where = isGlobal(p) ? or(isNull(t.notifications.forUserId), mine) : or(arrayOverlaps(t.notifications.forRoles, p.roles), mine);
    const rows = await db.select().from(t.notifications).where(where).orderBy(desc(t.notifications.at)).limit(100);
    const reads = rows.length ? await db.select().from(t.notificationReads).where(and(eq(t.notificationReads.userId, p.id), inArray(t.notificationReads.notificationId, rows.map((r) => r.id)))) : [];
    const read = new Set(reads.map((r) => r.notificationId));
    return rows.map((r) => ({ id: r.id, at: new Date(r.at).toISOString(), title: r.title, body: r.body, link: r.link ?? undefined, read: read.has(r.id), forRoles: r.forRoles as Role[] }));
  }
  async markRead(p: Principal, ids?: string[]) {
    const list = ids?.length ? ids : (await this.notifications(p)).map((n) => n.id);
    if (list.length) await db.insert(t.notificationReads).values(list.map((id) => ({ notificationId: id, userId: p.id }))).onConflictDoNothing();
    return true;
  }

  async demoUsers() {
    return (await db.select().from(t.users).where(eq(t.users.active, true))).map((u) => ({ id: u.id, name: u.name, phone: u.phone, roles: u.roles as Role[], entityIds: u.entityIds, loadingPointIds: u.loadingPointIds, warehouseIds: u.warehouseIds }));
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
  async addTruck(p: Principal, input: { providerId: string; reg: string; trailer: string; capacityCases: number; defaultDriverId?: string }) {
    if (!has(p, 'planner', 'fleet') && !isGlobal(p)) forbidden();
    const reg = text(input.reg).toUpperCase();
    if (!reg || typeof input.providerId !== 'string') fail('Provider and registration are required');
    if (input.capacityCases !== undefined && !(Number.isInteger(input.capacityCases) && input.capacityCases > 0)) fail('Capacity must be a whole number of cases');
    const row = { id: uid('t'), providerId: input.providerId, reg, trailer: text(input.trailer).toUpperCase(), capacityCases: input.capacityCases || 2000, defaultDriverId: input.defaultDriverId ?? null };
    await db.insert(t.trucks).values(row); this.ref.invalidate(); return row;
  }
  async addDriver(p: Principal, input: { providerId: string; name: string; phone: string; licence?: string; hasApp?: boolean }) {
    if (!has(p, 'planner', 'fleet') && !isGlobal(p)) forbidden();
    if (!text(input.name) || typeof input.providerId !== 'string') fail('Provider and name are required');
    const row = { id: uid('d'), providerId: input.providerId, name: text(input.name), phone: text(input.phone) ? normalizePhone(text(input.phone)) : '', licence: text(input.licence), hasApp: input.hasApp === true };
    await db.insert(t.drivers).values(row); this.ref.invalidate(); return row;
  }
  async addProvider(p: Principal, input: { name: string; regular?: boolean; phone?: string }) {
    if (!has(p, 'planner', 'fleet') && !isGlobal(p)) forbidden();
    if (!text(input.name)) fail('Name is required');
    const row = { id: uid('pr'), name: text(input.name), regular: input.regular !== false, phone: text(input.phone) };
    await db.insert(t.providers).values(row); this.ref.invalidate(); return row;
  }
}
