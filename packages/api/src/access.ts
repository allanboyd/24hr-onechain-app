// Who may see and do what — the roles document §7 access matrix (docs/12-roles-access.md).
// Pure functions shared by the NestJS services and the in-browser mock, so both enforce the same rules.
// "Own" scopes live on the user: buyer–supplier `pairs` (plans, POs, loadings, shipments), `loadingPointIds`
// (where a loader records loadings), `warehouseIds` (what a receiver receives and stores) and optional `routeIds`.
import type { ID, Role, UserPair } from './types';

export interface Subject {
  id?: ID; roles: Role[]; entityIds?: ID[]; loadingPointIds: ID[]; warehouseIds: ID[];
  pairs?: UserPair[] | null; routeIds?: ID[] | null; driverId?: ID | null;
}
const has = (u: Pick<Subject, 'roles'>, ...roles: Role[]) => u.roles.some((r) => roles.includes(r));

/** Directors (and the unassigned admin role): every company, every record — read-only where §7 says "View". */
export const isDirector = (u: Pick<Subject, 'roles'>) => has(u, 'director', 'admin');
/** Office roles kept in code but not assigned to anyone today (docs/12): they keep their earlier company-wide reach. */
export const LEGACY_OFFICE: Role[] = ['fleet', 'operations', 'accounts', 'sales'];
/** Roles that update every trip (truck follow-up officer = `truck_planner`; the unassigned fleet / operations roles). */
export const TRIP_ROLES: Role[] = ['truck_planner', 'fleet', 'operations'];

// ---- Buyer–supplier pairs ------------------------------------------------------------------------------------
/** Kabonge works BTW–KBL, Nihna–UBL and Kivu–SBL but not Nihna–GBI. No pairs on the profile = no pair limit. */
export function seesPair(u: Pick<Subject, 'pairs'>, entityId: ID, supplierId: ID | null | undefined): boolean {
  const ps = u.pairs ?? [];
  return !ps.length || ps.some((p) => p.entityId === entityId && p.supplierId === supplierId);
}
export const pairLabel = (p: UserPair, code: (id: ID) => string) => `${code(p.entityId)}–${code(p.supplierId)}`;

// ---- Prices (A-04) --------------------------------------------------------------------------------------------
/** Loaders, receivers (and the re-export planner) and drivers see quantities and documents — never prices or payments. */
export const NO_PRICE_ROLES: Role[] = ['loader', 'receiver', 'reexport', 'driver'];
export const seesPrices = (u: Pick<Subject, 'roles'>) => u.roles.some((r) => !NO_PRICE_ROLES.includes(r));
/** An order without its prices (`pricesHidden: true`, every line's `price` removed). */
export function withoutPrices<T extends { lines: { price?: number }[] }>(o: T): T & { pricesHidden: true } {
  return { ...o, pricesHidden: true, lines: o.lines.map((l) => { const { price: _p, ...rest } = l; return rest as typeof l; }) };
}
/** A loading without the agreed transport price / currency. */
export function loadingWithoutPrice<T extends { agreedTransport?: number | null; transportCurrency?: string }>(l: T): Omit<T, 'agreedTransport' | 'transportCurrency'> {
  const { agreedTransport: _a, transportCurrency: _c, ...rest } = l; return rest;
}

// ---- Routes (A-06, optional scope) -------------------------------------------------------------------------------
export const seesRoute = (u: Pick<Subject, 'routeIds'>, routeId: ID) => !u.routeIds?.length || u.routeIds.includes(routeId);

// ---- Loading points, queues, loadings ------------------------------------------------------------------------------
/** Roles that view every loading point's queue and loadings (planners then narrow to their pairs). */
const ALL_LP_VIEW: Role[] = ['director', 'admin', 'planner', 'truck_planner', ...LEGACY_OFFICE];
/** May this user see the queue / loadings of loading point `lp`? Loaders: their own points only. */
export function seesLoadingPoint(u: Pick<Subject, 'roles' | 'loadingPointIds'>, lp: ID): boolean {
  return has(u, ...ALL_LP_VIEW) || u.loadingPointIds.includes(lp);
}
/** May record a loading (hand-over) at `lp`: loaders and the truck follow-up officer at the points on their profile
 *  (Joel/Eric KBL, Moses UBL, Testfie GBI). Directors and Kabonge only VIEW loadings (§7). */
export const canRecordLoading = (u: Pick<Subject, 'roles' | 'loadingPointIds'>, lp: ID) => has(u, 'loader', 'truck_planner') && u.loadingPointIds.includes(lp);
/** Change a loading queue at `lp` (add, reorder, remove): the truck follow-up officer anywhere, a planner on the loading
 *  points of their pairs (Q11 — both Testfie and Kabonge, to confirm), a loader at their own point (a truck arrives). */
export function canEditQueue(u: Pick<Subject, 'roles' | 'loadingPointIds' | 'pairs'>, lp: ID): boolean {
  if (has(u, 'truck_planner', 'fleet', 'operations')) return true;
  if (has(u, 'planner') && (!u.pairs?.length || u.pairs.some((p) => p.supplierId === lp))) return true;
  return has(u, 'loader') && u.loadingPointIds.includes(lp);
}

// ---- Purchase plans and orders --------------------------------------------------------------------------------------
export interface OrderLike { entityId: ID; supplierId: ID; lines?: { deliveredToId: ID }[] }
/** 'edit' (raise / change / issue), 'view' or null. Directors all; planners their pairs; loaders and the truck
 *  follow-up officer the orders loading at their points (no prices for loaders); receivers the orders delivering to
 *  their receiving company (`myReceivingCompanies`), only their lines, no prices. */
