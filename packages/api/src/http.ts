// Real API client (VITE_API=http). Same exports as mock-client.ts; index.ts picks one.
// Synchronous helpers (ref, lookup, auth.me, shipments.eta, tracking.dwell/overdue) read a cache that
// ready() / sign-in fill from GET /ref, so screens work unchanged. Writes throw Error(problem.title).
import * as R from './rules';
import type {
  AckLine, Acknowledgement, CheckpointPass, Device, DriverWork, Flag, GiverWork, ID, Leg, Loading, Notification, Plan, PlanLine,
  PurchaseOrder, ReceiverWork, Role, RouteStop, Sale, Shipment, StockRow, StoredFile, SyncResult, TripCost, TripPayment,
  TruckIssue, User, UserAdmin, VelocityRow, WaitingEntry,
} from './types';
import type * as Mock from './mock-client';

type RefBundle = ReturnType<typeof Mock.ref> & { settings?: { thresholds: R.Thresholds; paymentApprovalThreshold: number; minAppVersion: string; noCheckinGraceHours: number } };
type Session = { accessToken: string; refreshToken: string; deviceId: string; user: User };

const env: Record<string, string | undefined> = ((import.meta as unknown as { env?: Record<string, string> }).env) ?? {};
let BASE = env.VITE_API_URL ?? 'http://localhost:3101/v1';
let CHANNEL: 'web' | 'app' = (env.VITE_CHANNEL as 'web' | 'app') ?? 'web';
let APP_VERSION = env.VITE_APP_VERSION ?? '';
export const mode = 'http' as const;
export function configure(o: { channel?: 'web' | 'app'; appVersion?: string; baseUrl?: string }) {
  if (o.channel) CHANNEL = o.channel; if (o.appVersion) APP_VERSION = o.appVersion; if (o.baseUrl) BASE = o.baseUrl.replace(/\/$/, '');
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

// ---- change feed + session expiry -------------------------------------------------------------
const subs = new Set<() => void>();
export function onChange(fn: () => void) { subs.add(fn); return () => subs.delete(fn); }
const emit = () => subs.forEach((f) => f());
const expiredSubs = new Set<() => void>();

// ---- transport ----------------------------------------------------------------------------------
export class ApiError extends Error { constructor(message: string, public status: number, public code?: string) { super(message); } }
let refreshing: Promise<boolean> | null = null;
async function refresh(): Promise<boolean> {
  if (!session?.refreshToken) return false;
  refreshing ??= (async () => {
    try {
      const r = await fetch(`${BASE}/auth/refresh`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: session!.refreshToken }) });
      if (!r.ok) return false;
      const s = await r.json() as Session; session = { ...s, user: s.user }; write('btw-session', session); return true;
    } catch { return false; } finally { setTimeout(() => (refreshing = null), 0); }
  })();
  return refreshing;
}
function expire() { session = null; write('btw-session', null); expiredSubs.forEach((f) => f()); emit(); }

