// Standard "by company" metric sets for Group scope (components/group/CompanySplit.svelte).
// Each getter takes a company id (undefined = group) and uses the shared report functions.
import { pos, reports, shipments, type ReportFilter } from '@btw/api';
import { compact, pct, usd } from '../components/charts';
import { poApprovals } from './orders';
import type { SplitMetric } from '../components/group/CompanySplit.svelte';

const days = (n: number) => reports.resolvePeriod(n === 30 ? 'last-30' : 'last-90', Date.now());
const ent = (id: string | undefined): ReportFilter => (id ? { entityId: id } : {});

export const salesSplit = (f: ReportFilter = days(90)): SplitMetric[] => [
  { label: 'Sales', money: true, format: usd, get: async (id) => (await reports.sales({ ...f, ...ent(id) })).totals.revenue },
  { label: 'Cases sold', format: compact, get: async (id) => (await reports.sales({ ...f, ...ent(id) })).totals.cases },
  { label: 'Owed by customers', money: true, format: usd, get: async (id) => (await reports.sales({ ...f, ...ent(id) })).receivables.total },
];
export const inventorySplit = (): SplitMetric[] => [
  { label: 'Stock value', money: true, format: usd, get: async (id) => (await reports.inventory(ent(id))).totalValue },
  { label: 'Cases on hand', format: compact, get: async (id) => (await reports.inventory(ent(id))).totalCases },
  { label: 'In transit', format: compact, get: async (id) => (await reports.inventory(ent(id))).inTransitCases },
  { label: 'Stock-out risks', format: (v) => String(v), get: async (id) => { const r = (await reports.inventory(ent(id))).riskCounts; return (r['stock-out risk'] ?? 0) + (r.out ?? 0); } },
];
export const logisticsSplit = (f: ReportFilter = days(90)): SplitMetric[] => [
  { label: 'Trips delivered', format: (v) => String(v), get: async (id) => (await reports.logistics({ ...f, ...ent(id) })).delivered },
  { label: 'On time', format: (v) => pct(v), get: async (id) => (await reports.logistics({ ...f, ...ent(id) })).onTimePct },
  { label: 'Avg transit days', format: (v) => v.toFixed(1), get: async (id) => (await reports.logistics({ ...f, ...ent(id) })).avgTransitDays },
  { label: 'Damaged / short', format: (v) => pct(v, 1), get: async (id) => (await reports.logistics({ ...f, ...ent(id) })).damagePct },
];
export const financeSplit = (f: ReportFilter = days(90)): SplitMetric[] => [
  { label: 'Landing cost', money: true, format: usd, get: async (id) => (await reports.finance({ ...f, ...ent(id) })).totals.landing },
  { label: 'Per case', money: true, format: (v) => `USD ${v.toFixed(2)}`, get: async (id) => (await reports.finance({ ...f, ...ent(id) })).totals.perCase },
  { label: 'Transport owed', money: true, format: usd, get: async (id) => (await reports.finance({ ...f, ...ent(id) })).totals.balance },
];
/** Lists in group scope contain every company's rows; split them client-side by entityId. */
export const plansSplit = (): SplitMetric[] => {
  // effective POs (latest revision), deleted ones left out (docs/09 §4)
  const by = async (id: string | undefined) => (await pos.list()).filter((p) => !id || p.entityId === id);
  return [
    ...(poApprovals() ? [{ label: 'Awaiting approval', format: (v: number) => String(v), get: async (id: string | undefined) => (await by(id)).filter((p) => p.status === 'Awaiting approval').length }] : []),
    { label: 'Not yet loaded', format: (v) => String(v), get: async (id) => (await by(id)).filter((p) => p.stage === 'Created' || p.stage === 'Sent').length },
    { label: 'Order value', money: true, format: usd, get: async (id) => (await by(id)).filter((p) => p.status === 'Issued').reduce((a, p) => a + (p.amount ?? 0), 0) },
  ];
};
export const shipmentsSplit = (): SplitMetric[] => {
  const by = async (id: string | undefined) => (await shipments.list()).filter((s) => !id || (s as { entityId?: string }).entityId === id);
  return [
    { label: 'Trucks on the road', format: (v) => String(v), get: async (id) => (await by(id)).filter((s) => s.status !== 'Acknowledged' && s.status !== 'Cancelled').length },
    { label: 'Delayed', format: (v) => String(v), get: async (id) => (await by(id)).filter((s) => s.status === 'Delayed').length },
  ];
};
