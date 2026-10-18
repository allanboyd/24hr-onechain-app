// Who sees what in the team app. Same role × feature matrix as the web app and the API (packages/api rules FEATURES):
// the API sends `user.features`; the matrix is the fallback. Tabs and the home menu are derived from it per role.
import { ref, type FeatureKey, type Role, type User } from '@btw/api';
import { featuresFor, QUEUE_EDITORS } from '@btw/api/rules';

export type Feature = FeatureKey;
export const features = (u: User | null): Set<Feature> => new Set(!u ? [] : u.features?.length ? u.features : featuresFor(u.roles));
export const can = (u: User | null, f: Feature) => features(u).has(f);
export const hasRole = (u: User | null, ...roles: Role[]) => !!u && u.roles.some((r) => roles.includes(r));

/** Does a purchase order need a director's approval before it is issued? config.toml `approvals.purchaseOrders`
 *  (exposed as ref().config.approvals.purchaseOrders); default false = planners issue POs directly. Read defensively:
 *  older servers / the mock have no `config` yet. */
export function poApprovalRequired(): boolean {
  const r = ref() as unknown as { config?: { approvals?: { purchaseOrders?: boolean } } };
  return r.config?.approvals?.purchaseOrders ?? false;
}
/** Transport payments above this (USD) wait for a director (server setting; mock default 500). */
export function paymentLimit(): number {
  const r = ref() as unknown as { settings?: { paymentApprovalThreshold?: number } };
  return r.settings?.paymentApprovalThreshold ?? 500;
}
/** Planners and directors raise purchase orders, download the letter and email it to the supplier. */
export const canIssuePO = (u: User | null) => hasRole(u, 'planner', 'director');
/** Who reorders loading queues and onboards transport (same rules as the API). */
export const canQueue = (u: User | null) => !!u && u.roles.some((r) => QUEUE_EDITORS.includes(r));
export const canTransport = (u: User | null) => can(u, 'master-data.transport');
export const mayApprovePayments = (u: User | null) => can(u, 'finance.approve');
export const mayApprovePOs = (u: User | null) => poApprovalRequired() && can(u, 'purchase-orders.approve');

// ---- Sections ------------------------------------------------------------------------------------------------
export type SectionId = 'home' | 'queue' | 'fleet' | 'trucks' | 'tracking' | 'orders' | 'periods' | 'stock' | 'sales' | 'money' | 'reports' | 'approvals' | 'notifications' | 'more';
export interface Section { id: SectionId; label: string; short: string; path: string; feature?: Feature; hint: string }
export const SECTIONS: Record<SectionId, Section> = {
  home: { id: 'home', label: 'Home', short: 'Home', path: '/', hint: 'Your day at a glance' },
  queue: { id: 'queue', label: 'Loading queues', short: 'Queue', path: '/queue', feature: 'trucks', hint: 'Order of the trucks at your loading points' },
  fleet: { id: 'fleet', label: 'Truck desk', short: 'Trucks', path: '/fleet', feature: 'trucks', hint: 'Every truck: queue, road, border, idle — and its costs' },
  trucks: { id: 'trucks', label: 'Shipments', short: 'Trucks', path: '/trucks', feature: 'logistics', hint: 'Trucks, legs and check-ins' },
  tracking: { id: 'tracking', label: 'Tracking', short: 'Map', path: '/trucks?view=map', feature: 'logistics', hint: 'Every truck on the map' },
  orders: { id: 'orders', label: 'Purchase orders', short: 'Orders', path: '/orders', feature: 'purchase-orders', hint: 'Issued POs and drafts' },
  periods: { id: 'periods', label: 'Period plans', short: 'Plans', path: '/orders?seg=period', feature: 'period-plans', hint: 'Planned vs ordered' },
  stock: { id: 'stock', label: 'Stock', short: 'Stock', path: '/stock', feature: 'inventory', hint: 'By warehouse, days of cover' },
  sales: { id: 'sales', label: 'Sales', short: 'Sales', path: '/sales', feature: 'sales', hint: 'Sales and new sale' },
  money: { id: 'money', label: 'Payments', short: 'Money', path: '/money', feature: 'finance', hint: 'Transport owed and payments' },
  reports: { id: 'reports', label: 'Reports', short: 'Reports', path: '/reports', feature: 'reports', hint: 'Sales, on-time, plan used' },
  approvals: { id: 'approvals', label: 'Approvals', short: 'Approve', path: '/approvals', hint: 'Waiting for your decision' },
  notifications: { id: 'notifications', label: 'Notifications', short: 'Alerts', path: '/notifications', hint: 'What happened' },
  more: { id: 'more', label: 'More', short: 'More', path: '/more', hint: 'Everything else' },
};
const allowed = (u: User | null, s: Section) => !s.feature || can(u, s.feature);
/** May this user approve anything at all (payments, or POs when the config asks for approval)? */
export const approver = (u: User | null) => mayApprovePayments(u) || mayApprovePOs(u);

