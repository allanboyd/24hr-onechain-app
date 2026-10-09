import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { eq } from 'drizzle-orm';
import { db, schema as t } from '../db/client';
import { fail } from '../common/errors';
import { IS_PUBLIC, ROLES } from './decorators';
import { isGlobal, type Principal } from './principal';
import type { Role } from '@btw/api/types';

let minVersion = { v: '0.0.0', at: 0 };
async function minAppVersion() {
  if (Date.now() - minVersion.at > 60_000) {
    const [s] = await db.select().from(t.settings).where(eq(t.settings.key, 'minAppVersion'));
    minVersion = { v: String(s?.value ?? '0.0.0'), at: Date.now() };
  }
  return minVersion.v;
}
const older = (a: string, b: string) => { const x = a.split('.').map((n) => parseInt(n) || 0), y = b.split('.').map((n) => parseInt(n) || 0); for (let i = 0; i < 3; i++) { if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0); } return false; };

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private jwt: JwtService, private reflector: Reflector) {}

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    const appVersion = req.headers['x-app-version'];
    if (appVersion && older(String(appVersion), await minAppVersion())) fail('This app version is too old. Please update the app.', 426, 'upgrade-required');
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true;
    const header = String(req.headers.authorization ?? '');
    if (!header.startsWith('Bearer ')) fail('Sign in required', 401, 'unauthorized');
    let payload: { sub: string; tv: number; dev?: string; sid?: string };
    try { payload = await this.jwt.verifyAsync(header.slice(7)); } catch { return fail('Session expired', 401, 'unauthorized'); }
    const [u] = await db.select().from(t.users).where(eq(t.users.id, payload.sub));
    if (!u || !u.active || u.tokenVersion !== payload.tv) fail('Session expired', 401, 'unauthorized');
    if (payload.dev) {
      const [dev] = await db.select({ revokedAt: t.devices.revokedAt }).from(t.devices).where(eq(t.devices.id, payload.dev));
      if (dev?.revokedAt) fail('This device was signed out remotely', 401, 'device-revoked');
    }
    const channel = String(req.headers['x-channel'] ?? 'web') as Principal['channel'];
    const principal: Principal = { id: u!.id, name: u!.name, phone: u!.phone, roles: u!.roles as Role[], entityIds: u!.entityIds, loadingPointIds: u!.loadingPointIds, warehouseIds: u!.warehouseIds, driverId: u!.driverId, channel: ['web', 'app', 'sms'].includes(channel) ? channel : 'web', deviceId: payload.dev, sessionId: payload.sid };
    req.user = principal;
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES, [ctx.getHandler(), ctx.getClass()]);
    if (roles?.length && !isGlobal(principal) && !principal.roles.some((r) => roles.includes(r))) fail('Not allowed for your role', 403, 'forbidden');
    return true;
  }
}
