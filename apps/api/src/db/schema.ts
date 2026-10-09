// Operational schema. Aggregates mirror packages/api/src/types.ts; nested value objects (plan lines, leg passes,
// issues) are JSONB so the shared rules in @btw/api/rules run on them unchanged. Every scoped record carries its
// entity / loading point / warehouse / receiving company for UA-02 filtering.
import { sql } from 'drizzle-orm';
import {
  bigserial, boolean, customType, doublePrecision, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex,
} from 'drizzle-orm/pg-core';
import type {
  AckLine, ApprovalEvent, CheckpointPass, DocumentRef, LoadingLine, PlanLine, RouteStop, SaleLine, TruckIssue,
} from '@btw/api/types';

/** PostGIS geography(Point, 4326). Written with sql`ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography`. */
export const geography = customType<{ data: string }>({ dataType: () => 'geography(Point, 4326)' });
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'string' });
const now = () => sql`now()`;

// ---- Master data -----------------------------------------------------------
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  name: text('name').notNull(),
  phone: text('phone').notNull().unique(),
  email: text('email'),
  passwordHash: text('password_hash'),
  pinHash: text('pin_hash'),
  roles: text('roles').array().notNull(),
  entityIds: text('entity_ids').array().notNull().default(sql`'{}'`),
  loadingPointIds: text('loading_point_ids').array().notNull().default(sql`'{}'`),
  warehouseIds: text('warehouse_ids').array().notNull().default(sql`'{}'`),
  driverId: text('driver_id'),
  active: boolean('active').notNull().default(true),
  tokenVersion: integer('token_version').notNull().default(0),
  createdAt: ts('created_at').notNull().default(now()),
});

export const entities = pgTable('entities', { id: text('id').primaryKey(), code: text('code').notNull(), name: text('name').notNull(), address: text('address').notNull(), poPrefix: text('po_prefix').notNull() });
export const receivingCompanies = pgTable('receiving_companies', { id: text('id').primaryKey(), name: text('name').notNull(), countries: text('countries').array().notNull() });
export const warehouses = pgTable('warehouses', { id: text('id').primaryKey(), name: text('name').notNull(), receivingCompanyId: text('receiving_company_id').notNull(), checkpointId: text('checkpoint_id').notNull() });
export const suppliers = pgTable('suppliers', { id: text('id').primaryKey(), code: text('code').notNull(), name: text('name').notNull(), city: text('city').notNull(), country: text('country').notNull(), checkpointId: text('checkpoint_id').notNull(), email: text('email').notNull() });
export const products = pgTable('products', { id: text('id').primaryKey(), sku: text('sku').notNull().unique(), brand: text('brand').notNull(), pack: text('pack').notNull(), unitsPerCase: integer('units_per_case').notNull(), sizeMl: integer('size_ml').notNull(), supplierId: text('supplier_id').notNull() });
export const priceList = pgTable('price_list', {
  productId: text('product_id').notNull(), supplierId: text('supplier_id').notNull(), price: doublePrecision('price').notNull(), currency: text('currency').notNull(), from: text('from').notNull(),
}, (t) => [primaryKey({ columns: [t.productId, t.supplierId, t.from] })]);
export const providers = pgTable('providers', { id: text('id').primaryKey(), name: text('name').notNull(), regular: boolean('regular').notNull(), phone: text('phone').notNull().default('') });
export const trucks = pgTable('trucks', { id: text('id').primaryKey(), providerId: text('provider_id').notNull(), reg: text('reg').notNull().unique(), trailer: text('trailer').notNull(), capacityCases: integer('capacity_cases').notNull(), defaultDriverId: text('default_driver_id') });
export const drivers = pgTable('drivers', { id: text('id').primaryKey(), name: text('name').notNull(), phone: text('phone').notNull(), licence: text('licence').notNull().default(''), providerId: text('provider_id').notNull(), hasApp: boolean('has_app').notNull().default(false) });

export const checkpoints = pgTable('checkpoints', {
  id: text('id').primaryKey(), name: text('name').notNull(), kind: text('kind').notNull(), country: text('country').notNull(),
  lat: doublePrecision('lat').notNull(), lng: doublePrecision('lng').notNull(), radiusM: integer('radius_m').notNull(),
  code: text('code').notNull(), aliases: text('aliases').array().notNull().default(sql`'{}'`),
  geog: geography('geog').notNull(),
}, (t) => [index('checkpoints_geog_idx').using('gist', t.geog)]);
export const routes = pgTable('routes', { id: text('id').primaryKey(), code: text('code').notNull(), name: text('name').notNull(), distanceKm: integer('distance_km').notNull(), stops: jsonb('stops').$type<RouteStop[]>().notNull() });