export function orderAccess(u: Subject, o: OrderLike, myReceivingCompanies: ID[] = []): 'edit' | 'view' | null {
  if (isDirector(u)) return 'edit';
  if (has(u, 'planner') && seesPair(u, o.entityId, o.supplierId)) return 'edit';
  if (has(u, 'fleet', 'operations', 'accounts')) return 'view';
  if (has(u, 'loader', 'truck_planner') && u.loadingPointIds.includes(o.supplierId)) return 'view';
  if (has(u, 'receiver') && (o.lines ?? []).some((l) => myReceivingCompanies.includes(l.deliveredToId))) return 'view';
  return null;
}
/** What one reader gets of an order: receivers only their own lines; prices removed for no-price roles. */
export function orderFor<T extends { entityId: ID; supplierId: ID; lines: { deliveredToId: ID; price?: number }[] }>(u: Subject, o: T, myReceivingCompanies: ID[] = []): T {
  let out = o;
  if (!isDirector(u) && has(u, 'receiver') && !has(u, 'planner', 'loader', 'truck_planner', ...LEGACY_OFFICE)) out = { ...out, lines: out.lines.filter((l) => myReceivingCompanies.includes(l.deliveredToId)) };
  return seesPrices(u) ? out : withoutPrices(out);
}
/** Period plans are per company; a pair-scoped planner sees and edits only the lines of their pairs. */
export const periodLineVisible = (u: Subject, entityId: ID, supplierId: ID) => isDirector(u) || seesPair(u, entityId, supplierId);

// ---- Shipments, trips, acknowledgement ----------------------------------------------------------------------------
export interface ShipmentLike {
  entityId: ID; warehouseId: ID; fromWarehouseId?: ID | null; legs: { driverId: ID; toId: ID; fromId: ID; routeId: ID }[];
}
/** `loadingPointId` = the supplier the goods were loaded at; `myWarehouseCps` = checkpoints of the user's warehouses. */
export function seesShipment(u: Subject, sh: ShipmentLike, ctx: { loadingPointId?: ID | null; myWarehouseCps: ID[] }): boolean {
  const routeOk = !u.routeIds?.length || sh.legs.some((l) => u.routeIds!.includes(l.routeId));
  if (isDirector(u) || has(u, ...TRIP_ROLES, 'accounts')) return routeOk;
  if (has(u, 'planner') && seesPair(u, sh.entityId, ctx.loadingPointId) && routeOk) return true;
  if (has(u, 'loader') && ctx.loadingPointId && u.loadingPointIds.includes(ctx.loadingPointId) && !sh.fromWarehouseId) return true;
  if (has(u, 'receiver', 'reexport', 'sales')) {
    if (u.warehouseIds.includes(sh.warehouseId)) return true;
    if (sh.fromWarehouseId && u.warehouseIds.includes(sh.fromWarehouseId)) return true; // own onward moves (re-exports)
    if (sh.legs.some((l) => ctx.myWarehouseCps.includes(l.toId))) return true;
  }
  if (has(u, 'driver') && u.driverId && sh.legs.some((l) => l.driverId === u.driverId)) return true;
  return false;
}
/** Check-ins, issues, fixes, undo and GPS on a leg: the truck follow-up officer (all trucks) or the leg's own driver. */
export const canUpdateTrip = (u: Subject, leg: { driverId: ID }) => has(u, ...TRIP_ROLES) || (has(u, 'driver') && !!u.driverId && leg.driverId === u.driverId);
/** Dispatch (leaves the first checkpoint): also the loader at that loading point and the re-export planner at that warehouse. */
export const canDispatch = (u: Subject, leg: { driverId: ID; fromId: ID }, ctx: { myLoadingCps: ID[]; myWarehouseCps: ID[] }) =>
  canUpdateTrip(u, leg) || (has(u, 'loader', 'truck_planner') && ctx.myLoadingCps.includes(leg.fromId)) || (has(u, 'reexport') && ctx.myWarehouseCps.includes(leg.fromId));
/** Unload at a transfer point (split a leg): truck follow-up only. */
export const canSplitLeg = (u: Subject) => has(u, ...TRIP_ROLES);
/** Send goods on from a warehouse (a new shipment): truck follow-up, or the re-export planner from their own warehouse. */
export const canSendOn = (u: Subject, fromWarehouseId: ID) => has(u, ...TRIP_ROLES) || (has(u, 'reexport') && u.warehouseIds.includes(fromWarehouseId));
/** Acknowledge a delivery: the receiver of that warehouse only (directors and Kabonge view). */
export const canAcknowledge = (u: Subject, leg: { toId: ID }, myWarehouseCps: ID[]) => has(u, 'receiver') && myWarehouseCps.includes(leg.toId);

// ---- Stock, sales, money ------------------------------------------------------------------------------------------
/** Warehouse stock: directors; receivers their own warehouses (the unassigned accounts / sales roles as before). */
export const seesWarehouseStock = (u: Subject, wh: ID) => isDirector(u) || has(u, 'accounts', 'fleet', 'operations') || (has(u, 'receiver', 'sales') && u.warehouseIds.includes(wh)) || (has(u, 'sales') && !u.warehouseIds.length);
/** Record a sale: directors (sales, selling prices and trip financials are directors-only, §7); the unassigned sales/accounts roles. */
export const canSell = (u: Subject, wh: ID) => isDirector(u) || has(u, 'accounts') || (has(u, 'sales') && (!u.warehouseIds.length || u.warehouseIds.includes(wh)));
/** Record / approve payments of trip costs: directors (the unassigned accounts role records). */
export const canRecordPayment = (u: Subject) => has(u, 'director', 'accounts');
