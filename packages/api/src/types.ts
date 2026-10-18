// Domain contract shared by web, field app, mock and (later) the real HTTP client.
// Requirement IDs refer to docs/inspiration/Requirements_Document_Supply_Chain_System_v0_3.docx.

export type ID = string;
export type ISODate = string; // ISO 8601, stored UTC, displayed in EAT
export type Currency = 'USD' | 'KES' | 'UGX' | 'TZS' | 'RWF';

export type Role =
  | 'director' | 'planner' | 'operations' | 'loader' | 'fleet' | 'truck_planner'
  | 'receiver' | 'sales' | 'accounts' | 'driver' | 'admin';

export interface User {
  id: ID; name: string; phone: string; roles: Role[];
  entityIds: ID[]; loadingPointIds: ID[]; warehouseIds: ID[]; // UA-02 + §17.7 scope
  /** Companies this user may work in (directors/admins: all; drivers: all — their trips decide). */
  allowedEntityIds: ID[];
  /** May open the consolidated "Group · all companies" view (directors and admins). */
  canGroup: boolean;
  /** Web features this user may see (role × feature matrix, docs/07 §E); the API enforces the same matrix. */
  features?: FeatureKey[];
}
export type FeatureKey =
  | 'dashboard' | 'period-plans' | 'purchase-orders' | 'purchase-orders.approve' | 'planned-vs-actual'
  | 'logistics' | 'inventory' | 'sales' | 'finance' | 'finance.approve' | 'reports' | 'master-data' | 'users' | 'integrations'
  /** Truck desk: every truck by state, queue management across loading points, transport costs (docs/10). */
  | 'trucks'
  /** Master data limited to transport: providers, trucks and drivers (add / edit / deactivate). */
  | 'master-data.transport';

/** One of the three sibling companies (tenant). Legal/contact fields come from the client's letterheads. */
export interface Entity {
  id: ID; code: string; /** legal name */ name: string; /** trading name */ shortName: string; poPrefix: string;
  address: string[]; phones: string[]; email: string; website?: string;
  tagline: string; footerLine: string;
  colors: { primary: string; accent: string; ink: string };
  /** Folder under packages/ui/src/assets/brand/entities/<logoKey>/ (agent B's brand kit). */
  logoKey: 'btw' | 'nud' | 'kvd' | string;
  /** Statutory placeholders until the client confirms (never invented numbers). */
  kraPin: string; registrationNo: string; registeredOffice: string;
  reportingCurrency: Currency;
  letterhead: { header: string; footer: string; watermark?: string };
}
/** Approved exchange rate for one month, in units of `currency` per 1 USD: average (P&L, costs, sales) and closing (stock and balances). */
export interface FxRate { currency: Currency; month: string; avg: number; closing: number }
export interface ReceivingCompany { id: ID; name: string; countries: string[] }
/** A destination warehouse (docs/07 §D): shown as "<country> – <town>", e.g. "Rwanda – Gisenyi". */
export interface Warehouse { id: ID; name: string; receivingCompanyId: ID; checkpointId: ID; country: string; town: string; /** doc 08 §3: inactive = kept for history, not offered as a destination */ active?: boolean }
/** Doc 08 §3: add / edit a warehouse (admin, director); its geofence becomes a warehouse checkpoint. */
export interface WarehouseInput { name: string; country: string; town: string; receivingCompanyId: ID; lat: number; lng: number; radiusM?: number; active?: boolean }
export interface Supplier { id: ID; code: string; name: string; city: string; country: string; checkpointId: ID; email: string }

export interface Product {
  id: ID; sku: string; brand: string; pack: string; unitsPerCase: number; sizeMl: number; supplierId: ID;
  /** spirits | beer | wine | rtd (from the client's list, docs/08 §1) */ category?: string | null;
  /** false → the client's list gives no pack; units/size are assumptions ("to confirm") */ packConfirmed?: boolean;
  /** row number in the client's price list for that source */ sheetNo?: number | null;
}
export interface PriceListItem { productId: ID; supplierId: ID; price: number; currency: Currency; from: ISODate; /** e.g. "demo price — to confirm" */ note?: string | null }

