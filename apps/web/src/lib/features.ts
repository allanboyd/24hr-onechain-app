// Role × feature matrix (docs/07-amendments-plan.md §E). The API sends `auth.me().features`; until a user record
// carries it, the matrix below (same keys) is the fallback. Navigation, routes and actions all ask `can()`.
import type { FeatureKey, Role, User } from '@btw/api';

export type Feature = FeatureKey;

const MATRIX: Record<Role, Feature[]> = {
  director: ['dashboard', 'period-plans', 'purchase-orders', 'purchase-orders.approve', 'planned-vs-actual', 'logistics', 'inventory', 'sales', 'finance', 'finance.approve', 'reports', 'master-data', 'users'],
  planner: ['dashboard', 'period-plans', 'purchase-orders', 'planned-vs-actual', 'logistics', 'inventory', 'sales', 'reports', 'master-data'],
  fleet: ['dashboard', 'period-plans', 'purchase-orders', 'logistics', 'finance', 'reports', 'trucks', 'master-data.transport'],
  truck_planner: ['logistics', 'finance', 'trucks', 'master-data.transport'],
  operations: ['dashboard', 'period-plans', 'purchase-orders', 'logistics', 'finance', 'reports'],
  accounts: ['dashboard', 'period-plans', 'purchase-orders', 'planned-vs-actual', 'logistics', 'inventory', 'sales', 'finance', 'reports'],
  admin: ['dashboard', 'period-plans', 'purchase-orders', 'users', 'integrations', 'master-data'],
  loader: ['purchase-orders', 'logistics'],
  receiver: ['logistics', 'inventory'],
  sales: ['inventory', 'sales', 'reports'],
  driver: [],
};

export function features(u: User | null): Set<Feature> {
  if (!u) return new Set();
  const fromApi = u.features;
  return new Set(fromApi?.length ? fromApi : u.roles.flatMap((r) => MATRIX[r] ?? []));
}
export const can = (u: User | null, f: Feature) => features(u).has(f);
/** Any of several features (e.g. the Master data page: full master data or transport only). */
export const canAny = (u: User | null, fs: Feature | Feature[]) => (Array.isArray(fs) ? fs : [fs]).some((f) => can(u, f));
