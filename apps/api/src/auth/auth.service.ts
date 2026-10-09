import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, isNull, lte, or, sql } from 'drizzle-orm';
import { db, schema as t } from '../db/client';
import { fail } from '../common/errors';
import { iso, uid } from '../common/ids';
import type { Principal } from './principal';

const ACCESS_TTL_S = 15 * 60;
const REFRESH_TTL_MS = 30 * 864e5;
const hash = (s: string) => createHash('sha256').update(s).digest('hex');

// Brute-force guard (a 4-digit PIN has 10,000 combinations): 5 failures within 15 min lock that account for 15 min.
// In-memory per API process — move to Postgres/Redis when running more than one instance.
const MAX_FAILS = 5, WINDOW_MS = 15 * 60_000, LOCK_MS = 15 * 60_000;
const attempts = new Map<string, { fails: number[]; lockedUntil: number }>();
function assertNotLocked(key: string) {
  const a = attempts.get(key);
  if (a && a.lockedUntil > Date.now()) fail(`Too many wrong attempts. Try again in ${Math.ceil((a.lockedUntil - Date.now()) / 60_000)} min or ask an administrator to reset your PIN.`, 429, 'too-many-attempts');
}
function recordFailure(key: string) {
  const now = Date.now();
  const a = attempts.get(key) ?? { fails: [], lockedUntil: 0 };
  a.fails = a.fails.filter((t) => now - t < WINDOW_MS).concat(now);
  if (a.fails.length >= MAX_FAILS) { a.lockedUntil = now + LOCK_MS; a.fails = []; }
  attempts.set(key, a);
}
/** Test hook and admin PIN reset: clear a lockout. */
export const clearLoginLock = (key: string) => attempts.delete(key);

export type LoginInput = { username?: string; password?: string; phone?: string; pin?: string; deviceId?: string; platform?: string; appVersion?: string };

@Injectable()
export class AuthService {
  constructor(private jwt: JwtService) {}

  toUser(u: typeof t.users.$inferSelect) {
    return { id: u.id, name: u.name, phone: u.phone, roles: u.roles, entityIds: u.entityIds, loadingPointIds: u.loadingPointIds, warehouseIds: u.warehouseIds, username: u.username, driverId: u.driverId };
  }

  async login(input: LoginInput) {
    let u: typeof t.users.$inferSelect | undefined;
    if (typeof input !== 'object' || Array.isArray(input)) fail('Send {username, password} or {phone, pin}', 400, 'bad-request');
    const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
    const pin = str(input.pin), password = str(input.password), phone = str(input.phone), username = str(input.username);
    if ((phone || username) && pin) {
      const who = (phone ?? username ?? '').trim().toLowerCase();
      [u] = await db.select().from(t.users).where(or(eq(t.users.phone, normalizePhone(who)), eq(t.users.username, who), eq(t.users.id, who)));
      const key = `u:${u?.id ?? normalizePhone(who)}`;
      assertNotLocked(key);
      if (!u?.pinHash || !(await bcrypt.compare(pin, u.pinHash))) { recordFailure(key); fail('Wrong phone number or PIN', 401, 'unauthorized'); }
      attempts.delete(key);
    } else if (username && password) {
      const name = username.trim().toLowerCase();
      [u] = await db.select().from(t.users).where(or(eq(t.users.username, name), eq(t.users.id, name), eq(t.users.phone, normalizePhone(name))));
      const key = `u:${u?.id ?? name}`;
      assertNotLocked(key);
      if (!u?.passwordHash || !(await bcrypt.compare(password, u.passwordHash))) { recordFailure(key); fail('Wrong username or password', 401, 'unauthorized'); }
      attempts.delete(key);
    } else fail('Send {username, password} or {phone, pin}', 400, 'bad-request');
    if (!u!.active) fail('This account is disabled', 403, 'forbidden');
    const deviceId = input.deviceId || uid('dev');
    await db.insert(t.devices).values({ id: deviceId, userId: u!.id, platform: input.platform ?? (input.pin ? 'app' : 'web'), appVersion: input.appVersion ?? null })
      .onConflictDoUpdate({ target: t.devices.id, set: { userId: u!.id, revokedAt: null, lastSeenAt: iso(), appVersion: input.appVersion ?? null } });
    return this.issue(u!, deviceId);
  }

