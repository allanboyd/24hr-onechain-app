import type { Role, User } from '@btw/api';
import { canAny, type Feature } from './lib/features';
import type { RouteDef } from '@btw/ui';
import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
import Bell from '@lucide/svelte/icons/bell';
import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
import Gauge from '@lucide/svelte/icons/gauge';
import Presentation from '@lucide/svelte/icons/presentation';
import ClipboardList from '@lucide/svelte/icons/clipboard-list';
import Handshake from '@lucide/svelte/icons/handshake';
import Landmark from '@lucide/svelte/icons/landmark';
import Banknote from '@lucide/svelte/icons/banknote';
import Warehouse from '@lucide/svelte/icons/warehouse';
import FileText from '@lucide/svelte/icons/file-text';
import Truck from '@lucide/svelte/icons/truck';
import Boxes from '@lucide/svelte/icons/boxes';
import ShoppingCart from '@lucide/svelte/icons/shopping-cart';
// import Wallet from '@lucide/svelte/icons/wallet';
import Database from '@lucide/svelte/icons/database';
// import ChartArea from '@lucide/svelte/icons/chart-area';
import CalendarRange from '@lucide/svelte/icons/calendar-range';
import Container from '@lucide/svelte/icons/container';
import Receipt from '@lucide/svelte/icons/receipt';
// import Tag from '@lucide/svelte/icons/tag';
import ArrowRightLeft from '@lucide/svelte/icons/arrow-right-left';


