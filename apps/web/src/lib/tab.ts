// Read the Overview/List tab and list filters from the hash query (#/sales?tab=list&kind=Credit).
import { router } from '@btw/ui';
export const currentTab = (): 'overview' | 'list' => (router.query.get('tab') === 'list' ? 'list' : 'overview');
export const qp = (k: string) => router.query.get(k) ?? '';
/** Open the List tab with filters applied. */
export function drill(base: string, filters: Record<string, string | number | undefined>) {
  const q = new URLSearchParams({ tab: 'list' });
  for (const [k, v] of Object.entries(filters)) if (v !== undefined && v !== '') q.set(k, String(v));
  router.go(`${base}?${q}`);
}
