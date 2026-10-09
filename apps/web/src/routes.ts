import type { Role } from '@btw/api';
import type { RouteDef } from '@btw/ui';
import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
import ClipboardList from '@lucide/svelte/icons/clipboard-list';
import FileText from '@lucide/svelte/icons/file-text';
import ListOrdered from '@lucide/svelte/icons/list-ordered';
import Truck from '@lucide/svelte/icons/truck';
import Map from '@lucide/svelte/icons/map';
import Boxes from '@lucide/svelte/icons/boxes';
import ShoppingCart from '@lucide/svelte/icons/shopping-cart';
import Wallet from '@lucide/svelte/icons/wallet';
import TrendingUp from '@lucide/svelte/icons/trending-up';
import Database from '@lucide/svelte/icons/database';
import Bell from '@lucide/svelte/icons/bell';
import UsersIcon from '@lucide/svelte/icons/users';
import PlugZap from '@lucide/svelte/icons/plug-zap';

import Dashboard from './screens/Dashboard.svelte';

// Dashboard ships in the entry chunk; every other screen loads when first opened (keeps the entry under budget).
export type WebRoute = Omit<RouteDef, 'component'> & { component?: RouteDef['component']; load?: () => Promise<{ default: any }> };
export const routes: WebRoute[] = [
  { path: '/', component: Dashboard, title: 'Dashboard' },
  { path: '/plans', load: () => import('./screens/Plans.svelte'), title: 'Plans' },
  { path: '/plans/new', load: () => import('./screens/PlanNew.svelte'), title: 'New plan' },
  { path: '/plans/:id', load: () => import('./screens/PlanDetail.svelte'), title: 'Plan' },
  { path: '/pos', load: () => import('./screens/POs.svelte'), title: 'Purchase orders' },
  { path: '/pos/:id', load: () => import('./screens/POView.svelte'), title: 'Purchase order' },
  { path: '/loading', load: () => import('./screens/Loading.svelte'), title: 'Loading' },
  { path: '/shipments', load: () => import('./screens/Shipments.svelte'), title: 'Shipments' },
  { path: '/shipments/:id', load: () => import('./screens/ShipmentDetail.svelte'), title: 'Shipment' },
  { path: '/tracking', load: () => import('./screens/Tracking.svelte'), title: 'Tracking' },
  { path: '/inventory', load: () => import('./screens/Inventory.svelte'), title: 'Inventory' },
  { path: '/sales', load: () => import('./screens/Sales.svelte'), title: 'Sales' },
  { path: '/finance', load: () => import('./screens/Finance.svelte'), title: 'Trip financials' },
  { path: '/analytics', load: () => import('./screens/Analytics.svelte'), title: 'Sales velocity' },
  { path: '/master', load: () => import('./screens/MasterData.svelte'), title: 'Master data' },
  { path: '/notifications', load: () => import('./screens/Notifications.svelte'), title: 'Notifications' },
  { path: '/users', load: () => import('./screens/Users.svelte'), title: 'Users & devices' },
  { path: '/integrations', load: () => import('./screens/Integrations.svelte'), title: 'Integrations' },
];

type NavItem = { href: string; label: string; icon: any; roles?: Role[] };
const office: Role[] = ['director', 'planner', 'operations', 'fleet', 'accounts', 'admin'];
export const nav: { label: string; items: NavItem[] }[] = [
  { label: 'Overview', items: [{ href: '#/', label: 'Dashboard', icon: LayoutDashboard }] },
  { label: 'Procurement', items: [
    { href: '#/plans', label: 'Plans & approvals', icon: ClipboardList, roles: ['director', 'planner', 'admin'] },
    { href: '#/pos', label: 'Purchase orders', icon: FileText, roles: ['director', 'planner', 'operations', 'loader', 'admin'] },
  ] },
  { label: 'Logistics', items: [
    { href: '#/loading', label: 'Loading & waiting list', icon: ListOrdered, roles: ['director', 'planner', 'operations', 'loader', 'fleet', 'admin'] },
    { href: '#/shipments', label: 'Shipments & legs', icon: Truck },
    { href: '#/tracking', label: 'Tracking map', icon: Map, roles: [...office, 'receiver'] },
  ] },
  { label: 'Stock & sales', items: [
    { href: '#/inventory', label: 'Inventory', icon: Boxes },
    { href: '#/sales', label: 'Sales', icon: ShoppingCart, roles: ['director', 'sales', 'receiver', 'accounts', 'admin'] },
  ] },
  { label: 'Finance', items: [{ href: '#/finance', label: 'Trip financials', icon: Wallet, roles: ['director', 'accounts', 'fleet', 'admin'] }] },
  { label: 'Analytics', items: [{ href: '#/analytics', label: 'Sales velocity', icon: TrendingUp, roles: ['director', 'planner', 'sales', 'admin'] }] },
  { label: 'Admin', items: [
    { href: '#/master', label: 'Master data', icon: Database, roles: ['admin', 'planner', 'fleet', 'director'] },
    { href: '#/users', label: 'Users & devices', icon: UsersIcon, roles: ['admin', 'director'] },
    { href: '#/integrations', label: 'Integrations', icon: PlugZap, roles: ['admin'] },
    { href: '#/notifications', label: 'Notifications', icon: Bell },
  ] },
];

/** Field-only accounts (drivers) work in the field app; the web app sends them there. */
export const FIELD_ONLY: Role[] = ['driver'];
export const isFieldOnly = (roles: Role[]) => roles.length > 0 && roles.every((r) => FIELD_ONLY.includes(r));

/** Who may open a path: the roles of its nav entry (detail pages inherit from their list, e.g. /plans/:id → Plans).
 *  Paths without a role-limited nav entry (dashboard, shipments, inventory, notifications) are open to every web user. */
export function canOpen(path: string, roles: Role[]): boolean {
  const seg = path.split('?')[0].split('/')[1] ?? '';
  const item = nav.flatMap((g) => g.items).find((i) => i.href === `#/${seg}`);
  return !item?.roles || item.roles.some((r) => roles.includes(r));
}