/** docs/14 screens share one lazy chunk (one import → a smaller entry). */
const mo = (k: keyof typeof import('./screens/money')) => () => import('./screens/money').then((m) => ({ default: m[k] }));
// Every screen loads when first opened (keeps the entry small); the home dashboards (docs/15) share one lazy chunk.
/** One load function for every Management page, so the shell keeps the same screen (and its report frame) between them. */
const management = () => import('./screens/management/Management.svelte');
export type WebRoute = Omit<RouteDef, 'component'> & { component?: RouteDef['component']; load?: () => Promise<{ default: any }> };
export const routes: WebRoute[] = [
  { path: '/', load: () => import('./screens/dash/Home.svelte'), title: 'Home' },
  // One home with tabs (own dashboards, feature groups, companies side by side) — old links land on the right tab
  { path: '/dashboards', load: () => import('./screens/dash/Home.svelte'), title: 'Home' },
  { path: '/dashboards/:group', load: () => import('./screens/dash/Home.svelte'), title: 'Home' },
  { path: '/overview', load: () => import('./screens/dash/Home.svelte'), title: 'Home' },
  { path: '/period-plans', load: () => import('./screens/PeriodPlans.svelte'), title: 'Period plans' },
  { path: '/period-plans/new', load: () => import('./screens/PeriodPlanNew.svelte'), title: 'New period plan' },
  // "Plan / check a period" (moved from the retired Reports page, docs/17 §4)
  { path: '/period-plans/check', load: () => import('./screens/PeriodCheck.svelte'), title: 'Plan or check a period' },
  { path: '/period-plans/:id', load: () => import('./screens/PeriodPlanDetail.svelte'), title: 'Period plan' },
  // docs/09 §4: one Purchase orders area (no drafts). Old /plans links (bookmarks, notifications) redirect to it.
  { path: '/plans', load: () => import('./screens/PlanRedirect.svelte'), title: 'Purchase orders' },
  { path: '/plans/new', load: () => import('./screens/PlanRedirect.svelte'), title: 'Create purchase order' },
  { path: '/plans/:id', load: () => import('./screens/PlanRedirect.svelte'), title: 'Purchase order' },
  { path: '/pos', load: () => import('./screens/POs.svelte'), title: 'Purchase orders' },
  { path: '/pos/new', load: () => import('./screens/PoEdit.svelte'), title: 'Create purchase order' },
  { path: '/pos/:id/edit', load: () => import('./screens/PoEdit.svelte'), title: 'Update purchase order' },
  { path: '/pos/:id', load: () => import('./screens/POView.svelte'), title: 'Purchase order' },
  { path: '/shipments', load: () => import('./screens/Shipments.svelte'), title: 'Shipments' },
  { path: '/shipments/:id', load: () => import('./screens/ShipmentDetail.svelte'), title: 'Shipment' },
  // docs/17 Phase 2: Truck desk tabs Board · Queues (was Loading & waiting list) · Providers & trucks · Costs
  { path: '/trucks', load: () => import('./screens/TruckDesk.svelte'), title: 'Truck desk' },
  // Stock = Inventory + Warehouse stock; Transport costs = Trip financials + Transport fees (docs/17 §4)
  { path: '/stock', load: () => import('./screens/Stock.svelte'), title: 'Stock' },
  { path: '/sales', load: () => import('./screens/Sales.svelte'), title: 'Sales' },
  { path: '/transport-costs', load: () => import('./screens/TransportCosts.svelte'), title: 'Transport costs' },
  { path: '/master', load: () => import('./screens/MasterData.svelte'), title: 'Master data' },
  { path: '/notifications', load: () => import('./screens/system/Workspace.svelte'), title: 'Alerts' },
  { path: '/users', load: () => import('./screens/system/Workspace.svelte'), title: 'Users & access' },
  { path: '/integrations', load: () => import('./screens/system/Workspace.svelte'), title: 'Integrations' },
  { path: '/audit', load: () => import('./screens/system/Workspace.svelte'), title: 'Audit log' },
  // V3-13: Settings & alerts workspace (left menu, one address per section); older addresses above open the same screen
  { path: '/system', load: () => import('./screens/system/Workspace.svelte'), title: 'Settings & alerts' },
  { path: '/system/:section', load: () => import('./screens/system/Workspace.svelte'), title: 'Settings & alerts' },
  // docs/14 (workstream B): warehouse money and data
  { path: '/warehouse-expenses', load: mo('WarehouseExpenses'), title: 'Warehouse expenses' },
  { path: '/re-exports', load: mo('Reexports'), title: 'Re-export orders' },
  { path: '/selling-prices', load: mo('SellingPrices'), title: 'Selling prices' },
  { path: '/performance', load: mo('Performance'), title: 'Performance' },
  // Management room (docs/23 §3): the directors' report as is; the page key picks the report page
  { path: '/management', load: management, title: 'Management' },
  { path: '/management/:page', load: management, title: 'Management' },
  { path: '/dev/charts', load: () => import('./screens/ChartGallery.svelte'), title: 'Chart gallery' }, // dev/demo only: the screen checks showDemoHelpers
  { path: '/dev/page-kit', load: () => import('./screens/PageKitGallery.svelte'), title: 'Page kit' }, // dev/demo only: the screen checks showDemoHelpers
];

/** navOnly: the feature decides who sees this menu entry, not who may open the page (the page keeps its own rule). */
/** match: when the entry shows as the current page (default: the address starts with href). */
type NavItem = { href: string; label: string; icon: any; feature?: Feature | Feature[]; navOnly?: boolean; match?: (path: string) => boolean; /** a count shown on the entry */ badge?: 'unread' };
type NavGroup = { label: string; items: NavItem[] };
/** Operations (design v3, docs/23 §2): day-to-day work, groups in process order: plan and order → load and move →
 *  receive, store and sell → admin. Labels follow the design; routes are unchanged. */
