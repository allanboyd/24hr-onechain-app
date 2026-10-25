import type { Role, User } from '@btw/api';
import { canAny, type Feature } from './lib/features';
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
import ChartArea from '@lucide/svelte/icons/chart-area';
import CalendarRange from '@lucide/svelte/icons/calendar-range';
import Container from '@lucide/svelte/icons/container';
import ScrollText from '@lucide/svelte/icons/scroll-text';
import Receipt from '@lucide/svelte/icons/receipt';
import Tag from '@lucide/svelte/icons/tag';
import ArrowRightLeft from '@lucide/svelte/icons/arrow-right-left';
import ClipboardCheck from '@lucide/svelte/icons/clipboard-check';


/** docs/14 screens share one lazy chunk (one import → a smaller entry). */
const mo = (k: keyof typeof import('./screens/money')) => () => import('./screens/money').then((m) => ({ default: m[k] }));
// Every screen loads when first opened (keeps the entry small); the home dashboards (docs/15) share one lazy chunk.
export type WebRoute = Omit<RouteDef, 'component'> & { component?: RouteDef['component']; load?: () => Promise<{ default: any }> };
export const routes: WebRoute[] = [
  { path: '/', load: () => import('./screens/dash/Home.svelte'), title: 'Home' },
  { path: '/dashboards', load: () => import('./screens/dash/Area.svelte'), title: 'Dashboards' },
  { path: '/dashboards/:group', load: () => import('./screens/dash/Area.svelte'), title: 'Dashboards' },
  { path: '/overview', load: () => import('./screens/Dashboard.svelte'), title: 'Command view' },
  { path: '/period-plans', load: () => import('./screens/PeriodPlans.svelte'), title: 'Period plans' },
  { path: '/period-plans/new', load: () => import('./screens/PeriodPlanNew.svelte'), title: 'New period plan' },
  { path: '/period-plans/:id', load: () => import('./screens/PeriodPlanDetail.svelte'), title: 'Period plan' },
  { path: '/plans', load: () => import('./screens/Plans.svelte'), title: 'PO drafts & approvals' },
  { path: '/plans/new', load: () => import('./screens/PlanNew.svelte'), title: 'New purchase order' },
  { path: '/plans/:id', load: () => import('./screens/PlanDetail.svelte'), title: 'Purchase order draft' },
  { path: '/pos', load: () => import('./screens/POs.svelte'), title: 'Purchase orders' },
  { path: '/pos/:id', load: () => import('./screens/POView.svelte'), title: 'Purchase order' },
  { path: '/loading', load: () => import('./screens/Loading.svelte'), title: 'Loading' },
  { path: '/shipments', load: () => import('./screens/Shipments.svelte'), title: 'Shipments' },
  { path: '/shipments/:id', load: () => import('./screens/ShipmentDetail.svelte'), title: 'Shipment' },
  { path: '/tracking', load: () => import('./screens/Tracking.svelte'), title: 'Tracking' },
  { path: '/trucks', load: () => import('./screens/TruckDesk.svelte'), title: 'Truck desk' },
  { path: '/inventory', load: () => import('./screens/Inventory.svelte'), title: 'Inventory' },
  { path: '/sales', load: () => import('./screens/Sales.svelte'), title: 'Sales' },
  { path: '/finance', load: () => import('./screens/Finance.svelte'), title: 'Trip financials' },
  { path: '/analytics', load: () => import('./screens/Analytics.svelte'), title: 'Sales velocity' },
  { path: '/reports', load: () => import('./screens/Reports.svelte'), title: 'Reports' },
  { path: '/master', load: () => import('./screens/MasterData.svelte'), title: 'Master data' },
  { path: '/notifications', load: () => import('./screens/Notifications.svelte'), title: 'Notifications' },
  { path: '/users', load: () => import('./screens/Users.svelte'), title: 'Users & devices' },
  { path: '/integrations', load: () => import('./screens/Integrations.svelte'), title: 'Integrations' },
  { path: '/audit', load: () => import('./screens/Audit.svelte'), title: 'Audit log' },
  // docs/14 (workstream B): warehouse money and data
  { path: '/warehouse-stock', load: mo('WarehouseStock'), title: 'Warehouse stock' },
  { path: '/warehouse-expenses', load: mo('WarehouseExpenses'), title: 'Warehouse expenses' },
  { path: '/re-exports', load: mo('Reexports'), title: 'Re-export orders' },
  { path: '/transport-fees', load: mo('TransportFees'), title: 'Transport fees' },
  { path: '/selling-prices', load: mo('SellingPrices'), title: 'Selling prices' },
  { path: '/performance', load: mo('Performance'), title: 'Performance' },
  { path: '/dev/charts', load: () => import('./screens/ChartGallery.svelte'), title: 'Chart gallery' }, // dev/demo only: the screen checks showDemoHelpers
];