/** Transport provider kinds (docs/10): a transport company, a sacco (truck owners' cooperative), an individual owner, or a market truck hired on the spot. */
export type ProviderKind = 'company' | 'sacco' | 'individual' | 'market';
export interface Provider {
  id: ID; name: string; regular: boolean; phone: string;
  kind?: ProviderKind; contactName?: string; email?: string; notes?: string;
  /** false = deactivated: kept for history, not offered for new queue entries */ active?: boolean;
}
export interface Truck {
  id: ID; providerId: ID; reg: string; trailer: string; capacityCases: number; defaultDriverId?: ID; /** provider's fleet number */ fleetNo?: number | null; /** e.g. "capacity to confirm" */ note?: string | null;
  /** false = deactivated (sold, off the road): kept for history, not offered for queues */ active?: boolean;
  /** optional papers: insurance, inspection, transit goods licence … (file ids or names) */ documents?: DocumentRef[];
}
export interface Driver { id: ID; name: string; /** international (E.164) */ phone: string; licence: string; providerId: ID; hasApp: boolean; /** as supplied by the client, local format */ localPhone?: string | null; /** e.g. "country code assumed +254 — to confirm" */ phoneNote?: string | null; active?: boolean }
/** Onboarding forms (truck planner, fleet, planner, director, admin). */
export interface ProviderInput { name: string; kind: ProviderKind; regular?: boolean; phone?: string; contactName?: string; email?: string; notes?: string; active?: boolean }
export interface TruckInput { providerId: ID; reg: string; trailer?: string; capacityCases: number; defaultDriverId?: ID | null; active?: boolean; note?: string | null; documents?: DocumentRef[] }
export interface DriverInput { providerId: ID; name: string; phone: string; licence?: string; hasApp?: boolean; active?: boolean }
/** A new driver with the app gets a field-app login; `pin` is shown once to the person who added them. */
export type SavedDriver = Driver & { login?: { userId: ID; username: string; pin?: string } };

// ---- Checkpoint-based tracking -------------------------------------------
export type CheckpointKind = 'loading' | 'weighbridge' | 'town' | 'border' | 'warehouse';
export interface Checkpoint {
  id: ID; name: string; kind: CheckpointKind; country: string;
  lat: number; lng: number; radiusM: number; // geofence for auto-arrival (TR-05)
  /** SMS/USSD code, e.g. MALABA (server-assigned; derive with rules.checkpointCodes in the mock). */
  code?: string; aliases?: string[];
}
export interface RouteStop { checkpointId: ID; plannedHours: number; plannedDwellHours: number }
export interface Route { id: ID; code: string; name: string; stops: RouteStop[]; distanceKm: number }

export type EventSource = 'driver' | 'geofence' | 'gps-provider' | 'sms' | 'office';
export interface CheckpointPass {
  checkpointId: ID; plannedAt: ISODate;
  arrivedAt?: ISODate; departedAt?: ISODate; source?: EventSource; note?: string;
}

