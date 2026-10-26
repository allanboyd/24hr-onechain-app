// Active company (docs/06-multi-company-plan.md §3). One of the user's companies, or GROUP (directors/admins).
// Persisted per user, deep-linkable with ?co=BTW|NUD|KVD|group, and handed to the API client so every list,
// report and write is scoped server-side. App.svelte remounts the screen when it changes, so data reloads.
import { configure, entities, ref, type User } from '@btw/api';
import { router } from '@btw/ui';
import { companyBrand } from './companies';

export const GROUP = 'group';
export const company = $state<{ active: string; user: string }>({ active: '', user: '' });

const GROUP_ROLES = ['director', 'admin'];
/** Directors and admins may see every company and the combined group view. */
export const canGroup = (u: User | null) => !!u && (((u as User & { canGroup?: boolean }).canGroup) ?? u.roles.some((r) => GROUP_ROLES.includes(r)));
/** Company ids this user may work in. */
export function allowedIds(u: User | null): string[] {
  if (!u) return [];
  const explicit = (u as User & { allowedEntityIds?: string[] }).allowedEntityIds;
  if (explicit?.length) return explicit;
  if (canGroup(u)) return ref().entities.map((e) => e.id);
  return u.entityIds.length ? u.entityIds : ref().entities.map((e) => e.id);
}

const key = (u: User) => `btw-company:${u.id}`;
const byCode = (code: string) => ref().entities.find((e) => e.code.toLowerCase() === code.toLowerCase())?.id;

function apply(id: string) {
  company.active = id;
  // The client scopes requests to one company; null = all the companies this user may see (group).
  (configure as (o: Record<string, unknown>) => void)({ entityId: id === GROUP ? null : id });
  const b = id === GROUP ? null : companyBrand(id);
  document.documentElement.style.setProperty('--company-accent', b?.colors.accent ?? 'var(--accent)');
}

/** Pick the starting company for a freshly signed-in / restored user. */
export function initCompany(u: User) {
  const ids = allowedIds(u);
  const fromLink = router.query.get('co');
  let saved = ''; try { saved = localStorage.getItem(key(u)) ?? ''; } catch { /* private mode */ }
  if (!saved) saved = entities.active() ?? '';
  const want = fromLink ? (fromLink.toLowerCase() === GROUP ? GROUP : byCode(fromLink) ?? '') : saved;
  const ok = (id: string) => (id === GROUP ? canGroup(u) : ids.includes(id));
  company.user = u.id;
  apply(ok(want) ? want : canGroup(u) ? GROUP : ids[0] ?? GROUP);
}

/** Switch company: persist, update the address bar (?co=) and let the shell reload the screen. */
export function setCompany(u: User, id: string) {
  if (id === company.active) return;
  try { localStorage.setItem(key(u), id); } catch { /* ignore */ }
  const [path, qs = ''] = router.path.split('?');
  const q = new URLSearchParams(qs); q.set('co', id === GROUP ? GROUP : companyBrand(id).code);
  // A detail page (plan, PO, shipment) belongs to the previous company: leave it for its list FIRST, then switch,
  // so the old page never refetches its record under the new company (which would be a "not found").
  const detail = path.match(/^\/(plans|pos|shipments)\/(?!new$)[^/]+(?:\/edit)?$/);
  if (detail) { location.hash = `/${detail[1]}?${q}`; setTimeout(() => apply(id), 0); return; }
  apply(id);
  history.replaceState(null, '', `#${path}?${q}`);
}

export const isGroup = () => company.active === GROUP;
/** Entity id to pass to report filters (undefined in group scope). */
export const scopeEntity = () => (company.active === GROUP ? undefined : company.active);
/** True when a record belongs to the active scope (client-side guard for data the API returns unscoped). */
export const inScope = (entityId: string | undefined | null) => company.active === GROUP || !entityId || entityId === company.active;
