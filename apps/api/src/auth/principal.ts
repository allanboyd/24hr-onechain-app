import type { Role } from '@btw/api/types';
import { seesLoadingPoint } from '@btw/api/rules';
import { fail } from '../common/errors';

/** The signed-in user with scopes (UA-02, §17.7). Attached to request.user by the guard. */
export interface Principal {
  id: string; name: string; phone: string; roles: Role[]; entityIds: string[]; loadingPointIds: string[]; warehouseIds: string[];
  driverId: string | null; channel: 'web' | 'app' | 'sms'; deviceId?: string; sessionId?: string;
  /** Companies this user may work in (directors/admins: all), whether they may use the Group view, the active company
   *  from `X-Entity-Id` (null = Group / all allowed) and the resulting scope every query and write is limited to. */
  allowedEntityIds: string[]; canGroup: boolean; activeEntityId: string | null; scope: string[];
}
export const ALL_SCOPE: Role[] = ['director', 'admin'];
export const isGlobal = (p: Principal) => p.roles.some((r) => ALL_SCOPE.includes(r));
export const has = (p: Principal, ...roles: Role[]) => p.roles.some((r) => roles.includes(r));
/** Company scope: the active company, or every allowed company when none is active. Applies to directors too. */
export const canSeeEntity = (p: Principal, entityId: string | null | undefined) => !!entityId && p.scope.includes(entityId);
/** Loading-point scope (shared rule): office roles see every point; loaders and truck planners the points on their profile
 *  (a truck planner with none listed works every loading point of their companies). */
export const canSeeLoadingPoint = (p: Principal, lp: string) => isGlobal(p) || seesLoadingPoint(p, lp);
/** Roles that operate trucks and goods (check-ins, issues, receiving, loading). Accounts and sales read only.
 *  The truck planner has everything fleet follow-up has for trucks (docs/10). */
export const OPS: Role[] = ['planner', 'operations', 'fleet', 'truck_planner'];
export const canOperate = (p: Principal) => isGlobal(p) || has(p, ...OPS, 'driver', 'loader', 'receiver');
/** Stock and sales of a warehouse. Truck planners follow trucks, not stock or sales (docs/10): not here. */
export const canSeeWarehouse = (p: Principal, wh: string) => isGlobal(p) || has(p, 'planner', 'fleet', 'operations', 'accounts') || p.warehouseIds.includes(wh);
/** Record of another company (or outside the active one): 404 so ids can't be probed. */
export const assertEntity = (p: Principal, entityId: string | null | undefined) => { if (!canSeeEntity(p, entityId)) fail('Not found', 404, 'not-found'); };
/** The company a NEW record belongs to: the one named (must be in scope), else the only company in scope.
 *  In the Group view (several companies in scope) a new record must name its company. */
export function writeEntity(p: Principal, explicit?: string | null): string {
  if (explicit) { if (!p.scope.includes(explicit)) fail('That belongs to another company', 403, 'forbidden'); return explicit; }
  if (p.scope.length === 1) return p.scope[0];
  return fail('Choose a company first — in the Group view a new record must name its company', 422, 'entity-required');
}
