// Real API client (VITE_API=http). Same exports as mock-client.ts; index.ts picks one.
// Synchronous helpers (ref, lookup, auth.me, shipments.eta, tracking.dwell/overdue) read a cache that
// ready() / sign-in fill from GET /ref, so screens work unchanged. Writes throw Error(problem.title).
import * as R from './rules';
import * as RP from './reports';
import type {
  AckLine, Acknowledgement, CheckpointPass, Device, DriverWork, Entity, Flag, FxRate, GiverWork, ID, JourneyStep, Leg, Loading, Notification, PeriodKind, PeriodPlan, Plan, PlanLine, PoDetail, PoInput, PoUpdateInput,
  PlanLineContext, PvThresholds,
  PurchaseOrder, ReceiverWork, Role, RouteStop, Sale, Shipment, StockRow, StoredFile, SyncResult, TripCost, TripPayment,
  Route, TruckIssue, User, UserAdmin, VelocityRow, WaitingEntry, Warehouse, WarehouseInput,
  DriverInput, Provider, ProviderInput, SavedDriver, Truck, TruckInput,
  AuditFilter, AuditPage, Currency, EntityInput, Product, ProductInput, ReceivingCompany, ReceivingCompanyInput, Supplier, SupplierInput, UserPair,
  ExpenseFilter, ReexportInput, ReexportLoadInput, ReexportOrder, SellingPrice, SellingPriceInput, StockAdjustInput, StockAdjustment, TransportFeeRow,
  WarehouseExpense, WarehouseExpenseInput, WarehouseStockRow,
} from './types';
import type { PerfFilter, PerformanceReport } from './performance';
import type * as Mock from './mock-client';

type RefBundle = ReturnType<typeof Mock.ref> & { settings?: { thresholds: R.Thresholds; paymentApprovalThreshold: number; minAppVersion: string; noCheckinGraceHours: number } };
type Session = { accessToken: string; refreshToken: string; deviceId: string; user: User };

const env: Record<string, string | undefined> = ((import.meta as unknown as { env?: Record<string, string> }).env) ?? {};
let BASE = env.VITE_API_URL ?? 'http://localhost:3101/v1';
let CHANNEL: 'web' | 'app' = (env.VITE_CHANNEL as 'web' | 'app') ?? 'web';
let APP_VERSION = env.VITE_APP_VERSION ?? '';
export const mode = 'http' as const;
/** Channel/app version/base URL, and the active company (`entityId`, null = Group / all allowed companies).
 *  The company is persisted per user and sent as `X-Entity-Id` on every request. */
export function configure(o: { channel?: 'web' | 'app'; appVersion?: string; baseUrl?: string; entityId?: ID | null }) {
  if (o.channel) CHANNEL = o.channel; if (o.appVersion) APP_VERSION = o.appVersion; if (o.baseUrl) BASE = o.baseUrl.replace(/\/$/, '');
  if (!('entityId' in o)) return;
  const id = o.entityId ?? null; const u = session?.user;
  if (id && u && !(u.allowedEntityIds ?? []).includes(id)) throw new ApiError('That belongs to another company', 403);
  activeEntity = id;
  if (u) write(entityKey(u.id), id);
  emit();
}