  private async issue(u: typeof t.users.$inferSelect, deviceId: string) {
    // `sid` ties the access token to its refresh token, so logout ends exactly this session (and older ones on
    // the device) — never a newer sign-in on the same device id that raced ahead of a slow logout request.
    const sid = uid('rt');
    const accessToken = await this.jwt.signAsync({ sub: u.id, tv: u.tokenVersion, dev: deviceId, sid }, { expiresIn: ACCESS_TTL_S });
    const refreshToken = randomBytes(32).toString('base64url');
    await db.insert(t.refreshTokens).values({ id: sid, userId: u.id, deviceId, tokenHash: hash(refreshToken), expiresAt: iso(Date.now() + REFRESH_TTL_MS) });
    return { accessToken, refreshToken, expiresIn: ACCESS_TTL_S, deviceId, user: this.toUser(u) };
  }

  /** Rotating refresh: the old token is revoked; reuse of a revoked token revokes the whole device session. */
  async refresh(refreshToken: string) {
    const [rt] = await db.select().from(t.refreshTokens).where(eq(t.refreshTokens.tokenHash, hash(refreshToken ?? '')));
    if (!rt) fail('Session expired, sign in again', 401, 'unauthorized');
    if (rt!.revokedAt) {
      await db.update(t.refreshTokens).set({ revokedAt: iso() }).where(and(eq(t.refreshTokens.deviceId, rt!.deviceId ?? ''), isNull(t.refreshTokens.revokedAt)));
      fail('Session expired, sign in again', 401, 'unauthorized');
    }
    if (Date.parse(rt!.expiresAt) < Date.now()) fail('Session expired, sign in again', 401, 'unauthorized');
    const [dev] = rt!.deviceId ? await db.select().from(t.devices).where(eq(t.devices.id, rt!.deviceId)) : [];
    if (dev?.revokedAt) fail('This device was signed out remotely', 401, 'device-revoked');
    const [u] = await db.select().from(t.users).where(eq(t.users.id, rt!.userId));
    if (!u?.active) fail('This account is disabled', 403, 'forbidden');
    await db.update(t.refreshTokens).set({ revokedAt: iso() }).where(eq(t.refreshTokens.id, rt!.id));
    return this.issue(u!, rt!.deviceId ?? uid('dev'));
  }

  async logout(p: Principal) {
    if (p.sessionId) {
      const [cur] = await db.select().from(t.refreshTokens).where(eq(t.refreshTokens.id, p.sessionId));
      if (cur) {
        await db.update(t.refreshTokens).set({ revokedAt: iso() }).where(and(
          isNull(t.refreshTokens.revokedAt), eq(t.refreshTokens.userId, p.id),
          cur.deviceId ? and(eq(t.refreshTokens.deviceId, cur.deviceId), lte(t.refreshTokens.createdAt, cur.createdAt)) : eq(t.refreshTokens.id, cur.id),
        ));
        return;
      }
    }
    if (p.deviceId) await db.update(t.refreshTokens).set({ revokedAt: iso() }).where(and(eq(t.refreshTokens.deviceId, p.deviceId), isNull(t.refreshTokens.revokedAt)));
  }

  /** New PIN/password, or role/scope change: end every session of that user. */
  async endAllSessions(userId: string) {
    await db.update(t.users).set({ tokenVersion: sql`${t.users.tokenVersion} + 1` }).where(eq(t.users.id, userId));
    await db.update(t.refreshTokens).set({ revokedAt: iso() }).where(and(eq(t.refreshTokens.userId, userId), isNull(t.refreshTokens.revokedAt)));
  }

  /** MA-08 remote logout of a lost device: revokes its refresh tokens and blocks its access tokens. */
  async revokeDevice(deviceId: string) {
    await db.update(t.devices).set({ revokedAt: iso() }).where(eq(t.devices.id, deviceId));
    await db.update(t.refreshTokens).set({ revokedAt: iso() }).where(and(eq(t.refreshTokens.deviceId, deviceId), isNull(t.refreshTokens.revokedAt)));
  }
}

export function normalizePhone(p: string) {
  const d = p.replace(/[^\d+]/g, '');
  if (d.startsWith('+')) return d;
  if (/^0\d{9}$/.test(d)) return '+254' + d.slice(1); // local Kenyan format 07xx…
  return d.length > 9 ? '+' + d : d;
}
