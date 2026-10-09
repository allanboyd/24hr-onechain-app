import type { Role } from '@btw/api/types';

/** The signed-in user with scopes (UA-02, §17.7). Attached to request.user by the guard. */
export interface Principal {
  id: string; name: string; phone: string; roles: Role[]; entityIds: string[]; loadingPointIds: string[]; warehouseIds: string[];
  driverId: string | null; channel: 'web' | 'app' | 'sms'; deviceId?: string; sessionId?: string;
}
export const ALL_SCOPE: Role[] = ['director', 'admin'];
export const isGlobal = (p: Principal) => p.roles.some((r) => ALL_SCOPE.includes(r));
export const has = (p: Principal, ...roles: Role[]) => p.roles.some((r) => roles.includes(r));
/** Office roles see across entities they're assigned to; directors/admin see everything. */
export const canSeeEntity = (p: Principal, entityId: string) => isGlobal(p) || p.entityIds.includes(entityId);
export const canSeeLoadingPoint = (p: Principal, lp: string) => isGlobal(p) || has(p, 'planner', 'fleet', 'operations', 'accounts') || p.loadingPointIds.includes(lp);
/** Roles that operate trucks and goods (check-ins, issues, receiving, loading). Accounts and sales read only. */
export const OPS: Role[] = ['planner', 'operations', 'fleet'];
export const canOperate = (p: Principal) => isGlobal(p) || has(p, ...OPS, 'driver', 'loader', 'receiver');
export const canSeeWarehouse = (p: Principal, wh: string) => isGlobal(p) || has(p, 'planner', 'fleet', 'operations', 'accounts') || p.warehouseIds.includes(wh);