// ---- storage ------------------------------------------------------------------------------
const ls = () => (globalThis as { localStorage?: { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void } }).localStorage;
const read = <T>(k: string): T | null => { try { const v = ls()?.getItem(k); return v ? JSON.parse(v) as T : null; } catch { return null; } };
const write = (k: string, v: unknown) => { try { v == null ? ls()?.removeItem(k) : ls()?.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };
let session: Session | null = read<Session>('btw-session');
let bundle: RefBundle | null = read<RefBundle>('btw-ref-cache');
let demoList: User[] = [];
const poRefs = new Map<string, string>();
const thresholds: R.Thresholds = { ...(bundle?.settings?.thresholds ?? R.defaultThresholds) };
// Active company (tenant). Single-company users always work in their one company.
let activeEntity: ID | null = null;
const entityKey = (userId: ID) => `btw-entity:${userId}`;
function restoreEntity() {
  activeEntity = null;
  const u = session?.user; if (!u) return;
  const allowed = u.allowedEntityIds ?? [];
  const v = read<ID>(entityKey(u.id)); if (v && allowed.includes(v)) activeEntity = v;
  if (!activeEntity && allowed.length === 1) activeEntity = allowed[0];
}
restoreEntity();

// ---- change feed + session expiry -------------------------------------------------------------
const subs = new Set<() => void>();
export function onChange(fn: () => void) { subs.add(fn); return () => subs.delete(fn); }
const emit = () => subs.forEach((f) => f());
const expiredSubs = new Set<() => void>();

// ---- transport ----------------------------------------------------------------------------------
/** `conflicts`: on a period-plan overlap (409 'overlap') the Active plans already covering the period. */
export class ApiError extends Error { conflicts?: import('./types').PeriodPlanConflict[]; constructor(message: string, public status: number, public code?: string, extra?: { conflicts?: import('./types').PeriodPlanConflict[] }) { super(message); if (extra?.conflicts) this.conflicts = extra.conflicts; } }
let refreshing: Promise<boolean> | null = null;
async function refresh(): Promise<boolean> {
  if (!session?.refreshToken) return false;
  refreshing ??= (async () => {
    try {
      const r = await fetch(`${BASE}/auth/refresh`, { method: 'POST', headers: { 'content-type': 'application/json', 'ngrok-skip-browser-warning': '1' }, body: JSON.stringify({ refreshToken: session!.refreshToken }) });
      if (!r.ok) return false;
      const s = await r.json() as Session; session = { ...s, user: s.user }; write('btw-session', session); return true;
    } catch { return false; } finally { setTimeout(() => (refreshing = null), 0); }
  })();
  return refreshing;
}
function expire() { session = null; activeEntity = null; write('btw-session', null); expiredSubs.forEach((f) => f()); emit(); }

async function call<T>(method: string, path: string, body?: unknown, opts: { idem?: string; blob?: boolean; retry?: boolean } = {}): Promise<T> {
  // ngrok's free tier shows a browser warning page unless this header is present (harmless elsewhere).
  const headers: Record<string, string> = { 'x-channel': CHANNEL, 'ngrok-skip-browser-warning': '1' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (APP_VERSION) headers['x-app-version'] = APP_VERSION;
  if (session) headers.authorization = `Bearer ${session.accessToken}`;
  if (opts.idem) headers['idempotency-key'] = opts.idem;
  if (activeEntity && session) headers['x-entity-id'] = activeEntity;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  if (res.status === 401 && session && opts.retry !== false && !path.startsWith('/auth/')) {
    if (await refresh()) return call<T>(method, path, body, { ...opts, retry: false });
    expire();
  }
  if (!res.ok) {
    let title = `${res.status} ${res.statusText}`; let code: string | undefined; let conflicts: import('./types').PeriodPlanConflict[] | undefined;
    try { const p = await res.json(); title = p.title ?? p.message ?? title; code = p.code; conflicts = Array.isArray(p.conflicts) ? p.conflicts : undefined; } catch { /* not JSON */ }
    throw new ApiError(title, res.status, code, { conflicts });
  }
  if (opts.blob) return (await res.blob()) as T;
  if (res.status === 204) return undefined as T;
  const txt = await res.text();
  return (txt ? JSON.parse(txt) : undefined) as T;
}
const get = <T>(p: string) => call<T>('GET', p);
const post = <T>(p: string, b?: unknown, idem?: string) => call<T>('POST', p, b ?? {}, { idem });
const orNull = async <T>(p: Promise<T>): Promise<T | null> => { try { return await p; } catch (e) { if (e instanceof ApiError && e.status === 404) return null; throw e; } };
const key = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
const mutate = async <T>(p: Promise<T>) => { const r = await p; emit(); return r; };

async function loadRef() {
  const b = await get<RefBundle>('/ref');
  bundle = b; write('btw-ref-cache', b);
  Object.assign(thresholds, b.settings?.thresholds ?? R.defaultThresholds);
}

/** Call once before rendering: validates the stored session and loads reference data (cached for offline). */
export async function ready() {
  // Demo pickers on both login screens: always load, even if a session is restored (otherwise a refresh-then-sign-out leaves an empty list).
  try { demoList = await get<User[]>('/auth/demo-users'); } catch { /* API down — leave empty */ }
  if (session) {
    try { const me = await get<User>('/me'); session = { ...session, user: { ...session.user, ...me } }; write('btw-session', session); restoreEntity(); await loadRef(); }
    catch (e) { if (e instanceof TypeError) return; /* offline: keep cached session + ref */ if (e instanceof ApiError && e.status === 401) expire(); }
  }
}

// ---- session -------------------------------------------------------------------------------------
async function signIn(input: { username?: string; password?: string; phone?: string; pin?: string }) {
  // Phones keep one device id (remote sign-out of a lost phone, push token); each web sign-in is its own device,
  // so a slow logout from an earlier browser session can never end the new one.
  const deviceId = CHANNEL === 'app' ? session?.deviceId ?? read<Session>('btw-last-device')?.deviceId : undefined;
  const s = await call<Session>('POST', '/auth/login', { ...input, deviceId, platform: CHANNEL, appVersion: APP_VERSION || undefined });
  session = s; write('btw-session', s); write('btw-last-device', { deviceId: s.deviceId });
  restoreEntity(); await loadRef(); emit();
  return s.user;
}
export const auth = {
  demoUsers: () => demoList,
  me: () => session?.user ?? null,
  /** Demo pickers pass a user id + PIN (4–6 digits) or password. */
  async login(userId: ID, secret: string) { return signIn(/^\d{4,6}$/.test(secret) ? { username: userId, pin: secret } : { username: userId, password: secret }); },
  signIn,
  /** Signs out locally at once; the returned promise settles when the server has ended this session (≤ 5 s). */
  logout(): Promise<void> {
    const s = session; session = null; activeEntity = null; write('btw-session', null); emit();
    if (!s) return Promise.resolve();
    const headers: Record<string, string> = { 'content-type': 'application/json', 'x-channel': CHANNEL, authorization: `Bearer ${s.accessToken}` };
    return fetch(`${BASE}/auth/logout`, { method: 'POST', headers, body: '{}', signal: AbortSignal.timeout?.(5000) }).then(() => undefined, () => undefined);
  },
  has: (...roles: Role[]) => !!session && session.user.roles.some((r) => roles.includes(r)),
  /** Called when the session can't be refreshed (expired, revoked device). */
  onExpired(fn: () => void) { expiredSubs.add(fn); return () => expiredSubs.delete(fn); },
};

// ---- reference data (sync, from cache) --------------------------------------------------------
const empty = { config: R.defaultConfig, entities: [], suppliers: [], products: [], priceList: [], providers: [], trucks: [], drivers: [], checkpoints: [], routes: [], warehouses: [], receivingCompanies: [], users: [] };
export function ref(): RefBundle { if (bundle && !bundle.config) bundle.config = structuredClone(R.defaultConfig); /* older server / cache */ return bundle ?? (empty as unknown as RefBundle); }
const stopsOf = (routeId: ID): RouteStop[] => ref().routes.find((r) => r.id === routeId)?.stops ?? [];
export const lookup = {
  product: (id: ID) => ref().products.find((p) => p.id === id),
  entity: (id: ID) => ref().entities.find((p) => p.id === id),
  supplier: (id: ID) => ref().suppliers.find((p) => p.id === id),
  truck: (id: ID) => ref().trucks.find((p) => p.id === id),
  driver: (id: ID) => ref().drivers.find((p) => p.id === id),
  provider: (id: ID) => ref().providers.find((p) => p.id === id),
  poRef: (poId: ID) => poRefs.get(poId) ?? '—',
  checkpoint: (id: ID) => ref().checkpoints.find((p) => p.id === id),
  route: (id: ID) => ref().routes.find((p) => p.id === id),
  warehouse: (id: ID) => ref().warehouses.find((p) => p.id === id),
  company: (id: ID) => ref().receivingCompanies.find((p) => p.id === id),
  user: (id: ID) => ref().users.find((p) => p.id === id),
  price: (productId: ID) => ref().priceList.find((p) => p.productId === productId)?.price ?? 0,
};
const remember = <T extends { poId: ID; poRef?: string }>(x: T) => { if (x.poRef) poRefs.set(x.poId, x.poRef); return x; };

// ---- domain -------------------------------------------------------------------------------------
/** The orders behind the POs (read-only). POs are created, updated and deleted with `pos` (docs/09 §4) — no drafts. */
export const plans = {
  list: () => get<Plan[]>('/plans'),
  get: (id: ID) => orNull(get<Plan>(`/plans/${id}`)),
  /** A fresh line for the PO editor: the supplier's first product at its list price, on the supplier's first lane. */
  newLine(plan: Pick<Plan, 'supplierId'>, truckNo: number): PlanLine {
    const prod = ref().products.find((p) => p.supplierId === plan.supplierId) ?? ref().products[0];
    const supplierCp = lookup.supplier(plan.supplierId)?.checkpointId;
    const route = ref().routes.find((r) => r.stops[0].checkpointId === supplierCp) ?? ref().routes[0];
    const wh = ref().warehouses.find((w) => w.checkpointId === route?.stops.at(-1)?.checkpointId);
    return { id: `pl-${key().slice(0, 8)}`, truckNo, productId: prod?.id ?? '', qty: 0, price: lookup.price(prod?.id ?? ''), deliveredToId: wh?.receivingCompanyId ?? 'rc-asie', routeId: route?.id ?? '' };
  },
  /** PO-06: each line against the approved period plan — planned, ordered before, this PO, remaining, over/unplanned. */
  planContext: (planId: ID) => get<PlanLineContext[]>(`/plans/${planId}/plan-context`),
};
/** §8.3 PL-06..PL-12: period plans per company (Group view reads only). */
export const periodPlans = {
  /** Active plans; `{ all: true }` also lists Replaced ones. */
  list: (opts: { all?: boolean } = {}) => get<PeriodPlan[]>(`/period-plans${opts.all ? '?all=1' : ''}`),
  get: (id: ID) => orNull(get<PeriodPlan>(`/period-plans/${id}`)),
  /** Plans are suggestions (Active at once). An overlap → ApiError 409 with `conflicts`, unless `replace: true`. */
  create: (input: { entityId?: ID; periodKind: PeriodKind; from: string; to: string; title: string; lines?: import('./types').PeriodPlanLine[]; replace?: boolean }) => mutate(post<PeriodPlan>('/period-plans', input)),
  save: (plan: PeriodPlan, opts: { replace?: boolean } = {}) => mutate(call<PeriodPlan>('PUT', `/period-plans/${plan.id}`, { ...plan, ...(opts.replace ? { replace: true } : {}) })),
  copy: (fromId: ID, to: { from: string; to: string; title?: string; replace?: boolean }) => mutate(post<PeriodPlan>(`/period-plans/${fromId}/copy`, to)),
  overlaps: (plan: Pick<PeriodPlan, 'id' | 'entityId' | 'from' | 'to'>) => post<PeriodPlan[]>('/period-plans/overlaps', plan),
  versions: (id: ID) => get<{ version: number; snapshot: PeriodPlan; reason: string | null; at: string }[]>(`/period-plans/${id}/versions`),
};
export const pos = {
  /** Effective POs (latest revision) with their stage; `{ all: true }` also lists deleted ones. */
  async list(opts: { all?: boolean } = {}) { const r = await get<PurchaseOrder[]>(`/pos${opts.all ? '?all=1' : ''}`); r.forEach((p) => poRefs.set(p.id, p.ref)); return r; },
  /** The PO, its order lines, the whole chain (original first), every version snapshot, loaded cases and allowed actions. */
  async get(id: ID) { const r = await orNull(get<PoDetail>(`/pos/${id}`)); if (r) { poRefs.set(r.po.id, r.po.ref); (r.revisions ?? []).forEach((x) => poRefs.set(x.id, x.ref)); } return r; },
  /** Create: issued at once (approved automatically) — or awaiting a director when approvals are on. */
  create: (input: PoInput) => mutate(post<PurchaseOrder>('/pos', input)),
  /** Update = the next revision `<ref>-rev00N` (reason required); never an overwrite. */
  update: (id: ID, input: PoUpdateInput) => mutate(call<PurchaseOrder>('PUT', `/pos/${id}`, input)),
  /** Soft delete with a reason, only while nothing has been loaded. */
  remove: (id: ID, reason: string) => mutate(post<PurchaseOrder>(`/pos/${id}/delete`, { reason })),
  /** Approvals on: approve (signature) or reject (comment → deleted). */
  decide: (id: ID, action: 'approved' | 'rejected', comment?: string, signature?: string) => mutate(post<PurchaseOrder>(`/pos/${id}/decision`, { action, comment, signature })),
  markSent: (id: ID) => mutate(post<PurchaseOrder>(`/pos/${id}/sent`)),
  send: (id: ID) => mutate(post<PurchaseOrder>(`/pos/${id}/send`)),
  /** Server-rendered PO letter (Typst) — any version of the chain by its id. */
  pdf: (id: ID) => call<Blob>('GET', `/pos/${id}/pdf`, undefined, { blob: true }),
  newLine: (supplierId: ID, truckNo: number) => plans.newLine({ supplierId }, truckNo),
};
export const loading = {
  waiting: (loadingPointId?: ID) => get<WaitingEntry[]>(`/waiting${loadingPointId ? `?loadingPointId=${loadingPointId}` : ''}`),
  addWaiting: (loadingPointId: ID, truckId: ID, driverId: ID, entityId?: ID) => mutate(post<WaitingEntry>(`/loading-points/${loadingPointId}/waiting`, { truckId, driverId, entityId }, key())),
  list: (loadingPointId?: ID) => get<Loading[]>(`/loadings${loadingPointId ? `?loadingPointId=${loadingPointId}` : ''}`),
  /** docs/12 A-04: no price at hand-over; `agreedTransport` is taken only from the truck follow-up officer (else ignored). */
  confirm: (id: ID, input: { truckId: ID; driverId: ID; loadedQty: Record<ID, number>; agreedTransport?: number | null; transportCurrency?: string; documents: string[]; loadedAt?: string; alternatives?: import('./types').LoadingAlternative[]; confirmUnusual?: boolean }) => mutate(post<Shipment>(`/loadings/${id}/confirm`, input, key()).then(async (s) => { await loadRef(); return s; })),
};
export const shipments = {
  async list() { return (await get<(Shipment & { poRef?: string })[]>('/shipments')).map(remember); },
  async get(id: ID) { const r = await orNull(get<Shipment & { poRef?: string }>(`/shipments/${id}`)); return r ? remember(r) : null; },
  eta: (leg: Leg) => R.etaOf(leg, stopsOf(leg.routeId)),
  async forDriver(driverId: ID) { return (await shipments.list()).flatMap((s) => s.legs.filter((l) => l.driverId === driverId && l.status !== 'Acknowledged').map((leg) => ({ shipment: s, leg }))); },
  async incoming(warehouseIds: ID[]) {
    const cps = warehouseIds.map((w) => lookup.warehouse(w)?.checkpointId);
    return (await shipments.list()).flatMap((s) => s.legs.filter((l) => cps.includes(l.toId) && l.status !== 'Acknowledged').map((leg) => ({ shipment: s, leg })));
  },
  pass: (legId: ID, checkpointId: ID, kind: 'arrived' | 'departed', source: CheckpointPass['source'] = 'driver') => mutate(post<Leg>(`/legs/${legId}/passes`, { checkpointId, kind, source }, key())),
  issue: (legId: ID, issue: Omit<TruckIssue, 'id'>) => mutate(post<Leg>(`/legs/${legId}/issues`, issue, key())),
  fixIssue: (legId: ID, issueId: ID) => mutate(post<Leg>(`/legs/${legId}/issues/${issueId}/fix`)),
  acknowledge: (legId: ID, input: { receiverName: string; lines: AckLine[]; signature?: string; photos?: string[] }) => mutate(post<Acknowledgement>(`/legs/${legId}/acknowledgement`, input, key())),
  /** Doc 08 §2: onward move from the warehouse where the shipment was received = a NEW shipment. */
  sendOn: (fromShipmentId: ID, input: { routeId: ID; truckId: ID; driverId: ID; lines?: Leg['lines'] }) => mutate(post<Shipment>(`/shipments/${fromShipmentId}/send-on`, input, key())),
  /** @deprecated use sendOn — returns the new shipment's first leg. */
  addLeg: (shipmentId: ID, routeId: ID, truckId: ID, driverId: ID) => mutate(post<Leg>(`/shipments/${shipmentId}/legs`, { routeId, truckId, driverId })),
  journey: (id: ID) => get<JourneyStep[]>(`/shipments/${id}/journey`),
  ack: (id: ID) => orNull(get<Acknowledgement>(`/acks/${id}`)),
  undoPass: (legId: ID, checkpointId: ID, kind: 'arrived' | 'departed') => mutate(post<Leg>(`/legs/${legId}/passes/${checkpointId}/undo`, { kind }, key())),
  ackPdf: (ackId: ID) => call<Blob>('GET', `/acks/${ackId}/pdf`, undefined, { blob: true }),
};
export const inventory = {
  stock: () => get<StockRow[]>('/stock'),
  ledger: (warehouseId: ID, productId: ID) => get<{ warehouseId: ID; productId: ID; kind: string; qty: number; at: string; ref: string }[]>(`/stock/ledger?warehouseId=${warehouseId}&productId=${productId}`),
};
export const sales = {
  list: (warehouseId?: ID) => get<Sale[]>(`/sales${warehouseId ? `?warehouseId=${warehouseId}` : ''}`),
  create: (input: Omit<Sale, 'id' | 'ref' | 'status' | 'entityId'> & { entityId?: ID }, override = false) => mutate(post<Sale>('/sales', { ...input, override }, key())),
};
type Trip = { shipment: Shipment; costs: TripCost[]; payments: TripPayment[]; transport: number; paid: number; balance: number; goods: number; expenses: number; landing: number; cases: number; perCase: number; /** false = agreed transport price not recorded yet */ agreedRecorded: boolean };
export const finance = {
  trips: () => get<Trip[]>('/finance/trips'),
  /** docs/12 A-04: record (or correct, while unpaid) the agreed transport price of a loaded truck. */
  setAgreedPrice: (shipmentId: ID, input: { amount: number; currency?: Currency; docRef?: string; confirmUnusual?: boolean }) => mutate(post<TripCost>(`/shipments/${shipmentId}/agreed-price`, input)),
  addCost: (c: Omit<TripCost, 'id'> & { confirmUnusual?: boolean }) => mutate(post<TripCost>('/finance/costs', c)),
  pay: (shipmentId: ID, costId: ID, amount: number, reference: string, _threshold?: number, opts: { confirmUnusual?: boolean } = {}) => mutate(post<TripPayment>('/finance/payments', { shipmentId, costId, amount, reference, ...(opts.confirmUnusual ? { confirmUnusual: true } : {}) })),
  approve: (paymentId: ID) => mutate(post<TripPayment>(`/finance/payments/${paymentId}/approve`)),
  /** docs/14 B-04: transport fee per trip — paid / part paid / unpaid against references, age since loading. */
  fees: () => get<TransportFeeRow[]>('/finance/fees'),
};
type Summary = Awaited<ReturnType<typeof Mock.analytics.summary>>;
export const analytics = {
  velocity: () => get<VelocityRow[]>('/analytics/velocity'),
  flags: () => get<Flag[]>('/analytics/flags'),
  thresholds,
  summary: () => get<Summary>('/analytics/summary'),
  async setThresholds(th: Partial<R.Thresholds>) { const r = await call<R.Thresholds>('PUT', '/analytics/thresholds', th); Object.assign(thresholds, r); emit(); return { ...thresholds }; },
};
export const notifications = {
  list: () => get<Notification[]>('/notifications'),
  readAll: () => mutate(post<boolean>('/notifications/read', {})),
  markRead: (id: ID) => mutate(post<boolean>('/notifications/read', { ids: [id] })),
};
export const demo = {
  reset() { post('/dev/reset').then(async () => { await loadRef(); emit(); }).catch(() => {}); },
  /** The server reads config.toml at startup; nothing to change from a client. */
  setConfig(_c: unknown) { /* no-op over HTTP */ },
};
export const queue = {
  move: (entryId: ID, dir: -1 | 1) => mutate(post<WaitingEntry>(`/waiting/${entryId}/move`, { dir })),
  /** Put a waiting truck at `position` (1 = next to load); the loader is notified. */
  moveTo: (entryId: ID, position: number) => mutate(post<WaitingEntry>(`/waiting/${entryId}/move`, { position })),
  /** Take a truck out of the queue; the reason is shown to the loader and kept in the audit log. */
  remove: (entryId: ID, reason?: string) => mutate(call<boolean>('DELETE', `/waiting/${entryId}`, reason ? { reason } : undefined)),
  async addMarketTruck(loadingPointId: ID, input: { company: string; reg: string; trailer: string; capacityCases: number; driverName: string; driverPhone: string }) {
    const r = await post<{ truck: { id: ID; providerId: ID; reg: string; trailer: string; capacityCases: number; defaultDriverId?: ID }; driver: { id: ID; name: string; phone: string; licence: string; providerId: ID; hasApp: boolean }; entry: WaitingEntry }>(`/loading-points/${loadingPointId}/market-trucks`, input);
    await loadRef(); emit(); return r;
  },
};
export const tracking = {
  dispatch: (legId: ID, source: CheckpointPass['source'] = 'office') => mutate(post<Leg>(`/legs/${legId}/dispatch`, { source })),
  splitAt: (legId: ID, checkpointId: ID) => mutate(post<Leg>(`/legs/${legId}/split`, { checkpointId })),
  acks: (shipmentId: ID) => get<Acknowledgement[]>(`/shipments/${shipmentId}/acks`),
  dwell: (leg: Leg) => R.dwell(leg, stopsOf(leg.routeId)),
  overdue: (leg: Leg, graceHours = ref().settings?.noCheckinGraceHours ?? 3) => R.overdue(leg, stopsOf(leg.routeId), graceHours),
  positions: (items: { legId?: ID; truckId?: ID; lat: number; lng: number; at?: string; accuracyM?: number; speedKmh?: number }[]) => mutate(post<{ accepted: number; events: { legId: ID; checkpointId: ID; kind: 'arrived' | 'departed' }[] }>('/positions', items, key())),
};
export const field = {
  driver: () => get<DriverWork>('/field/driver'),
  giver: () => get<GiverWork>('/field/giver'),
  receiver: () => get<ReceiverWork>('/field/receiver'),
};
const withRef = async <T>(p: Promise<T>) => { const r = await p; await loadRef(); emit(); return r; };
export const masterdata = {
  addWarehouse: (input: WarehouseInput) => withRef(post<Warehouse>('/masterdata/warehouses', input)),
  updateWarehouse: (id: ID, input: Partial<WarehouseInput>) => withRef(call<Warehouse>('PATCH', `/masterdata/warehouses/${id}`, input)),
  saveWarehouse: (id: ID | null, input: Partial<WarehouseInput>) => (id ? masterdata.updateWarehouse(id, input) : masterdata.addWarehouse(input as WarehouseInput)),
  addRoute: (input: { name: string; code?: string; distanceKm?: number; stops: RouteStop[] }) => withRef(post<Route>('/masterdata/routes', input)),
  updateRouteStops: (routeId: ID, stops: RouteStop[]) => withRef(call<unknown>('PATCH', `/masterdata/routes/${routeId}`, { stops })),
  addTruck: (input: TruckInput) => withRef(post<Truck>('/masterdata/trucks', input)),
  addDriver: (input: DriverInput & { appLogin?: boolean }) => withRef(post<SavedDriver>('/masterdata/drivers', input)),
  addProvider: (input: Partial<ProviderInput> & { name: string }) => withRef(post<Provider>('/masterdata/providers', input)),
  /** Transport onboarding (docs/10): add (id null) or edit; `active: false` deactivates (kept for history). */
  saveProvider: (id: ID | null, input: Partial<ProviderInput>) => withRef(id ? call<Provider>('PATCH', `/masterdata/providers/${id}`, input) : post<Provider>('/masterdata/providers', input)),
  saveTruck: (id: ID | null, input: Partial<TruckInput>) => withRef(id ? call<Truck>('PATCH', `/masterdata/trucks/${id}`, input) : post<Truck>('/masterdata/trucks', input)),
  /** `appLogin: true` with `hasApp` gives a new driver a field-app login; the PIN comes back once in `login.pin`. */
  saveDriver: (id: ID | null, input: Partial<DriverInput> & { appLogin?: boolean }) => withRef(id ? call<SavedDriver>('PATCH', `/masterdata/drivers/${id}`, input) : post<SavedDriver>('/masterdata/drivers', input)),
  // docs/12 A-05: static data — companies, suppliers, goods, receiving companies (Kabonge, directors)
  saveEntity: (id: ID | null, input: Partial<EntityInput>) => withRef(id ? call<Entity>('PATCH', `/masterdata/entities/${id}`, input) : post<Entity>('/masterdata/entities', input)),
  saveSupplier: (id: ID | null, input: Partial<SupplierInput>) => withRef(id ? call<Supplier>('PATCH', `/masterdata/suppliers/${id}`, input) : post<Supplier>('/masterdata/suppliers', input)),
  saveProduct: (id: ID | null, input: Partial<ProductInput>) => withRef(id ? call<Product>('PATCH', `/masterdata/products/${id}`, input) : post<Product>('/masterdata/products', input)),
  saveReceivingCompany: (id: ID | null, input: Partial<ReceivingCompanyInput>) => withRef(id ? call<ReceivingCompany>('PATCH', `/masterdata/receiving-companies/${id}`, input) : post<ReceivingCompany>('/masterdata/receiving-companies', input)),
};
/** docs/12 A-07: the audit log (directors). */
export const audit = {
  list: (f: AuditFilter = {}) => get<AuditPage>(`/audit${qs(f as Record<string, string | number | undefined>)}`),
};
export const users = {
  list: () => get<UserAdmin[]>('/users'),
  create: (input: { name: string; phone: string; username?: string; email?: string; roles: Role[]; entityIds?: ID[]; loadingPointIds?: ID[]; warehouseIds?: ID[]; pairs?: UserPair[]; routeIds?: ID[]; password?: string; pin?: string }) => withRef(post<UserAdmin>('/users', input)),
  update: (id: ID, input: Partial<Pick<UserAdmin, 'name' | 'email' | 'roles' | 'entityIds' | 'loadingPointIds' | 'warehouseIds' | 'pairs' | 'routeIds' | 'active'>>) => withRef(call<UserAdmin>('PATCH', `/users/${id}`, input)),
  setSecret: (id: ID, input: { pin?: string; password?: string }) => post<boolean>(`/users/${id}/secret`, input),
  devices: (id: ID) => get<Device[]>(`/users/${id}/devices`),
};
export const devices = {
  register: (input: { pushToken?: string; platform?: string; appVersion?: string }) => post<{ id: string }>('/devices', input),
  revoke: (deviceId: ID) => post<boolean>(`/auth/devices/${deviceId}/revoke`).then(() => true),
};
export const files = {
  upload: (input: { kind: 'photo' | 'signature' | 'document' | 'pdf'; name?: string; contentType: string; dataBase64: string }) => post<StoredFile>('/files', input),
};
export const sync = {
  // Screens reload on change events; synced writes must emit like direct ones (else the driver sheet goes stale).
  batch: (items: { idempotencyKey: string; op: string; payload: unknown }[]) => mutate(post<SyncResult[]>('/sync/batch', items)),
};

// ---- Reports (computed server-side with packages/api/src/reports.ts) ------------------------------
const qs = (o: object) => { const p = Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`); return p.length ? `?${p.join('&')}` : ''; };
export const reports = {
  resolvePeriod: RP.resolvePeriod,
  quarterOf: RP.quarterOf,
  dashboard: (f: { entityId?: ID } = {}) => get<RP.DashboardReport>(`/reports/dashboard${qs(f)}`),
  sales: (f: RP.ReportFilter & { groupBy?: RP.GroupBy } = {}) => get<RP.SalesReport>(`/reports/sales${qs(f)}`),
  quarterly: (quarter?: string, f: RP.ReportFilter = {}) => get<RP.QuarterlyReport>(`/reports/quarterly${qs({ ...f, quarter })}`),
  logistics: (f: RP.ReportFilter = {}) => get<RP.LogisticsReport>(`/reports/logistics${qs(f)}`),
  inventory: (f: RP.ReportFilter = {}) => get<RP.InventoryReport>(`/reports/inventory${qs(f)}`),
  planning: (f: RP.ReportFilter & { horizonDays?: number } = {}) => get<RP.PlanningReport>(`/reports/planning${qs(f)}`),
  finance: (f: RP.ReportFilter = {}) => get<RP.FinanceReport>(`/reports/finance${qs(f)}`),
  periodPlan: (f: RP.ReportFilter = {}) => get<RP.PeriodForecast>(`/reports/period-plan${qs(f)}`),
  captureCheck: (f: RP.ReportFilter = {}) => get<RP.CaptureCheck>(`/reports/capture-check${qs(f)}`),
  /** Directors: companies side by side + consolidated total (Σ companies − intercompany). Uses all allowed companies. */
  /** §8.14 PV-01..07: planned vs ordered for approved period plans (Group: + byEntity). */
  plannedVsActual: (f: RP.PvFilter = {}) => get<RP.PlannedVsActual>(`/reports/planned-vs-actual${qs(f)}`),
  group: (f: RP.ReportFilter = {}) => get<RP.GroupReport>(`/reports/group${qs(f)}`),
  /** docs/14 B-07: combined performance + margins (directors). */
  performance: (f: PerfFilter = {}) => get<PerformanceReport>(`/reports/performance${qs(f)}`),
};

/** docs/15: P1 dashboards — one call for several keys with the standard filters (scoped by the caller). */
export const dashboards = {
  get: (keys: import('./dashboards').DashKey[], f: import('./dashboards').DashFilter = {}) => get<import('./dashboards').DashResponse>(`/dashboards${qs({ ...f, keys: keys.join(',') })}`),
};

// ---- docs/14 workstream B: warehouse money and data ---------------------------------------------------------------
export const warehouse = {
  expenses: (f: ExpenseFilter = {}) => get<WarehouseExpense[]>(`/warehouse/expenses${qs(f)}`),
  addExpense: (input: WarehouseExpenseInput) => mutate(post<WarehouseExpense>('/warehouse/expenses', input)),
  updateExpense: (id: ID, input: Partial<WarehouseExpenseInput>) => mutate(call<WarehouseExpense>('PATCH', `/warehouse/expenses/${id}`, input)),
  deleteExpense: (id: ID) => mutate(call<boolean>('DELETE', `/warehouse/expenses/${id}`).then(() => true)),
  stock: (f: { warehouseId?: ID; from?: string; to?: string } = {}) => get<WarehouseStockRow[]>(`/warehouse/stock${qs(f)}`),
  adjust: (input: StockAdjustInput) => mutate(post<StockAdjustment>('/warehouse/stock-adjustments', input, key())),
  adjustments: (f: { warehouseId?: ID } = {}) => get<StockAdjustment[]>(`/warehouse/stock-adjustments${qs(f)}`),
};
export const reexports = {
  list: () => get<ReexportOrder[]>('/reexports'),
  get: (id: ID) => orNull(get<ReexportOrder>(`/reexports/${id}`)),
  create: (input: ReexportInput) => mutate(post<ReexportOrder>('/reexports', input, key())),
  load: (id: ID, input: ReexportLoadInput) => mutate(post<ReexportOrder>(`/reexports/${id}/load`, input, key()).then(async (r) => { await loadRef(); return r; })),
  cancel: (id: ID, reason?: string) => mutate(post<ReexportOrder>(`/reexports/${id}/cancel`, { reason })),
};
export const pricing = {
  list: () => get<SellingPrice[]>('/selling-prices'),
  set: (input: SellingPriceInput) => mutate(post<SellingPrice>('/selling-prices', input)),
};

// ---- Companies & settings ------------------------------------------------------------------------------
export const entities = {
  /** Company records the user may work in (legal/contact/brand fields). `ref().entities` has all three for lookups. */
  list: () => get<Entity[]>('/entities'),
  /** Active company id, or null for Group / all allowed companies. */
  active: (): ID | null => activeEntity,
  setActive: (id: ID | null) => configure({ entityId: id }),
};
export const settings = {
  fx: () => get<FxRate[]>('/settings/fx'),
  /** Directors approve exchange rates (units of currency per 1 USD) for a month. */
  setFx: (rate: FxRate) => mutate(call<FxRate>('PUT', '/settings/fx', rate)),
  /** §8.14: planned-vs-actual flag thresholds (directors change them). */
  pvThresholds: () => get<PvThresholds>('/settings/pv-thresholds'),
  setPvThresholds: (t: Partial<PvThresholds>) => mutate(call<PvThresholds>('PUT', '/settings/pv-thresholds', t)),
};
