// docs/17 Phase 2: old routes → the new pages (bookmarks, notifications, e-mails, dashboard drill-downs and the phone keep
// working). Pure and tiny (part of the web entry); tested in packages/api/test/redirects.test.ts.
//   #/inventory, #/warehouse-stock      → #/stock
//   #/finance                           → #/transport-costs?tab=trips
//   #/transport-fees                    → #/transport-costs (Fees tab)
//   #/loading                           → #/trucks?tab=queues
//   #/tracking                          → #/shipments?view=map
//   #/analytics                         → #/dashboards/warehouse (fast & slow products + velocity)
//   #/reports?r=…                       → the matching Home tab; r=period → #/period-plans/check
//   ?tab=overview | ?tab=list           → dropped (work pages open on their list)
//   #/shipments?chip=…                  → #/shipments?show=… (summary strip filter)
//   #/trucks?view=expenses              → #/trucks?tab=costs

/** Old Shipments chip values → the strip / filter keys of the Shipments page. */
export const SHIPMENT_SHOW: Record<string, string> = { active: 'road', Delayed: 'delayed', 'At border': 'border', 'no-checkin': 'noCheckin', Acknowledged: 'delivered', all: 'all' };
/** Reports page tabs → Home tab (or page). */
export const REPORT_TO: Record<string, string> = {
  sales: '/dashboards/sales', quarterly: '/dashboards/sales', logistics: '/dashboards/fleet', inventory: '/dashboards/warehouse',
  pv: '/dashboards/purchasing', planning: '/dashboards/purchasing', finance: '/dashboards/fees', period: '/period-plans/check',
};
/** Pages whose own tabs use ?tab= (old Overview / List values are dropped, other values kept). */
const OLD_TABS = ['overview', 'list'];

const build = (path: string, q: URLSearchParams) => { const s = q.toString(); return s ? `${path}?${s}` : path; };
/** `first` keys go before the rest of the old query (e.g. tab=trips first). */
const withFirst = (first: Record<string, string>, rest: URLSearchParams) => {
  const q = new URLSearchParams(first);
  rest.forEach((v, k) => { if (!(k in first) && k !== 'tab') q.append(k, v); });
  return q;
};

/** Where an old hash path (with its query, without '#') should go now; null = it is current. */
export function redirectOf(hashPath: string): string | null {
  const [raw, qs = ''] = hashPath.split('?');
  const p = raw.length > 1 ? raw.replace(/\/+$/, '') : raw;
  const q = new URLSearchParams(qs);
  switch (p) {
    case '/inventory': case '/warehouse-stock': q.delete('tab'); return build('/stock', q);
    case '/finance': return build('/transport-costs', withFirst({ tab: 'trips' }, q));
    case '/transport-fees': q.delete('tab'); return build('/transport-costs', q);
    case '/loading': return build('/trucks', withFirst({ tab: 'queues' }, q));
    case '/tracking': return build('/shipments', withFirst({ view: 'map' }, q));
    case '/analytics': return '/dashboards/warehouse';
    case '/reports': {
      const to = REPORT_TO[q.get('r') ?? ''] ?? '/';
      if (to !== '/period-plans/check') return to;
      const n = new URLSearchParams();
      for (const k of ['mode', 'wh']) if (q.get(k)) n.set(k, q.get(k)!);
      return build(to, n);
    }
  }
  let changed = false;
  if (OLD_TABS.includes(q.get('tab') ?? '')) { q.delete('tab'); changed = true; }
  if (p === '/trucks' && q.get('view') === 'expenses') { q.delete('view'); q.set('tab', 'costs'); changed = true; }
  if (p === '/shipments' && q.has('chip')) { const v = SHIPMENT_SHOW[q.get('chip')!]; q.delete('chip'); if (v && v !== 'all') q.set('show', v); changed = true; }
  return changed ? build(p, q) : null;
}