async function call<T>(method: string, path: string, body?: unknown, opts: { idem?: string; blob?: boolean; retry?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { 'x-channel': CHANNEL };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (APP_VERSION) headers['x-app-version'] = APP_VERSION;
  if (session) headers.authorization = `Bearer ${session.accessToken}`;
  if (opts.idem) headers['idempotency-key'] = opts.idem;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  if (res.status === 401 && session && opts.retry !== false && !path.startsWith('/auth/')) {
    if (await refresh()) return call<T>(method, path, body, { ...opts, retry: false });
    expire();
  }
  if (!res.ok) {
    let title = `${res.status} ${res.statusText}`; let code: string | undefined;
    try { const p = await res.json(); title = p.title ?? p.message ?? title; code = p.code; } catch { /* not JSON */ }
    throw new ApiError(title, res.status, code);
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
  if (session) {
    try { const me = await get<User>('/me'); session = { ...session, user: { ...session.user, ...me } }; write('btw-session', session); await loadRef(); }
    catch (e) { if (e instanceof TypeError) return; /* offline: keep cached session + ref */ if (e instanceof ApiError && e.status === 401) expire(); }
  } else {
    try { demoList = await get<User[]>('/auth/demo-users'); } catch { demoList = []; }
  }
}

// ---- session -------------------------------------------------------------------------------------
async function signIn(input: { username?: string; password?: string; phone?: string; pin?: string }) {
  // Phones keep one device id (remote sign-out of a lost phone, push token); each web sign-in is its own device,
  // so a slow logout from an earlier browser session can never end the new one.
  const deviceId = CHANNEL === 'app' ? session?.deviceId ?? read<Session>('btw-last-device')?.deviceId : undefined;
  const s = await call<Session>('POST', '/auth/login', { ...input, deviceId, platform: CHANNEL, appVersion: APP_VERSION || undefined });
  session = s; write('btw-session', s); write('btw-last-device', { deviceId: s.deviceId });
  await loadRef(); emit();
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
    const s = session; session = null; write('btw-session', null); emit();
    if (!s) return Promise.resolve();
    const headers: Record<string, string> = { 'content-type': 'application/json', 'x-channel': CHANNEL, authorization: `Bearer ${s.accessToken}` };
    return fetch(`${BASE}/auth/logout`, { method: 'POST', headers, body: '{}', signal: AbortSignal.timeout?.(5000) }).then(() => undefined, () => undefined);
  },
  has: (...roles: Role[]) => !!session && session.user.roles.some((r) => roles.includes(r)),
  /** Called when the session can't be refreshed (expired, revoked device). */
  onExpired(fn: () => void) { expiredSubs.add(fn); return () => expiredSubs.delete(fn); },
};

// ---- reference data (sync, from cache) --------------------------------------------------------
const empty = { entities: [], suppliers: [], products: [], priceList: [], providers: [], trucks: [], drivers: [], checkpoints: [], routes: [], warehouses: [], receivingCompanies: [], users: [] };
export function ref(): RefBundle { return bundle ?? (empty as unknown as RefBundle); }
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
export const plans = {
  list: () => get<Plan[]>('/plans'),
  get: (id: ID) => orNull(get<Plan>(`/plans/${id}`)),
  create: (entityId: ID, supplierId: ID) => mutate(post<Plan>('/plans', { entityId, supplierId })),
  save: (plan: Plan) => mutate(call<Plan>('PUT', `/plans/${plan.id}`, plan)),
  newLine(plan: Plan, truckNo: number): PlanLine {
    const prod = ref().products.find((p) => p.supplierId === plan.supplierId) ?? ref().products[0];
    const supplierCp = lookup.supplier(plan.supplierId)?.checkpointId;
    const route = ref().routes.find((r) => r.stops[0].checkpointId === supplierCp) ?? ref().routes[0];
    const wh = ref().warehouses.find((w) => w.checkpointId === route?.stops.at(-1)?.checkpointId);
    return { id: `pl-${key().slice(0, 8)}`, truckNo, productId: prod?.id ?? '', qty: 0, price: lookup.price(prod?.id ?? ''), deliveredToId: wh?.receivingCompanyId ?? 'rc-asie', routeId: route?.id ?? '' };
  },
  submit: (id: ID) => mutate(post<Plan>(`/plans/${id}/submit`)),
  decide: (id: ID, action: 'approved' | 'returned' | 'rejected', comment?: string, signature?: string) => mutate(post<Plan>(`/plans/${id}/decision`, { action, comment, signature })),
  amend: (id: ID, reason: string) => mutate(post<Plan>(`/plans/${id}/amendments`, { reason })),
  versions: (id: ID) => get<{ version: number; snapshot: Plan; reason: string | null; at: string }[]>(`/plans/${id}/versions`),
};
export const pos = {
  async list() { const r = await get<PurchaseOrder[]>('/pos'); r.forEach((p) => poRefs.set(p.id, p.ref)); return r; },
  async get(id: ID) { const r = await orNull(get<{ po: PurchaseOrder; plan: Plan }>(`/pos/${id}`)); if (r) poRefs.set(r.po.id, r.po.ref); return r; },
  markSent: (id: ID) => mutate(post<PurchaseOrder>(`/pos/${id}/sent`)),
  send: (id: ID) => mutate(post<PurchaseOrder>(`/pos/${id}/send`)),
  /** Server-rendered PO letter (Typst). */
  pdf: (id: ID) => call<Blob>('GET', `/pos/${id}/pdf`, undefined, { blob: true }),
};
export const loading = {
  waiting: (loadingPointId?: ID) => get<WaitingEntry[]>(`/waiting${loadingPointId ? `?loadingPointId=${loadingPointId}` : ''}`),
  addWaiting: (loadingPointId: ID, truckId: ID, driverId: ID) => mutate(post<WaitingEntry>(`/loading-points/${loadingPointId}/waiting`, { truckId, driverId }, key())),
  list: (loadingPointId?: ID) => get<Loading[]>(`/loadings${loadingPointId ? `?loadingPointId=${loadingPointId}` : ''}`),
  confirm: (id: ID, input: { truckId: ID; driverId: ID; loadedQty: Record<ID, number>; agreedTransport: number; documents: string[]; loadedAt?: string }) => mutate(post<Shipment>(`/loadings/${id}/confirm`, input, key()).then(async (s) => { await loadRef(); return s; })),
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
  addLeg: (shipmentId: ID, routeId: ID, truckId: ID, driverId: ID) => mutate(post<Leg>(`/shipments/${shipmentId}/legs`, { routeId, truckId, driverId })),
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
  create: (input: Omit<Sale, 'id' | 'ref' | 'status'>, override = false) => mutate(post<Sale>('/sales', { ...input, override }, key())),
};
type Trip = { shipment: Shipment; costs: TripCost[]; payments: TripPayment[]; transport: number; paid: number; balance: number; goods: number; expenses: number; landing: number; cases: number; perCase: number };
export const finance = {
  trips: () => get<Trip[]>('/finance/trips'),
  addCost: (c: Omit<TripCost, 'id'>) => mutate(post<TripCost>('/finance/costs', c)),
  pay: (shipmentId: ID, costId: ID, amount: number, reference: string, _threshold?: number) => mutate(post<TripPayment>('/finance/payments', { shipmentId, costId, amount, reference })),
  approve: (paymentId: ID) => mutate(post<TripPayment>(`/finance/payments/${paymentId}/approve`)),
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
export const demo = { reset() { post('/dev/reset').then(async () => { await loadRef(); emit(); }).catch(() => {}); } };
export const queue = {
  move: (entryId: ID, dir: -1 | 1) => mutate(post<WaitingEntry>(`/waiting/${entryId}/move`, { dir })),
  remove: (entryId: ID) => mutate(call<boolean>('DELETE', `/waiting/${entryId}`)),
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
  updateRouteStops: (routeId: ID, stops: RouteStop[]) => withRef(call<unknown>('PATCH', `/masterdata/routes/${routeId}`, { stops })),
  addTruck: (input: { providerId: ID; reg: string; trailer: string; capacityCases: number; defaultDriverId?: ID }) => withRef(post<unknown>('/masterdata/trucks', input)),
  addDriver: (input: { providerId: ID; name: string; phone: string; licence?: string; hasApp?: boolean }) => withRef(post<unknown>('/masterdata/drivers', input)),
  addProvider: (input: { name: string; regular?: boolean; phone?: string }) => withRef(post<unknown>('/masterdata/providers', input)),
};
export const users = {
  list: () => get<UserAdmin[]>('/users'),
  create: (input: { name: string; phone: string; username?: string; email?: string; roles: Role[]; entityIds?: ID[]; loadingPointIds?: ID[]; warehouseIds?: ID[]; password?: string; pin?: string }) => withRef(post<UserAdmin>('/users', input)),
  update: (id: ID, input: Partial<Pick<UserAdmin, 'name' | 'email' | 'roles' | 'entityIds' | 'loadingPointIds' | 'warehouseIds' | 'active'>>) => withRef(call<UserAdmin>('PATCH', `/users/${id}`, input)),
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
