// Session + role helpers for the field app (three roles only: driver, loader = "Loading point", receiver).
import { auth, lookup, mode, ref, type Role, type User } from '@btw/api';

export type FieldRole = 'driver' | 'loader' | 'receiver';
export const ROLE_LABEL: Record<FieldRole, string> = { driver: 'Driver', loader: 'Loading point', receiver: 'Receiver' };
/** Office web app: same origin when served from one point (`pnpm start` → /app/), else VITE_WEB_URL, else local dev. */
export const WEB_URL: string = typeof location !== 'undefined' && location.pathname.startsWith('/app')
  ? `${location.origin}/`
  : (import.meta.env.VITE_WEB_URL as string | undefined) ?? 'http://localhost:5173';
export const APP_VERSION = '0.2.0';
export const DEMO_PIN = '1234';

/** The single field role this account uses (first match wins), or null for office roles → "use the web app". */
export function fieldRole(u: User): FieldRole | null {
  return (['driver', 'loader', 'receiver'] as Role[]).find((r) => u.roles.includes(r)) as FieldRole | null ?? null;
}
export const normPhone = (p: string) => p.replace(/[^\d+]/g, '').replace(/^0/, '+254');

/** Phone + PIN sign-in. The API checks the PIN; in mock mode the demo PIN is 1234 for every account. */
export async function signIn(phone: string, pin: string): Promise<User> {
  if (mode === 'mock') {
    if (!auth.demoUsers().some((x) => normPhone(x.phone) === normPhone(phone))) throw new Error('No account uses this phone number. Ask the office to add you.');
    if (pin !== DEMO_PIN) throw new Error('Wrong PIN. Try again.');
  }
  const u = auth.demoUsers().find((x) => normPhone(x.phone) === normPhone(phone));
  const me = await auth.signIn({ phone: u?.phone ?? normPhone(phone), pin });
  if (!me) throw new Error('Wrong phone number or PIN.');
  return me;
}

export const fieldUsers = () => auth.demoUsers().filter((u) => fieldRole(u));
export function driverFor(u: User) { return ref().drivers.find((d) => normPhone(d.phone) === normPhone(u.phone)); }
export const cpName = (id?: string) => (id ? lookup.checkpoint(id)?.name ?? id : '—');
/** Short, human checkpoint name for big UI: "Malaba border (KE/UG)" → "Malaba border". */
export const cpShort = (id?: string) => cpName(id).replace(/\s*\(.*\)$/, '');
/** SMS fallback code: "Malaba border (KE/UG)" → "MALABA". */
export const cpCode = (id?: string) => cpName(id).split(/[\s/(]/)[0].toUpperCase();
export const cases = (n: number) => `${new Intl.NumberFormat('en-US').format(n)} cases`;

/** Where the truck is: the newest of its last GPS ping and its last check-in at a checkpoint. */
export function legPosition(leg: import('@btw/api').Leg): { lat: number; lng: number } {
  let i = -1, t = 0;
  leg.passes.forEach((p, k) => { const at = Date.parse(p.departedAt ?? p.arrivedAt ?? ''); if (p.arrivedAt && at >= t) { i = k; t = at; } });
  if (leg.lastPing && (i < 0 || Date.parse(leg.lastPing.at) > t)) return { lat: leg.lastPing.lat, lng: leg.lastPing.lng };
  const c = lookup.checkpoint(leg.passes[Math.max(0, i)].checkpointId)!;
  return { lat: c.lat, lng: c.lng };
}
/** "35 min", "5 h", "2 d" */
export const since = (hours: number) => (hours < 1 ? `${Math.max(1, Math.round(hours * 60))} min` : hours >= 48 ? `${Math.round(hours / 24)} d` : `${Math.round(hours)} h`);
