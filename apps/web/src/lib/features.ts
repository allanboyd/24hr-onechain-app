// Role × feature matrix (roles document §7, docs/12-roles-access.md). The API sends `auth.me().features`; until a user
// record carries it, the shared matrix (packages/api rules FEATURES) is the fallback. Navigation, routes and actions ask `can()`.
import type { FeatureKey, User } from '@btw/api';
import { featuresFor } from '@btw/api/rules';

export type Feature = FeatureKey;

export function features(u: User | null): Set<Feature> {
  if (!u) return new Set();
  const fromApi = u.features;
  return new Set(fromApi?.length ? fromApi : featuresFor(u.roles));
}
export const can = (u: User | null, f: Feature) => features(u).has(f);
/** Any of several features (e.g. the Master data page: static data, transport, or view only). */
export const canAny = (u: User | null, fs: Feature | Feature[]) => (Array.isArray(fs) ? fs : [fs]).some((f) => can(u, f));
