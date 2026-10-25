// Active company for the team app — the same switch the web app uses: the API client's active entity
// (`entities.setActive` → X-Entity-Id), persisted per user by the client. null = Group (directors/admins only, read-only).
import { entities, ref, type ID, type User } from '@btw/api';
import { company as brandOf } from '../companies';

const groupFiles = import.meta.glob('../../../../packages/ui/src/assets/brand/entities/group/{mark-128,mark-on-dark-128}.png', { eager: true, query: '?url&no-inline', import: 'default' }) as Record<string, string>;
export const groupMark = Object.entries(groupFiles).find(([p]) => p.endsWith('/mark-128.png'))?.[1];

export const co = $state<{ active: ID | null; rev: number }>({ active: null, rev: 0 });

const ORDER = ['BTW', 'NUD', 'KVD'];
/** Companies the user may switch to, BTW · NUD · Kivu. */
export function companiesFor(u: User) {
  return ref().entities.filter((e) => u.allowedEntityIds.includes(e.id)).sort((a, b) => ORDER.indexOf(a.code) - ORDER.indexOf(b.code)).map((e) => brandOf(e.id)!);
}
export const isGroup = () => co.active === null;
export const activeBrand = () => brandOf(co.active);
export const shortName = (id: ID | null) => (id ? ({ KVD: 'Kivu', NUD: 'Nihna' } as Record<string, string>)[brandOf(id)?.code ?? ''] ?? brandOf(id)?.code ?? '' : 'Group');

function paint() {
  const b = brandOf(co.active);
  const s = document.documentElement.style;
  if (b) { s.setProperty('--co-accent', b.accent); s.setProperty('--co-primary', b.primary); }
  else { s.removeProperty('--co-accent'); s.removeProperty('--co-primary'); }
}
/** Start in the company the client restored; staff who can't see the Group always work in one company. */
export function initCompany(u: User) {
  let a = entities.active();
  if (a && !u.allowedEntityIds.includes(a)) a = null;
  if (!a && !u.canGroup && u.allowedEntityIds.length) { a = u.allowedEntityIds[0]; entities.setActive(a); }
  co.active = a; paint();
}
export function setCompany(id: ID | null) {
  if (id === co.active) return;
  entities.setActive(id); co.active = id; co.rev++; paint();
}
/** Leaving the team shell (sign out): field screens keep their own colours. */
export function clearCompanyPaint() { const s = document.documentElement.style; s.removeProperty('--co-accent'); s.removeProperty('--co-primary'); }
