// Role names as the people know them (roles document §4, docs/12-roles-access.md).
import type { Role } from '@btw/api';

export const ROLE_LABEL: Record<Role, string> = {
  director: 'Director', planner: 'Purchase planner · static data', truck_planner: 'Truck follow-up officer', loader: 'Loader',
  receiver: 'Warehouse', reexport: 'Re-export planner', driver: 'Driver',
  fleet: 'Fleet (unassigned)', operations: 'Operations (unassigned)', accounts: 'Accounts (unassigned)', sales: 'Sales (unassigned)', admin: 'Administrator (unassigned)',
};
/** Roles offered when creating a user: the assigned ones first, the unassigned ones kept in code after. */
export const ROLE_ORDER: Role[] = ['director', 'planner', 'truck_planner', 'loader', 'receiver', 'reexport', 'driver', 'fleet', 'operations', 'accounts', 'sales', 'admin'];
/** Asie (receiver + re-export) is the warehouse-manager demo; Yonas is warehouse only. */
export const roleText = (roles: Role[]) => {
  if (roles.includes('receiver') && roles.includes('reexport')) return 'Warehouse manager · re-export';
  if (roles.includes('receiver')) return 'Warehouse';
  return roles.map((r) => ROLE_LABEL[r] ?? r).join(' · ');
};