/** Every section the user may open (drawer + More), in a stable order. */
export function sectionsFor(u: User | null): Section[] {
  const order: SectionId[] = ['home', 'queue', 'fleet', 'trucks', 'tracking', 'orders', 'periods', 'stock', 'sales', 'money', 'reports', 'approvals', 'notifications'];
  return order.map((id) => SECTIONS[id]).filter((s) => allowed(u, s) && (s.id !== 'approvals' || approver(u)));
}

/** Bottom navigation: Home + up to three role tabs + More. Preference per role; several roles merge in order. */
const TAB_PREFS: Record<Role, SectionId[]> = {
  director: ['trucks', 'orders', 'money', 'stock'],
  planner: ['trucks', 'orders', 'stock'],
  fleet: ['trucks', 'orders', 'money'],
  truck_planner: ['queue', 'fleet', 'money'],
  operations: ['trucks', 'orders', 'money'],
  accounts: ['money', 'orders', 'trucks', 'stock'],
  sales: ['sales', 'stock', 'reports'],
  admin: ['notifications'],
  loader: ['trucks', 'orders'],
  receiver: ['stock', 'sales'],
  driver: [],
};
const TAB_ORDER: SectionId[] = ['home', 'queue', 'fleet', 'trucks', 'orders', 'stock', 'sales', 'money', 'reports', 'notifications', 'more'];
export function tabsFor(u: User | null): Section[] {
  const picked: SectionId[] = [];
  for (const r of u?.roles ?? []) for (const id of TAB_PREFS[r] ?? []) if (!picked.includes(id) && allowed(u, SECTIONS[id])) picked.push(id);
  const mid = picked.slice(0, 3);
  return TAB_ORDER.filter((id) => id === 'home' || id === 'more' || mid.includes(id)).map((id) => SECTIONS[id]);
}

/** Home "main menu": the big buttons, most used first for the role. Approvals only when something waits. */
export function menuFor(u: User | null, pendingApprovals: number): Section[] {
  const ids: SectionId[] = ['approvals', 'queue', 'fleet', 'trucks', 'tracking', 'orders', 'periods', 'stock', 'sales', 'money', 'reports'];
  return ids.map((id) => SECTIONS[id]).filter((s) => (s.id === 'approvals' ? approver(u) && pendingApprovals > 0 : allowed(u, s)));
}

export const ROLE_NAME: Record<Role, string> = {
  director: 'Director', planner: 'Planner', fleet: 'Fleet follow-up', truck_planner: 'Truck planner', operations: 'Operations', accounts: 'Accounts', sales: 'Sales',
  admin: 'Administrator', loader: 'Loading point', receiver: 'Receiver', driver: 'Driver',
};
export const roleLabel = (u: User) => u.roles.map((r) => ROLE_NAME[r]).join(' · ');
