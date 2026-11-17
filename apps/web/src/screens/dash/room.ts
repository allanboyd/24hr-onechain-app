// Cards that are the control-room pages (the specification and the HTML report).
// Everything else on a feature tab waits for Advanced analysis.
import type { DashKey } from '@btw/api';

/** Shown on the tab without the switch. One set per control-room page that already has a card. */
export const ROOM = new Set<DashKey>([
  // Overview and the executive report
  'exec-overview', 'profit-margin',
  // Plans and orders
  'plan-vs-actual',
  // Fleet and delays
  'fleet-board', 'delayed-trucks', 'truck-issues',
  // Expenses, bills and balances
  'truck-expenses', 'fee-payments', 'unpaid-fees',
  // Stock run-out, warehouse spend, opening and closing movement
  'stock-on-hand', 'stock-in-transit', 'warehouse-expenses', 'stock-movements',
  // Sales and clients
  'sales-summary', 'customer-balances', 'cash-vs-credit',
  // Documents, and the alert list the executive report points at
  'data-completeness', 'alerts',
]);

/** The report has no page for these desks, so the working cards stay on the tab. */
export const WORK = new Set<DashKey>([
  'loading-list', 'loading-status', 'dispatched-today',
  'incoming', 'received-damaged-short',
]);

/** Home-group cards that belong on a feature tab. */
export const HOME_TAB: Partial<Record<DashKey, string>> = {
  'order-this-week': 'purchasing',
  'warehouse-today': 'warehouse',
};