export const nav: NavGroup[] = [
  // One entry (26 Nov): Home is the dashboards page; its tabs (Overview, Business, Fleet, ...) are the live dashboards,
  // each shown only to the roles that may see it. #/dashboards/... keeps Home selected (App.svelte `active`).
  { label: 'Overview', items: [{ href: '#/', label: 'Home', icon: LayoutDashboard }] },
  { label: 'Procurement', items: [
    { href: '#/period-plans', label: 'Period plans', icon: CalendarRange, feature: 'period-plans' },
    { href: '#/pos', label: 'Purchase orders', icon: FileText, feature: 'purchase-orders' },
  ] },
  { label: 'Logistics', items: [
    { href: '#/trucks', label: 'Truck desk', icon: Container, feature: ['trucks', 'loading'] },
    { href: '#/shipments', label: 'Shipments', icon: Truck, feature: 'logistics' },
    // V3-15: the map lives on the Shipments page (Split / Map views); the separate entry is gone
    { href: '#/re-exports', label: 'Goods transfers', icon: ArrowRightLeft, feature: 're-export' },
  ] },
  { label: 'Stock & sales', items: [
    { href: '#/stock', label: 'Stock', icon: Boxes, feature: ['inventory', 'warehouse-stock'] },
    { href: '#/warehouse-expenses', label: 'Warehouse expenses', icon: Receipt, feature: 'warehouse-expenses' },
    { href: '#/sales', label: 'Sales', icon: ShoppingCart, feature: 'sales' },
  ] },
  // Taken out of the menu in design v3 (docs/23 §2, decisions 26 Nov). Pages and routes are kept; their access rule is in
  // HIDDEN so a link or typed address still checks it.
  // { label: 'Finance', items: [
  //   { href: '#/performance', label: 'Performance', icon: ChartArea, feature: 'performance' },
  //   { href: '#/selling-prices', label: 'Selling prices', icon: Tag, feature: 'selling-prices' },
  //   { href: '#/transport-costs', label: 'Transport costs', icon: Wallet, feature: ['finance', 'transport-fees'] }, // via Truck desk → Costs
  // ] },
  { label: 'Admin', items: [
    { href: '#/master', label: 'Master data', icon: Database, feature: ['master-data', 'master-data.static', 'master-data.transport'] },
    // V3-13: one entry for Settings & alerts (Alerts, My notifications, Approvals, Users & access, Audit log, Integrations)
    { href: '#/system/alerts', label: 'Settings & alerts', icon: SlidersHorizontal, navOnly: true, badge: 'unread', match: (p) => /^\/(users|audit|system|notifications|integrations)(\/|\?|$)/.test(p) },
  ] },
];
/** Management (docs/23 §3): the directors' report pages. Only for `reports`. */
export const managementNav: NavGroup[] = [
  // grouped like Operations so the menu has the same rhythm (V3-1c): summary · trading · money and warehouses
  { label: 'Summary', items: [
    { href: '#/management/overview', label: 'Overview', icon: Gauge, feature: 'reports' },
    { href: '#/management/exec', label: 'Executive report', icon: Presentation, feature: 'reports' },
  ] },
  { label: 'Trading', items: [
    { href: '#/management/plans', label: 'Plans and orders', icon: ClipboardList, feature: 'reports' },
    { href: '#/management/clients', label: 'Sales and clients', icon: Handshake, feature: 'reports' },
    { href: '#/management/suppliers', label: 'Supplier balances', icon: Landmark, feature: 'reports' },
  ] },
  { label: 'Money and warehouses', items: [
    { href: '#/management/cash', label: 'Cash and closing', icon: Banknote, feature: 'reports' },
    { href: '#/management/perf', label: 'Warehouse performance', icon: Warehouse, feature: 'reports' },
  ] },
];
/** Pages not in the sidebar, with the feature that opens them (Integrations lives under Admin settings → Master data, docs/17 §4;
 *  Performance, Selling prices and Transport costs left the menu in design v3 but keep their rule). */
const HIDDEN: Record<string, Feature | Feature[]> = {
  integrations: 'integrations',
  management: 'reports',
  performance: 'performance',
  'selling-prices': 'selling-prices',
  'transport-costs': ['finance', 'transport-fees'],
  // V3-1g: reached through System settings & logs
  // the workspace checks each section's own rule; the screen itself is open to every web user
  users: 'users', audit: 'audit',
};