// ---- Planning / PO --------------------------------------------------------
export type ApprovalStatus = 'Draft' | 'Submitted' | 'Approved' | 'Returned' | 'Rejected';
export interface PlanLine {
  id: ID; truckNo: number; productId: ID; qty: number; price: number; // amount = qty × price, never stored from input
  deliveredToId: ID; routeId: ID; // §17.7
  /** PO-06: the period-plan line this order line draws on (set by the server from the approved plan covering the date). */
  periodLineId?: ID;
  /** PO-07 (informational): above the plan's remaining quantity ('over') or not in any active plan ('unplanned'). An optional note may explain it. */
  exception?: 'over' | 'unplanned';
  exceptionReason?: string;
  /** Revision copies only: a substitute product loaded at the loading point, and the order line it replaces. */
  alternativeFor?: ID;
}
export interface ApprovalEvent {
  at: ISODate; byUserId: ID;
  /** issued = PO created without director approval (config approvals.purchase_orders = false); revised = PO revised at loading;
   *  created/edited/replaced = period plan edit history. */
  action: 'submitted' | 'approved' | 'returned' | 'rejected' | 'amended' | 'issued' | 'revised' | 'created' | 'edited' | 'replaced';
  comment?: string; signature?: string;
}
export interface Plan {
  id: ID; ref: string; title: string; entityId: ID; supplierId: ID; currency: Currency;
  date: ISODate; requiredBy: ISODate; status: ApprovalStatus; version: number;
  lines: PlanLine[]; history: ApprovalEvent[]; createdById: ID; poId?: ID;
  /** Revision copy made at loading: the original (base) order this copy revises, and its revision number (1, 2 …). */
  revisionOf?: ID; revision?: number;
  /** Set once a later revision replaces this order (it then no longer counts as ordered). */
  supersededById?: ID;
}
// ---- Period plans (§8.3 PL-06..PL-12) ---------------------------------------
export type PeriodKind = 'month' | 'quarter' | 'half' | 'year' | 'custom';
export interface PeriodPlanLine {
  id: ID; supplierId: ID; productId: ID; cases: number; price: number;
  /** destination warehouse (docs/07 §D) */ destinationId: ID;
  /** optional monthly split, 'YYYY-MM' → cases; must add up to `cases` */ months?: Record<string, number>;
}
/** Period plans are suggestions, not approvals: 'Active' (in force) or 'Replaced' (overwritten by a newer plan, kept for history). */
export type PeriodPlanStatus = 'Active' | 'Replaced';
export interface PeriodPlan {
  id: ID; ref: string; entityId: ID; title: string; periodKind: PeriodKind; from: string; to: string;
  status: PeriodPlanStatus; /** bumped on every save */ version: number; lines: PeriodPlanLine[]; /** edit history (created / edited / replaced) */ history: ApprovalEvent[]; createdById: ID;
  copiedFromId?: ID; /** the plan that replaced this one (status 'Replaced') */ replacedById?: ID;
}
/** 409 body when an Active plan of the company already covers part of the period (send `replace: true` to overwrite). */
export interface PeriodPlanConflict { id: ID; ref: string; from: string; to: string; title: string }
/** PO-06: one order line against the plan — planned, ordered on earlier POs, this PO, remaining. */
export interface PlanLineContext {
  lineId: ID; periodLineId?: ID; periodPlanId?: ID; periodPlanRef?: string;
  planned: number; orderedBefore: number; thisPo: number; remaining: number;
  exception?: 'over' | 'unplanned'; reason?: string;
}
export interface PvThresholds { /** behind when ordered-to-date < behind × expected */ behind: number; /** over when ordered > over × planned */ over: number }

export type POLineStatus = 'Ordered' | 'Loaded' | 'In transit' | 'Delivered' | 'Outstanding';
export interface PurchaseOrder {
  id: ID; ref: string; planId: ID; entityId: ID; supplierId: ID; currency: Currency;
  date: ISODate; title: string; instruction: string; version: number;
  /** approvedById/At = the director (approval) or the issuer (issued without approval) or the loader (revision). */
  sentAt?: ISODate; approvedById: ID; approvedAt: ISODate; signature?: string;
  /** How the PO came about: director approval, issued directly (approvals off), or a revision made at loading. */
  approval?: 'director' | 'issued' | 'revision';
  /** Revisions: base (original) PO id, revision number (1 → "-rev001"), what changed at loading and why. */
  revisionOf?: ID; revision?: number; changes?: PoRevisionChange[]; revisionReason?: string;
  /** Revisions are written by the system on behalf of the loader who recorded the loading. */
  createdBy?: 'system'; onBehalfOfId?: ID;
  /** Set when a later revision replaces this PO (kept viewable; reports use the latest revision). */
  supersededById?: ID;
}
/** One line of a PO revision made at loading: what was ordered vs what the truck actually took. */
export interface PoRevisionChange {
  truckNo: number; productId: ID; ordered: number; loaded: number;
  kind: 'qty' | 'missing' | 'alternative'; planLineId?: ID; /** alternatives: the order line it stands in for */ replacesPlanLineId?: ID;
}
/** Server config (apps/api/config.toml), shipped to clients in GET /ref as `config`. */
export interface AppConfig {
  approvals: { /** true = a director approves every PO before it is issued */ purchaseOrders: boolean };
  loading: { /** ± % the truck's loaded total may differ from the PO */ allowancePct: number; /** loader may load substitute products */ allowAlternatives: boolean; /** PO-001 → PO-001-rev001 */ revisionSuffix: string };
}
/** Substitute product loaded instead of (or on top of) a PO line. */
export interface LoadingAlternative { productId: ID; qty: number; replacesPlanLineId?: ID }

