// Company (tenant) scope: which companies a user may work in and which the request covers (X-Entity-Id).
import { entityAccess, resolveScope } from '@btw/api/rules';
import type { Role } from '@btw/api/types';
import { db, schema as t } from '../db/client';
import { fail } from '../common/errors';

let cache = { ids: [] as string[], at: 0 };
/** All company ids (cached 60 s; seeds and resets call invalidateEntities). */
export async function allEntityIds() {
  if (!cache.ids.length || Date.now() - cache.at > 60_000) cache = { ids: (await db.select({ id: t.entities.id }).from(t.entities)).map((r) => r.id).sort(), at: Date.now() };
  return cache.ids;
}
export const invalidateEntities = () => { cache.at = 0; };

export async function accessOf(u: { roles: string[]; entityIds: string[] }) {
  return entityAccess({ roles: u.roles as Role[], entityIds: u.entityIds }, await allEntityIds());
}
/** Scope of one request. `header` is X-Entity-Id: a company id, or empty/"GROUP" for all allowed companies. */
export function scopeOf(allowed: string[], header: unknown) {
  const raw = typeof header === 'string' ? header.trim() : '';
  const active = raw && raw.toUpperCase() !== 'GROUP' ? raw : null;
  const scope = resolveScope(allowed, active);
  if (!scope) return fail('That company is not one of yours', 403, 'forbidden-entity');
  return { activeEntityId: active, scope };
}
