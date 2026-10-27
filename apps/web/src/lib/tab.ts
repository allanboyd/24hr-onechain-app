// Open a list page with filters in the hash query (#/sales?status=Unpaid). Work pages open on their list (docs/17
// Phase 1); the old Overview / List tab links are dropped by lib/redirects.ts.
import { router } from '@btw/ui';
export const qp = (k: string) => router.query.get(k) ?? '';
export function drill(base: string, filters: Record<string, string | number | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) if (v !== undefined && v !== '') q.set(k, String(v));
  const s = q.toString();
  router.go(s ? `${base}?${s}` : base);
}