// ---- Planning & purchase orders ---------------------------------------------
export const plans = pgTable('plans', {
  id: text('id').primaryKey(), ref: text('ref').notNull().unique(), title: text('title').notNull().default(''),
  entityId: text('entity_id').notNull(), supplierId: text('supplier_id').notNull(), currency: text('currency').notNull(),
  date: text('date').notNull(), requiredBy: text('required_by').notNull(), status: text('status').notNull(), version: integer('version').notNull(),
  lines: jsonb('lines').$type<PlanLine[]>().notNull(), history: jsonb('history').$type<ApprovalEvent[]>().notNull(),
  createdById: text('created_by_id').notNull(), poId: text('po_id'), updatedAt: ts('updated_at').notNull().default(now()),
});
/** PL-04: every approved version is kept; amendments create the next one. */
export const planVersions = pgTable('plan_versions', {
  planId: text('plan_id').notNull(), version: integer('version').notNull(), snapshot: jsonb('snapshot').notNull(), reason: text('reason'),
  byUserId: text('by_user_id').notNull(), at: ts('at').notNull().default(now()),
}, (t) => [primaryKey({ columns: [t.planId, t.version] })]);
export const pos = pgTable('pos', {
  id: text('id').primaryKey(), ref: text('ref').notNull(), planId: text('plan_id').notNull(), entityId: text('entity_id').notNull(), supplierId: text('supplier_id').notNull(),
  currency: text('currency').notNull(), date: text('date').notNull(), title: text('title').notNull(), instruction: text('instruction').notNull(), version: integer('version').notNull(),
  sentAt: ts('sent_at'), approvedById: text('approved_by_id').notNull(), approvedAt: ts('approved_at').notNull(), signature: text('signature'),
});

// ---- Loading, shipments, tracking --------------------------------------------
export const waitingEntries = pgTable('waiting_entries', {
  id: text('id').primaryKey(), loadingPointId: text('loading_point_id').notNull(), truckId: text('truck_id').notNull(), driverId: text('driver_id').notNull(),
  arrivedAt: ts('arrived_at').notNull(), position: integer('position').notNull(), status: text('status').notNull(),
});
export const loadings = pgTable('loadings', {
  id: text('id').primaryKey(), poId: text('po_id').notNull(), truckNo: integer('truck_no').notNull(), truckId: text('truck_id').notNull().default(''), driverId: text('driver_id').notNull().default(''),
  loadingPointId: text('loading_point_id').notNull(), loadedAt: ts('loaded_at'), lines: jsonb('lines').$type<LoadingLine[]>().notNull(),
  agreedTransport: doublePrecision('agreed_transport').notNull().default(0), transportCurrency: text('transport_currency').notNull().default('USD'),
  documents: jsonb('documents').$type<DocumentRef[]>().notNull().default(sql`'[]'`), status: text('status').notNull(),
});
export const shipments = pgTable('shipments', {
  id: text('id').primaryKey(), ref: text('ref').notNull().unique(), poId: text('po_id').notNull(), truckNo: integer('truck_no').notNull(),
  receivingCompanyId: text('receiving_company_id').notNull(), warehouseId: text('warehouse_id').notNull(), status: text('status').notNull(),
  entityId: text('entity_id').notNull(), loadingPointId: text('loading_point_id').notNull(), createdAt: ts('created_at').notNull().default(now()),
});
export const legs = pgTable('legs', {
  id: text('id').primaryKey(), shipmentId: text('shipment_id').notNull(), seq: integer('seq').notNull(), routeId: text('route_id').notNull(),
  fromId: text('from_id').notNull(), toId: text('to_id').notNull(), truckId: text('truck_id').notNull(), driverId: text('driver_id').notNull(),
  status: text('status').notNull(), departedAt: ts('departed_at'), plannedArrival: ts('planned_arrival').notNull(),
  passes: jsonb('passes').$type<CheckpointPass[]>().notNull(), lastPing: jsonb('last_ping').$type<{ lat: number; lng: number; at: string } | null>(),
  lines: jsonb('lines').$type<{ productId: string; loadedQty: number }[]>().notNull(), ackId: text('ack_id'),
  issues: jsonb('issues').$type<TruckIssue[]>().notNull().default(sql`'[]'`),
}, (t) => [index('legs_shipment_idx').on(t.shipmentId), index('legs_driver_idx').on(t.driverId), index('legs_to_idx').on(t.toId)]);
export const acks = pgTable('acks', {
  id: text('id').primaryKey(), legId: text('leg_id').notNull(), shipmentId: text('shipment_id').notNull(), warehouseId: text('warehouse_id').notNull(),
  receiverName: text('receiver_name').notNull(), at: ts('at').notNull(), lines: jsonb('lines').$type<AckLine[]>().notNull(), signature: text('signature'),
  photos: jsonb('photos').$type<DocumentRef[]>().notNull().default(sql`'[]'`), hasDiscrepancy: boolean('has_discrepancy').notNull(), byUserId: text('by_user_id'),
});
export const positions = pgTable('positions', {
  id: bigserial('id', { mode: 'number' }).primaryKey(), legId: text('leg_id'), truckId: text('truck_id').notNull(),
  lat: doublePrecision('lat').notNull(), lng: doublePrecision('lng').notNull(), geog: geography('geog').notNull(), at: ts('at').notNull(),
  source: text('source').notNull(), accuracyM: doublePrecision('accuracy_m'), speedKmh: doublePrecision('speed_kmh'),
}, (t) => [index('positions_leg_idx').on(t.legId, t.at)]);