// ---- Loading / waiting list ----------------------------------------------
export interface WaitingEntry { id: ID; entityId: ID; loadingPointId: ID; truckId: ID; driverId: ID; arrivedAt: ISODate; position: number; status: 'Waiting' | 'Assigned' | 'Loaded' }
export interface LoadingLine { planLineId: ID; productId: ID; orderedQty: number; loadedQty: number; /** substitute loaded at the loading point (orderedQty 0) */ alternativeFor?: ID }
export interface Loading {
  id: ID; entityId: ID; poId: ID; truckNo: number; truckId: ID; driverId: ID; loadingPointId: ID;
  loadedAt?: ISODate; lines: LoadingLine[]; agreedTransport: number; transportCurrency: Currency;
  documents: DocumentRef[]; status: 'Pending' | 'Loaded';
  /** Pending trucks (computed, not stored): the PO ref a deviation at loading would create, e.g. BTW-PO-2026-0002-rev001. */
  nextRevisionRef?: string;
  /** PO reference (computed) — for roles that see loadings but not purchase orders (truck planner). */
  poRef?: string;
}
export interface DocumentRef { id: ID; kind: 'delivery-note' | 'invoice' | 'gate-pass' | 'photo' | 'signature' | 'receipt' | 'po-pdf'; name: string; url?: string }

// ---- Shipments, legs, tracking (DS-*, TR-*) --------------------------------
export type LegStatus = 'Planned' | 'Loaded' | 'Dispatched' | 'In transit' | 'At border' | 'Arrived' | 'Acknowledged' | 'Delayed' | 'Cancelled';
export interface Leg {
  id: ID; seq: number; routeId: ID; fromId: ID; toId: ID; // checkpoint ids
  truckId: ID; driverId: ID; status: LegStatus;
  departedAt?: ISODate; plannedArrival: ISODate;
  passes: CheckpointPass[]; lastPing?: { lat: number; lng: number; at: ISODate };
  lines: { productId: ID; loadedQty: number }[];
  ackId?: ID; issues: TruckIssue[];
}
/** One shipment in a journey (GET /shipments/:id/journey), origin first: loaded vs received per shipment. */
export interface JourneyStep { shipmentId: ID; ref: string; status: LegStatus; fromWarehouseId: ID | null; warehouseId: ID; parentShipmentId: ID | null; loaded: number; received: number; damaged: number; ackedAt: string | null }

/** Doc 08 §2: an onward move from a warehouse is a NEW shipment linked to the one that delivered the goods there. */
export interface Shipment {
  id: ID; entityId: ID; ref: string; poId: ID; truckNo: number; receivingCompanyId: ID; warehouseId: ID; legs: Leg[]; status: LegStatus;
  /** the shipment whose received goods this one carries on (null on a first shipment from the supplier) */
  parentShipmentId?: ID | null;
  /** the first shipment of the journey (from the supplier) */
  originShipmentId?: ID | null;
  /** warehouse the goods left (send-on); null when loaded at the supplier */
  fromWarehouseId?: ID | null;
  /** original destination when the goods were received at an intermediate warehouse instead */
  plannedWarehouseId?: ID | null;
}
export interface TruckIssue { id: ID; at: ISODate; checkpointId?: ID; place: string; reason: string; fixedAt?: ISODate; newDueDate?: ISODate }
export interface EtaInfo { state: 'Early' | 'On time' | 'Late'; hours: number; eta: ISODate; nextCheckpointId?: ID }

// ---- Acknowledgement (AK-*) -----------------------------------------------
export interface AckLine { productId: ID; expected: number; received: number; damaged: number; remarks?: string }
export interface Acknowledgement {
  id: ID; entityId: ID; legId: ID; shipmentId: ID; warehouseId: ID; receiverName: string; at: ISODate;
  lines: AckLine[]; signature?: string; photos: DocumentRef[]; hasDiscrepancy: boolean;
}

