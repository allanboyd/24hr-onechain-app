// Domain contract shared by web, field app, mock and (later) the real HTTP client.
// Requirement IDs refer to docs/inspiration/Requirements_Document_Supply_Chain_System_v0_3.docx.

export type ID = string;
export type ISODate = string; // ISO 8601, stored UTC, displayed in EAT
export type Currency = 'USD' | 'KES' | 'UGX' | 'TZS' | 'RWF';

export type Role =
  | 'director' | 'planner' | 'operations' | 'loader' | 'fleet'
  | 'receiver' | 'sales' | 'accounts' | 'driver' | 'admin';

export interface User {
  id: ID; name: string; phone: string; roles: Role[];
  entityIds: ID[]; loadingPointIds: ID[]; warehouseIds: ID[]; // UA-02 + §17.7 scope
}

export interface Entity { id: ID; code: string; name: string; address: string; poPrefix: string }
export interface ReceivingCompany { id: ID; name: string; countries: string[] }
export interface Warehouse { id: ID; name: string; receivingCompanyId: ID; checkpointId: ID }
export interface Supplier { id: ID; code: string; name: string; city: string; country: string; checkpointId: ID; email: string }

export interface Product { id: ID; sku: string; brand: string; pack: string; unitsPerCase: number; sizeMl: number; supplierId: ID }
export interface PriceListItem { productId: ID; supplierId: ID; price: number; currency: Currency; from: ISODate }

export interface Provider { id: ID; name: string; regular: boolean; phone: string }
export interface Truck { id: ID; providerId: ID; reg: string; trailer: string; capacityCases: number; defaultDriverId?: ID }
export interface Driver { id: ID; name: string; phone: string; licence: string; providerId: ID; hasApp: boolean }

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
}
export interface ApprovalEvent { at: ISODate; byUserId: ID; action: 'submitted' | 'approved' | 'returned' | 'rejected' | 'amended'; comment?: string; signature?: string }
export interface Plan {
  id: ID; ref: string; title: string; entityId: ID; supplierId: ID; currency: Currency;
  date: ISODate; requiredBy: ISODate; status: ApprovalStatus; version: number;
  lines: PlanLine[]; history: ApprovalEvent[]; createdById: ID; poId?: ID;
}
export type POLineStatus = 'Ordered' | 'Loaded' | 'In transit' | 'Delivered' | 'Outstanding';
export interface PurchaseOrder {
  id: ID; ref: string; planId: ID; entityId: ID; supplierId: ID; currency: Currency;
  date: ISODate; title: string; instruction: string; version: number;
  sentAt?: ISODate; approvedById: ID; approvedAt: ISODate; signature?: string;
}

// ---- Loading / waiting list ----------------------------------------------
export interface WaitingEntry { id: ID; loadingPointId: ID; truckId: ID; driverId: ID; arrivedAt: ISODate; position: number; status: 'Waiting' | 'Assigned' | 'Loaded' }
export interface LoadingLine { planLineId: ID; productId: ID; orderedQty: number; loadedQty: number }
export interface Loading {
  id: ID; poId: ID; truckNo: number; truckId: ID; driverId: ID; loadingPointId: ID;
  loadedAt?: ISODate; lines: LoadingLine[]; agreedTransport: number; transportCurrency: Currency;
  documents: DocumentRef[]; status: 'Pending' | 'Loaded';
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
export interface Shipment { id: ID; ref: string; poId: ID; truckNo: number; receivingCompanyId: ID; warehouseId: ID; legs: Leg[]; status: LegStatus }
export interface TruckIssue { id: ID; at: ISODate; checkpointId?: ID; place: string; reason: string; fixedAt?: ISODate; newDueDate?: ISODate }
export interface EtaInfo { state: 'Early' | 'On time' | 'Late'; hours: number; eta: ISODate; nextCheckpointId?: ID }

// ---- Acknowledgement (AK-*) -----------------------------------------------
export interface AckLine { productId: ID; expected: number; received: number; damaged: number; remarks?: string }
export interface Acknowledgement {
  id: ID; legId: ID; shipmentId: ID; warehouseId: ID; receiverName: string; at: ISODate;
  lines: AckLine[]; signature?: string; photos: DocumentRef[]; hasDiscrepancy: boolean;
}

// ---- Inventory & sales (IN-*, SL-*) ---------------------------------------
export interface StockRow {
  warehouseId: ID; productId: ID; opening: number; received: number; transfersIn: number; transfersOut: number;
  damaged: number; adjustments: number; sold: number; closing: number; inTransit: number; landedCostPerCase: number;
}
export type PaymentStatus = 'Paid' | 'Part-paid' | 'Unpaid';
export interface SaleLine { productId: ID; qty: number; price: number }
export interface Sale {
  id: ID; ref: string; at: ISODate; warehouseId: ID; customer: string; salespersonId: ID;
  kind: 'Cash' | 'Credit' | 'Batch'; lines: SaleLine[]; currency: Currency; paid: number; status: PaymentStatus;
}

// ---- Trip financials & landing cost (FN-*, §17.6) -------------------------
export type CostKind = 'Transport' | 'Taxes & duties' | 'Clearing & forwarding' | 'Loading & offloading' | 'Storage' | 'Other';
export interface TripCost { id: ID; shipmentId: ID; legId?: ID; kind: CostKind; amount: number; currency: Currency; docRef?: string }
export interface TripPayment { id: ID; shipmentId: ID; costId: ID; amount: number; at: ISODate; reference: string; approvedById?: ID; status: 'Pending approval' | 'Approved' | 'Paid' }

// ---- Analytics (§9) -------------------------------------------------------
export type VelocityClass = 'Fast' | 'Normal' | 'Slow' | 'Stagnant';
export interface VelocityRow {
  productId: ID; warehouseId: ID; sold30: number; perDay: number; index: number;
  cover: number; daysSinceSale: number; cls: VelocityClass; flags: FlagKind[];
}
export type FlagKind = 'slow-moving' | 'overstock' | 'stock-out-risk' | 'dead-stock' | 'cross-compare';
export interface Flag { id: ID; kind: FlagKind; productId: ID; warehouseId: ID; text: string; at: ISODate }

// ---- Notifications & offline outbox ---------------------------------------
export interface Notification { id: ID; at: ISODate; title: string; body: string; link?: string; read: boolean; forRoles: Role[] }
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