// ---- Inventory, sales, finance -------------------------------------------------
export const stockMoves = pgTable('stock_moves', {
  id: bigserial('id', { mode: 'number' }).primaryKey(), warehouseId: text('warehouse_id').notNull(), productId: text('product_id').notNull(),
  kind: text('kind').notNull(), qty: integer('qty').notNull(), at: ts('at').notNull(), ref: text('ref').notNull(),
}, (t) => [index('stock_moves_wp_idx').on(t.warehouseId, t.productId, t.at)]);
export const sales = pgTable('sales', {
  id: text('id').primaryKey(), ref: text('ref').notNull(), at: ts('at').notNull(), warehouseId: text('warehouse_id').notNull(), customer: text('customer').notNull(),
  salespersonId: text('salesperson_id').notNull(), kind: text('kind').notNull(), lines: jsonb('lines').$type<SaleLine[]>().notNull(),
  currency: text('currency').notNull(), paid: doublePrecision('paid').notNull(), status: text('status').notNull(),
}, (t) => [index('sales_wh_at_idx').on(t.warehouseId, t.at)]);
export const tripCosts = pgTable('trip_costs', {
  id: text('id').primaryKey(), shipmentId: text('shipment_id').notNull(), legId: text('leg_id'), kind: text('kind').notNull(),
  amount: doublePrecision('amount').notNull(), currency: text('currency').notNull(), docRef: text('doc_ref'),
});
export const tripPayments = pgTable('trip_payments', {
  id: text('id').primaryKey(), shipmentId: text('shipment_id').notNull(), costId: text('cost_id').notNull(), amount: doublePrecision('amount').notNull(),
  at: ts('at').notNull(), reference: text('reference').notNull(), approvedById: text('approved_by_id'), status: text('status').notNull(), receiptFileId: text('receipt_file_id'),
});

// ---- Platform ---------------------------------------------------------------------
export const notifications = pgTable('notifications', {
  id: text('id').primaryKey(), at: ts('at').notNull(), title: text('title').notNull(), body: text('body').notNull(), link: text('link'),
  forRoles: text('for_roles').array().notNull(),
  /** Set for personal notifications (e.g. "trip assigned" to one driver); forRoles is then empty. */
  forUserId: text('for_user_id'),
});
export const notificationReads = pgTable('notification_reads', { notificationId: text('notification_id').notNull(), userId: text('user_id').notNull() }, (t) => [primaryKey({ columns: [t.notificationId, t.userId] })]);
export const auditLog = pgTable('audit_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(), at: ts('at').notNull().default(now()), userId: text('user_id'), channel: text('channel').notNull(),
  method: text('method').notNull(), path: text('path').notNull(), status: integer('status').notNull(), detail: jsonb('detail'),
});
export const idempotencyKeys = pgTable('idempotency_keys', {
  key: text('key').primaryKey(), userId: text('user_id').notNull(), op: text('op').notNull(), status: text('status').notNull(),
  response: jsonb('response'), at: ts('at').notNull().default(now()),
});
export const devices = pgTable('devices', {
  id: text('id').primaryKey(), userId: text('user_id').notNull(), pushToken: text('push_token'), platform: text('platform').notNull().default('web'),
  appVersion: text('app_version'), lastSeenAt: ts('last_seen_at').notNull().default(now()), revokedAt: ts('revoked_at'),
});
export const refreshTokens = pgTable('refresh_tokens', {
  id: text('id').primaryKey(), userId: text('user_id').notNull(), deviceId: text('device_id'), tokenHash: text('token_hash').notNull(),
  expiresAt: ts('expires_at').notNull(), revokedAt: ts('revoked_at'), createdAt: ts('created_at').notNull().default(now()),
}, (t) => [uniqueIndex('refresh_tokens_hash_idx').on(t.tokenHash)]);
export const files = pgTable('files', {
  id: text('id').primaryKey(), name: text('name').notNull(), contentType: text('content_type').notNull(), size: integer('size').notNull(),
  url: text('url').notNull(), byUserId: text('by_user_id'), at: ts('at').notNull().default(now()),
});
export const settings = pgTable('settings', { key: text('key').primaryKey(), value: jsonb('value').notNull() });