// ---- Inventory & sales (IN-*, SL-*) ---------------------------------------
export interface StockRow {
  entityId: ID; warehouseId: ID; productId: ID; opening: number; received: number; transfersIn: number; transfersOut: number;
  damaged: number; adjustments: number; sold: number; closing: number; inTransit: number; landedCostPerCase: number;
}
export type PaymentStatus = 'Paid' | 'Part-paid' | 'Unpaid';
export interface SaleLine { productId: ID; qty: number; price: number }
export interface Sale {
  id: ID; entityId: ID; ref: string; at: ISODate; warehouseId: ID; customer: string; salespersonId: ID;
  kind: 'Cash' | 'Credit' | 'Batch'; lines: SaleLine[]; currency: Currency; paid: number; status: PaymentStatus;
  /** Set when the buyer is a sibling company (intercompany): eliminated from group totals. */
  counterpartyEntityId?: ID;
}

// ---- Trip financials & landing cost (FN-*, §17.6) -------------------------
export type CostKind = 'Transport' | 'Taxes & duties' | 'Clearing & forwarding' | 'Loading & offloading' | 'Storage' | 'Other';
export interface TripCost { id: ID; entityId: ID; shipmentId: ID; legId?: ID; kind: CostKind; amount: number; currency: Currency; docRef?: string; /** units of `currency` per 1 USD (approved month average); amountUsd = amount ÷ fxRate */ fxRate?: number; amountUsd?: number }
export interface TripPayment { id: ID; entityId: ID; shipmentId: ID; costId: ID; amount: number; at: ISODate; reference: string; approvedById?: ID; status: 'Pending approval' | 'Approved' | 'Paid'; fxRate?: number; amountUsd?: number }

// ---- Analytics (§9) -------------------------------------------------------
export type VelocityClass = 'Fast' | 'Normal' | 'Slow' | 'Stagnant';
export interface VelocityRow {
  entityId: ID; productId: ID; warehouseId: ID; sold30: number; perDay: number; index: number;
  cover: number; daysSinceSale: number; cls: VelocityClass; flags: FlagKind[];
}
export type FlagKind = 'slow-moving' | 'overstock' | 'stock-out-risk' | 'dead-stock' | 'cross-compare';
export interface Flag { id: ID; entityId: ID; kind: FlagKind; productId: ID; warehouseId: ID; text: string; at: ISODate }

// ---- Notifications & offline outbox ---------------------------------------
export interface Notification { id: ID; at: ISODate; title: string; body: string; link?: string; read: boolean; forRoles: Role[]; /** company the event belongs to; null = everyone allowed */ entityId?: ID | null }
export interface OutboxItem { idempotencyKey: string; op: string; payload: unknown; createdAt: ISODate; tries: number; error?: string }

// ---- Field app working sets (driver / giver / receiver) — same shape from mock and API ----------
export interface LegView {
  shipment: Shipment & { poRef?: string }; leg: Leg; route?: Route; checkpoints: Checkpoint[]; truck?: Truck; driver?: Driver;
  eta: EtaInfo; dwell: { checkpointId: ID; hours: number; plannedDwellHours: number; over: boolean } | null;
  overdue: { checkpointId: ID; expectedAt: ISODate; hours: number } | null;
}
export interface DriverWork { driver: Driver | null; trips: LegView[] }
export interface GiverWork { loadingPoints: Supplier[]; waiting: WaitingEntry[]; toLoad: (Loading & { poRef: string; poTitle: string })[]; handover: LegView[] }
export interface ReceiverWork { warehouses: Warehouse[]; incoming: LegView[] }

// ---- Admin ---------------------------------------------------------------------------------------
export interface UserAdmin extends User { username: string; email?: string | null; active: boolean; driverId?: string | null; hasPassword: boolean; hasPin: boolean }
export interface Device { id: string; userId: ID; platform: string; appVersion?: string | null; lastSeenAt: ISODate; revokedAt?: ISODate | null; hasPush: boolean }
export interface StoredFile { id: string; url: string; size: number }
export interface SyncResult { idempotencyKey: string; status: 'applied' | 'duplicate' | 'rejected'; result?: unknown; error?: { title: string; status: number } }
