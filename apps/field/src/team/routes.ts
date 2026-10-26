// Team app routes (hash router from @btw/ui, so the Android back button and browser history work).
// Links in notifications use the web app's paths (#/shipments/:id, #/pos/:id …); they map onto team screens.
// Old order-draft links (#/plans/:id, #/orders/draft/:id) parse as kind 'draft'; Team.svelte redirects them to the PO.
import type { SectionId } from './access';

export type View =
  | { tab: 'home' } | { tab: 'more' } | { tab: 'notifications' } | { tab: 'reports' } | { tab: 'approvals' }
  | { tab: 'trucks'; id?: string } | { tab: 'orders'; kind?: 'po' | 'draft' | 'period'; id?: string }
  | { tab: 'stock' } | { tab: 'sales' } | { tab: 'money'; id?: string }
  | { tab: 'queue' } | { tab: 'fleet'; id?: string } | { tab: 'load' }
  /** home drill-down lists (#/glance/<key>?…): id = the list key */
  | { tab: 'glance'; id: string };

export function parse(path: string): View {
  const [p] = path.split('?');
  const s = p.split('/').filter(Boolean).map(decodeURIComponent);
  switch (s[0]) {
    case undefined: return { tab: 'home' };
    case 'trucks': case 'shipments': case 'tracking': return { tab: 'trucks', id: s[1] };
    case 'queue': case 'loading': return { tab: 'queue' };
    case 'load': return { tab: 'load' };
    case 'fleet': return { tab: 'fleet', id: s[1] };
    case 'orders':
      if (s[1] === 'po' || s[1] === 'draft' || s[1] === 'period') return { tab: 'orders', kind: s[1], id: s[2] };
      return { tab: 'orders' };
    case 'pos': return { tab: 'orders', kind: s[1] ? 'po' : undefined, id: s[1] };
    case 'plans': return { tab: 'orders', kind: s[1] ? 'draft' : undefined, id: s[1] };
    case 'period-plans': return s[1] ? { tab: 'orders', kind: 'period', id: s[1] } : { tab: 'orders' };
    case 'stock': case 'inventory': return { tab: 'stock' };
    case 'sales': return { tab: 'sales' };
    case 'money': case 'finance': return { tab: 'money', id: s[1] };
    case 'notifications': return { tab: 'notifications' };
    case 'reports': case 'analytics': return { tab: 'reports' };
    case 'approvals': return { tab: 'approvals' };
    case 'more': return { tab: 'more' };
    case 'glance': return s[1] ? { tab: 'glance', id: s[1] } : { tab: 'home' };
    default: return { tab: 'home' };
  }
}
/** Which bottom tab lights up for a view (sections without their own tab light up More). */
export function tabOf(v: View, tabs: SectionId[]): SectionId {
  const t = v.tab as SectionId;
  return tabs.includes(t) ? t : v.tab === 'home' || v.tab === 'glance' ? 'home' : 'more';
}
export const isDetail = (v: View) => 'id' in v && !!v.id;
export const go = (path: string) => { location.hash = path; };
/** App bar titles of the home drill-down lists. */
export const GLANCE_TITLES: Record<string, string> = {
  exceptions: 'Open alerts', profit: 'Profit and margin', fees: 'Transport fees', agreed: 'Agreed prices', pipeline: 'Order pipeline',
  gaps: 'Ordered vs delivered', ageing: 'Open orders', fleet: 'Live fleet', issues: 'Truck issues', drivers: 'Driver updates',
};