type NavItem = { href: string; label: string; icon: any; feature?: Feature | Feature[] };
export const nav: { label: string; items: NavItem[] }[] = [
  { label: 'Overview', items: [{ href: '#/', label: 'Home', icon: LayoutDashboard }, { href: '#/dashboards', label: 'Dashboards', icon: ChartArea }] },
  { label: 'Procurement', items: [
    { href: '#/period-plans', label: 'Period plans', icon: CalendarRange, feature: 'period-plans' },
    { href: '#/plans', label: 'PO drafts & approvals', icon: ClipboardList, feature: 'purchase-orders' },
    { href: '#/pos', label: 'Issued purchase orders', icon: FileText, feature: 'purchase-orders' },
  ] },
  { label: 'Logistics', items: [
    { href: '#/trucks', label: 'Truck desk', icon: Container, feature: 'trucks' },
    { href: '#/loading', label: 'Loading & waiting list', icon: ListOrdered, feature: 'loading' },
    { href: '#/shipments', label: 'Shipments & legs', icon: Truck, feature: 'logistics' },
    { href: '#/tracking', label: 'Tracking map', icon: Map, feature: 'fleet' },
    { href: '#/re-exports', label: 'Re-export orders', icon: ArrowRightLeft, feature: 're-export' },
  ] },
  { label: 'Stock & sales', items: [
    { href: '#/inventory', label: 'Inventory', icon: Boxes, feature: 'inventory' },
    { href: '#/sales', label: 'Sales', icon: ShoppingCart, feature: 'sales' },
    { href: '#/warehouse-stock', label: 'Warehouse stock', icon: ClipboardCheck, feature: 'warehouse-stock' },
    { href: '#/warehouse-expenses', label: 'Warehouse expenses', icon: Receipt, feature: 'warehouse-expenses' },
  ] },
  { label: 'Finance', items: [
    { href: '#/performance', label: 'Performance', icon: ChartArea, feature: 'performance' },
    { href: '#/selling-prices', label: 'Selling prices', icon: Tag, feature: 'selling-prices' },
    { href: '#/finance', label: 'Trip financials', icon: Wallet, feature: 'finance' },
    { href: '#/transport-fees', label: 'Transport fees', icon: Wallet, feature: 'transport-fees' },
  ] },
  { label: 'Analytics', items: [
    { href: '#/reports', label: 'Reports & planning', icon: ChartArea, feature: 'reports' },
    { href: '#/analytics', label: 'Sales velocity', icon: TrendingUp, feature: 'reports' },
  ] },
  { label: 'Admin', items: [
    { href: '#/master', label: 'Master data', icon: Database, feature: ['master-data', 'master-data.static', 'master-data.transport'] },
    { href: '#/users', label: 'Users & devices', icon: UsersIcon, feature: 'users' },
    { href: '#/audit', label: 'Audit log', icon: ScrollText, feature: 'audit' },
    { href: '#/integrations', label: 'Integrations', icon: PlugZap, feature: 'integrations' },
    { href: '#/notifications', label: 'Notifications', icon: Bell },
  ] },
];

/** Nav groups this user may see (role × feature matrix, docs/07 §E). */
export const navFor = (u: User | null) => nav.map((g) => ({ ...g, items: g.items.filter((i) => !i.feature || canAny(u, i.feature)) })).filter((g) => g.items.length);
/** Home page: every web user starts on their own dashboards (docs/15, C-05). */
export function homeOf(_u: User | null): string { return '/'; }

/** Field-only accounts (drivers) work in the field app; the web app sends them there. */
export const FIELD_ONLY: Role[] = ['driver'];
export const isFieldOnly = (roles: Role[]) => roles.length > 0 && roles.every((r) => FIELD_ONLY.includes(r));

/** Who may open a path: the feature of its nav entry (detail pages inherit from their list, e.g. /plans/:id → Plans).
 *  The dashboard and notifications are open to every web user; the dashboard adapts to the features. */
export function canOpen(path: string, u: User | null): boolean {
  const seg = path.split('?')[0].split('/')[1] ?? '';
  if (seg === '') return true;
  const item = nav.flatMap((g) => g.items).find((i) => i.href === `#/${seg}`);
  return !item?.feature || canAny(u, item.feature);
}
