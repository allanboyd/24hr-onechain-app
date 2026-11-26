// One report per tab. My dashboards stays the morning desk.
// A section that repeats a panel already on the tab is left off (docs/19, docs/20).
import type { DashKey } from '@btw/api';

/** Home-group cards that belong on a feature tab. */
export const HOME_TAB: Partial<Record<DashKey, string>> = {
  'order-this-week': 'purchasing',
  'warehouse-today': 'warehouse',
  // Trip cost per truck stays on Fees. Management does not draw it, and Business no longer repeats it.
  'landed-truck': 'fees',
};

/**
 * Reading order. A person only sees the keys they may open.
 * Anything they may see that is not listed here, and not hidden, still appears after these.
 */
export const REPORT: Partial<Record<string, DashKey[]>> = {
  business: ['exec-overview', 'profit-margin', 'selling-price', 'landed-product'],
  purchasing: ['order-this-week', 'po-pipeline', 'open-orders', 'ordered-loaded-delivered', 'plan-vs-actual'],
  loading: ['loading-list', 'loading-status', 'dispatched-today', 'loading-queues'],
  fleet: ['fleet-board', 'delayed-trucks', 'truck-issues', 'border-stops', 'logistics-report'],
  fees: ['agreed-vs-actual', 'unpaid-fees', 'fee-payments', 'truck-expenses', 'landed-truck', 'trip-costs'],
  deliveries: ['incoming', 'received-damaged-short', 'delivery-losses'],
  warehouse: ['warehouse-today', 'stock-on-hand', 'fast-slow', 'stock-in-transit', 'warehouse-expenses', 'reexports', 'stock-movements'],
  sales: ['sales-summary', 'customer-balances', 'cash-vs-credit'],
  admin: ['alerts', 'data-completeness', 'users-logins', 'audit-log'],
};

/** Repeats a panel on the same tab. Not shown. */
const DUPLICATE = new Set<DashKey>([
  'orders-analysis', // pipeline, and ordered vs loaded vs delivered
  'plan-vs-actual-report', // plan vs actual
  'purchase-planning', // order this week
  'shipment-analysis', // live board, delays, delivery losses
  'driver-updates', // the live board already shows which trucks have gone quiet
  'finance-report', // landed cost on Business, trip costs on Fees
  'sales-velocity', // fast and slow
  'sales-report', // sales summary, balances, cash vs credit
  'quarterly-review', // the same sales, balances and cash vs credit, plus a long quarter pack
  'inventory-report', // stock on hand, cover and movements already show this
  'stock-analysis', // the same stock positions
  'combined-performance', // the same sales, cost and profit totals as the profit bridge
]);

/** Directors get the valued stock report (FIFO age). Warehouse staff get stock positions. Never both. */
export function hiddenReport(key: DashKey, roles: readonly string[]): boolean {
  if (DUPLICATE.has(key)) return true;
  const director = roles.includes('director') || roles.includes('admin');
  if (key === 'stock-analysis' && director) return true;
  if (key === 'inventory-report' && !director) return true;
  return false;
}

export function reportKeys(group: string, keys: DashKey[], roles: readonly string[]): DashKey[] {
  const pref = REPORT[group] ?? [];
  const keep = keys.filter((k) => !hiddenReport(k, roles));
  const rank = (k: DashKey) => {
    const i = pref.indexOf(k);
    return i < 0 ? pref.length + 1 : i;
  };
  return [...keep].sort((a, b) => rank(a) - rank(b) || keys.indexOf(a) - keys.indexOf(b));
}