export type Side = 'operations' | 'management';
/** Which side of the switch a path belongs to: the report pages are Management; the live dashboards are Operations (26 Nov). */
export const sideOf = (path: string): Side => (/^\/management(\/|$)/.test(path.split('?')[0]) ? 'management' : 'operations');
/** The switch shows only for people who may open Management. */
export const canSeeManagement = (u: User | null) => canAny(u, 'reports');
const visible = (groups: NavGroup[], u: User | null) => groups.map((g) => ({ ...g, items: g.items.filter((i) => !i.feature || canAny(u, i.feature)) })).filter((g) => g.items.length);
/** Nav groups this user may see on one side of the switch (role × feature matrix, docs/07 §E). */
export const navFor = (u: User | null, side: Side = 'operations') => visible(side === 'management' && canSeeManagement(u) ? managementNav : nav, u);
/** V3-6: the phone bottom bar. Five places by the kind of work (decided 26 Nov), the last one is More (the full menu).
 *  Office: Home, Shipments, Trucks, Alerts · Warehouse (receivers): Home, Stock, Sales, Alerts · Accounts: Home, Sales,
 *  Costs, Alerts. Places the person may not open are dropped. */
export type BottomPlace = { href: string; label: string; icon: any; badge?: 'unread'; match: (path: string) => boolean };
export function bottomFor(u: User | null): BottomPlace[] {
  if (!u) return [];
  const r = u.roles;
  const office = r.some((x) => ['director', 'admin', 'planner', 'operations', 'fleet', 'truck_planner'].includes(x));
  const at = (re: RegExp) => (p: string) => re.test(p);
  const home: BottomPlace = { href: '#/', label: 'Home', icon: LayoutDashboard, match: (p) => /^\/(dashboards(\/|$)|overview$|$|\?)/.test(p) };
  const alerts: BottomPlace = { href: '#/system/alerts', label: 'Alerts', icon: Bell, badge: 'unread', match: at(/^\/(system\/alerts|notifications)/) };
  const places: BottomPlace[] = office ? [home, { href: '#/shipments', label: 'Shipments', icon: Truck, match: at(/^\/shipments/) }, { href: '#/trucks', label: 'Trucks', icon: Container, match: at(/^\/trucks/) }, alerts]
    : r.includes('accounts') ? [home, { href: '#/sales', label: 'Sales', icon: ShoppingCart, match: at(/^\/sales/) }, { href: '#/trucks?tab=costs', label: 'Costs', icon: Container, match: at(/^\/trucks/) }, alerts]
    : [home, { href: '#/stock', label: 'Stock', icon: Boxes, match: at(/^\/stock/) }, { href: '#/sales', label: 'Sales', icon: ShoppingCart, match: at(/^\/sales/) }, alerts];
  return places.filter((x) => canOpen(x.href.slice(1).split('?')[0], u));
}
/** Home page: every web user starts on their own dashboards (docs/15, C-05). */
export function homeOf(_u: User | null): string { return '/'; }

/** Field-only accounts (drivers) work in the field app; the web app sends them there. */
export const FIELD_ONLY: Role[] = ['driver'];
export const isFieldOnly = (roles: Role[]) => roles.length > 0 && roles.every((r) => FIELD_ONLY.includes(r));

/** Who may open a path: the feature of its nav entry (detail pages inherit from their list, e.g. /pos/:id → Purchase orders).
 *  The dashboard and notifications are open to every web user; the dashboard adapts to the features. */
export function canOpen(path: string, u: User | null): boolean {
  const seg = path.split('?')[0].split('/')[1] ?? '';
  if (seg === '') return true;
  const item = [...nav, ...managementNav].flatMap((g) => g.items).find((i) => i.href === `#/${seg}` && !i.navOnly);
  const f = item?.feature ?? HIDDEN[seg];
  return !f || canAny(u, f);
}
