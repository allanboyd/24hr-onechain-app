// In-browser mock implementation of the client API (VITE_API=mock, the default).
// http.ts implements the same exports against the real API; index.ts picks one. Screens import only '@btw/api'.
import * as m from './mock/db';
import * as seed from './mock/seed';
import * as R from './rules';
import type {
  AckLine, Checkpoint, CheckpointPass, Device, DriverWork, GiverWork, ID, Leg, LegView, Plan, PlanLine, ReceiverWork, Role, RouteStop, Sale,
  Shipment, StoredFile, SyncResult, TripCost, TruckIssue, User, UserAdmin,
} from './types';

const LATENCY = 120; // simulate network so loading states get designed
const wait = <T>(v: T): Promise<T> => new Promise((r) => setTimeout(() => r(structuredClone(v)), LATENCY));
let loaded = false;
const ensure = () => { if (!loaded) { m.load(); loaded = true; } };
const commit = <T>(v: T) => { m.save(); emit(); return wait(v); };

// Tiny change feed so open screens refresh after a mutation (stands in for websockets/SSE later).
const subs = new Set<() => void>();
export function onChange(fn: () => void) { subs.add(fn); return () => subs.delete(fn); }
function emit() { subs.forEach((f) => f()); }

// ---- Session (demo: pick a user; real: phone + PIN/OTP → JWT) -----------------
let current: User | null = null;
try { const id = localStorage.getItem('btw-user'); if (id) current = seed.users.find((u) => u.id === id) ?? null; } catch { /* ignore */ }
const auth0 = {
  demoUsers: () => seed.users,
  me: () => current,
  async login(userId: ID, _pin: string) {
    current = seed.users.find((u) => u.id === userId) ?? null;
    try { localStorage.setItem('btw-user', userId); } catch { /* ignore */ }
    return wait(current);
  },
  logout(): Promise<void> { current = null; try { localStorage.removeItem('btw-user'); } catch { /* ignore */ } return Promise.resolve(); },
  has: (...roles: Role[]) => !!current && current.roles.some((r) => roles.includes(r)),
};

// ---- Reference / master data (MD-*) ---------------------------------------
export function ref() {
  ensure();
  return {
    entities: seed.entities, suppliers: seed.suppliers, products: seed.products, priceList: seed.priceList,
    providers: [...seed.providers, ...(m.db.extraProviders ?? [])], trucks: m.db.trucks, drivers: [...seed.drivers, ...(m.db.extraDrivers ?? [])], checkpoints: seed.checkpoints,
    routes: m.db.routes, warehouses: seed.warehouses, receivingCompanies: seed.receivingCompanies, users: seed.users,
  };
}
export const lookup = {
  product: (id: ID) => seed.products.find((p) => p.id === id),
  entity: (id: ID) => seed.entities.find((p) => p.id === id),
  supplier: (id: ID) => seed.suppliers.find((p) => p.id === id),
  truck: (id: ID) => { ensure(); return m.db.trucks.find((p) => p.id === id); },
  driver: (id: ID) => seed.drivers.find((p) => p.id === id) ?? m.db?.extraDrivers?.find((p) => p.id === id),
  provider: (id: ID) => seed.providers.find((p) => p.id === id) ?? m.db?.extraProviders?.find((p) => p.id === id),
  poRef: (poId: ID) => { ensure(); return m.db.pos.find((p) => p.id === poId)?.ref ?? '—'; },
  checkpoint: (id: ID) => seed.checkpoints.find((p) => p.id === id),
  route: (id: ID) => { ensure(); return m.db.routes.find((p) => p.id === id); },
  warehouse: (id: ID) => seed.warehouses.find((p) => p.id === id),
  company: (id: ID) => seed.receivingCompanies.find((p) => p.id === id),
  user: (id: ID) => seed.users.find((p) => p.id === id),
  price: (productId: ID) => seed.priceList.find((p) => p.productId === productId)?.price ?? 0,
};

// ---- Plans & approvals (PL-*) ---------------------------------------------
const plans0 = {
  async list() { ensure(); return wait([...m.db.plans].sort((a, b) => b.date.localeCompare(a.date))); },
  async get(id: ID) { ensure(); return wait(m.db.plans.find((p) => p.id === id) ?? null); },
  async create(entityId: ID, supplierId: ID): Promise<Plan> {
    ensure();
    const plan: Plan = {
      id: m.uid('plan'), ref: m.nextRef(entityId), title: '', entityId, supplierId, currency: 'USD',
      date: new Date().toISOString().slice(0, 10), requiredBy: new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10),
      status: 'Draft', version: 1, lines: [], history: [], createdById: current?.id ?? 'u-kabonge',
    };
    m.db.plans.push(plan); return commit(plan);
  },
  async save(plan: Plan) {
    ensure();
    const i = m.db.plans.findIndex((p) => p.id === plan.id);
    if (m.db.plans[i].status === 'Approved') throw new Error('Approved plans are locked — create an amendment (PL-04)');
    m.db.plans[i] = { ...plan, lines: plan.lines.map((l) => ({ ...l, qty: Math.max(0, Math.round(l.qty)) })) };
    return commit(m.db.plans[i]);
  },
  newLine(plan: Plan, truckNo: number): PlanLine {
    const prod = seed.products.find((p) => p.supplierId === plan.supplierId) ?? seed.products[0];
    return { id: m.uid('pl'), truckNo, productId: prod.id, qty: 0, price: lookup.price(prod.id), deliveredToId: 'rc-asie', routeId: m.db.routes[0].id };
  },
  async submit(id: ID) {
    ensure(); const p = m.db.plans.find((x) => x.id === id)!;
    if (!p.lines.length) throw new Error('Add at least one line');
    p.status = 'Submitted'; p.history.push({ at: new Date().toISOString(), byUserId: current?.id ?? '', action: 'submitted' });
    m.notify('Plan awaiting approval', `${p.ref} · ${p.title}`, `#/plans/${p.id}`, ['director']);
    return commit(p);
  },
  async decide(id: ID, action: 'approved' | 'returned' | 'rejected', comment?: string, signature?: string) {
    ensure(); const p = m.db.plans.find((x) => x.id === id)!;
    if (p.status !== 'Submitted') throw new Error('Only submitted plans can be decided');
    p.status = action === 'approved' ? 'Approved' : action === 'returned' ? 'Returned' : 'Rejected';
    p.history.push({ at: new Date().toISOString(), byUserId: current?.id ?? 'u-dir', action, comment, signature });
    if (action === 'approved') { // PO-01: PO generated from the approved plan, no retyping
      const po = { id: m.uid('po'), ref: p.ref, planId: p.id, entityId: p.entityId, supplierId: p.supplierId, currency: p.currency, date: p.date, title: p.title, instruction: 'Kindly process and avail stock for loading.', version: p.version, approvedById: current?.id ?? 'u-dir', approvedAt: new Date().toISOString(), signature };
      m.db.pos.push(po); p.poId = po.id; m.createLoadingsForPO(po);
    }
    m.notify(`Plan ${p.status.toLowerCase()}`, `${p.ref}${comment ? ' — ' + comment : ''}`, `#/plans/${p.id}`, ['planner']);
    return commit(p);
  },
};

const pos0 = {
  async list() { ensure(); return wait([...m.db.pos].reverse()); },
  async get(id: ID) { ensure(); const po = m.db.pos.find((p) => p.id === id); return wait(po ? { po, plan: m.db.plans.find((p) => p.id === po.planId)! } : null); },
  async markSent(id: ID) { ensure(); const po = m.db.pos.find((p) => p.id === id)!; po.sentAt = new Date().toISOString(); return commit(po); },
};

// ---- Loading & waiting list (LD-*, §17.4) ---------------------------------
export const loading = {
  async waiting(loadingPointId?: ID) { ensure(); return wait(m.db.waiting.filter((w) => !loadingPointId || w.loadingPointId === loadingPointId).sort((a, b) => a.position - b.position)); },
  async addWaiting(loadingPointId: ID, truckId: ID, driverId: ID) {
    ensure(); const pos = m.db.waiting.filter((w) => w.loadingPointId === loadingPointId && w.status === 'Waiting').length + 1;
    const e = { id: m.uid('wl'), loadingPointId, truckId, driverId, arrivedAt: new Date().toISOString(), position: pos, status: 'Waiting' as const };
    m.db.waiting.push(e); return commit(e);
  },
  async list(loadingPointId?: ID) { ensure(); return wait(m.db.loadings.filter((l) => !loadingPointId || l.loadingPointId === loadingPointId)); },
  async confirm(id: ID, input: { truckId: ID; driverId: ID; loadedQty: Record<ID, number>; agreedTransport: number; documents: string[] }) {
    ensure(); const ld = m.db.loadings.find((l) => l.id === id)!;
    const truck = m.db.trucks.find((t) => t.id === input.truckId)!;
    ld.lines.forEach((l) => (l.loadedQty = input.loadedQty[l.planLineId] ?? l.loadedQty));
    const total = ld.lines.reduce((a, l) => a + l.loadedQty, 0);
    if (total > truck.capacityCases) throw new Error(`Over truck capacity: ${total} > ${truck.capacityCases} cases (§7.3 #3)`);
    ld.documents = input.documents.map((n) => ({ id: m.uid('doc'), kind: 'delivery-note', name: n }));
    const sh = m.completeLoading(ld, input.truckId, input.driverId, input.agreedTransport);
    m.notify('Truck loaded', `${truck.reg} · ${total} cases · ${sh.ref}`, `#/shipments/${sh.id}`, ['operations', 'fleet', 'director']);
    return commit(sh);
  },
};

// ---- Shipments, legs, tracking (DS-*, TR-*) --------------------------------
const shipments0 = {
  async list() { ensure(); m.db.shipments.forEach((s) => (s.status = m.deriveShipmentStatus(s))); return wait([...m.db.shipments].reverse()); },
  async get(id: ID) { ensure(); const sh = m.db.shipments.find((s) => s.id === id); if (sh) sh.status = m.deriveShipmentStatus(sh); return wait(sh ?? null); },
  eta: (leg: Parameters<typeof m.etaOf>[0]) => { ensure(); return m.etaOf(leg); },
  async forDriver(driverId: ID) { ensure(); return wait(m.db.shipments.flatMap((s) => s.legs.filter((l) => l.driverId === driverId && l.status !== 'Acknowledged').map((leg) => ({ shipment: s, leg })))); },
  async incoming(warehouseIds: ID[]) {
    ensure();
    const cps = warehouseIds.map((w) => lookup.warehouse(w)!.checkpointId);
    return wait(m.db.shipments.flatMap((s) => s.legs.filter((l) => cps.includes(l.toId) && l.status !== 'Acknowledged').map((leg) => ({ shipment: s, leg }))));
  },
  async pass(legId: ID, checkpointId: ID, kind: 'arrived' | 'departed', source: CheckpointPass['source'] = 'driver') { ensure(); m.recordPass(legId, checkpointId, kind, source); return commit(m.findLeg(legId).leg); },
  async issue(legId: ID, issue: Omit<TruckIssue, 'id'>) { ensure(); m.addIssue(legId, issue); return commit(m.findLeg(legId).leg); },
  async fixIssue(legId: ID, issueId: ID) { ensure(); const { leg } = m.findLeg(legId); const i = leg.issues.find((x) => x.id === issueId)!; i.fixedAt = new Date().toISOString(); return commit(leg); },
  async acknowledge(legId: ID, input: { receiverName: string; lines: AckLine[]; signature?: string; photos?: string[] }) {
    ensure(); const ack = m.acknowledge(legId, { ...input, photos: (input.photos ?? []).map((n) => ({ id: m.uid('doc'), kind: 'photo' as const, name: n })) });
    return commit(ack);
  },
  async addLeg(shipmentId: ID, routeId: ID, truckId: ID, driverId: ID) { ensure(); const l = m.addLeg(shipmentId, routeId, truckId, driverId, Date.now() + 2 * 36e5); return commit(l); },
  async ack(id: ID) { ensure(); return wait(m.db.acks.find((a) => a.id === id) ?? null); },
};

// ---- Inventory & sales (IN-*, SL-*) ---------------------------------------
export const inventory = {
  async stock() { ensure(); return wait(m.stock()); },
  async ledger(warehouseId: ID, productId: ID) { ensure(); return wait(m.db.stockMoves.filter((x) => x.warehouseId === warehouseId && x.productId === productId).slice(-50).reverse()); },
};
export const sales = {
  async list(warehouseId?: ID) { ensure(); return wait(m.db.sales.filter((s) => !warehouseId || s.warehouseId === warehouseId).slice(-200).reverse()); },
  async create(input: Omit<Sale, 'id' | 'ref' | 'status'>, override = false) {
    ensure();
    const st = m.stock();
    for (const l of input.lines) {
      const avail = st.find((r) => r.warehouseId === input.warehouseId && r.productId === l.productId)?.closing ?? 0;
      if (l.qty > avail && !override) throw new Error(`Only ${avail} cases of ${lookup.product(l.productId)?.brand} in stock (SL-02)`);
    }
    const total = input.lines.reduce((a, l) => a + m.amount(l.qty, l.price), 0);
    const sale: Sale = { ...input, id: m.uid('sale'), ref: `SAL-${String(m.db.sales.length + 1).padStart(5, '0')}`, status: input.paid >= total ? 'Paid' : input.paid > 0 ? 'Part-paid' : 'Unpaid' };
    m.db.sales.push(sale);
    for (const l of sale.lines) m.db.stockMoves.push({ warehouseId: sale.warehouseId, productId: l.productId, kind: 'sold', qty: l.qty, at: sale.at, ref: sale.ref });
    return commit(sale);
  },
};

// ---- Trip financials & landing cost (FN-*, §17.6) -------------------------
export const finance = {
  async trips() {
    ensure();
    return wait(m.db.shipments.map((s) => {
      const costs = m.db.costs.filter((c) => c.shipmentId === s.id);
      const pays = m.db.payments.filter((p) => p.shipmentId === s.id);
      const transport = costs.filter((c) => c.kind === 'Transport').reduce((a, c) => a + c.amount, 0);
      const paid = pays.filter((p) => p.status !== 'Pending approval').reduce((a, p) => a + p.amount, 0);
      const plan = m.db.plans.find((p) => p.poId === s.poId)!;
      const goods = s.legs[0].lines.reduce((a, l) => a + l.loadedQty * (plan.lines.find((pl) => pl.productId === l.productId)?.price ?? 0), 0);
      const cases = s.legs[0].lines.reduce((a, l) => a + l.loadedQty, 0);
      const expenses = costs.reduce((a, c) => a + c.amount, 0);
      return { shipment: s, costs, payments: pays, transport, paid, balance: transport - paid, goods, expenses, landing: goods + expenses, cases, perCase: cases ? (goods + expenses) / cases : 0 };
    }));
  },
  async addCost(c: Omit<TripCost, 'id'>) { ensure(); const x = { ...c, id: m.uid('cost') }; m.db.costs.push(x); return commit(x); },
  async pay(shipmentId: ID, costId: ID, amount: number, reference: string, threshold = 500) {
    ensure(); const status = amount > threshold ? 'Pending approval' as const : 'Paid' as const;
    const p = { id: m.uid('pay'), shipmentId, costId, amount, at: new Date().toISOString(), reference, status };
    m.db.payments.push(p);
    if (status === 'Pending approval') m.notify('Payment needs approval', `USD ${amount} · ${reference}`, '#/finance', ['director']);
    return commit(p);
  },
  async approve(paymentId: ID) { ensure(); const p = m.db.payments.find((x) => x.id === paymentId)!; p.status = 'Paid'; p.approvedById = current?.id; return commit(p); },
};

// ---- Analytics & notifications --------------------------------------------
const analytics0 = {
  async velocity() { ensure(); return wait(m.velocity()); },
  async flags() { ensure(); return wait(m.flags()); },
  thresholds: m.thresholds,
  async summary() {
    ensure();
    const st = m.stock();
    const since = Date.now() - 30 * 864e5;
    const sales30 = m.db.sales.filter((s) => Date.parse(s.at) >= since).reduce((a, s) => a + s.lines.reduce((b, l) => b + l.qty * l.price, 0), 0);
    const daily = Array.from({ length: 30 }, (_, i) => {
      const day = new Date(Date.now() - (29 - i) * 864e5).toISOString().slice(0, 10);
      return { day, cases: m.db.sales.filter((s) => s.at.slice(0, 10) === day).reduce((a, s) => a + s.lines.reduce((b, l) => b + l.qty, 0), 0) };
    });
    m.db.shipments.forEach((x) => (x.status = m.deriveShipmentStatus(x)));
    const active = m.db.shipments.filter((s) => s.status !== 'Acknowledged');
    return wait({
      stockValue: st.reduce((a, r) => a + r.closing * r.landedCostPerCase, 0),
      stockCases: st.reduce((a, r) => a + r.closing, 0),
      inTransitCases: st.reduce((a, r) => a + r.inTransit, 0),
      sales30, daily,
      trucksActive: active.length,
      trucksDelayed: active.filter((s) => s.status === 'Delayed').length,
      trucksAtBorder: active.filter((s) => s.legs.some((l) => l.status === 'At border')).length,
      plansPending: m.db.plans.filter((p) => p.status === 'Submitted').length,
      paymentsPending: m.db.payments.filter((p) => p.status === 'Pending approval').length,
      unpaidBalance: m.db.sales.reduce((a, s) => a + s.lines.reduce((b, l) => b + l.qty * l.price, 0) - s.paid, 0),
    });
  },
};
export const notifications = {
  async list() { ensure(); return wait(m.db.notifications.filter((n) => !current || current.roles.some((r) => n.forRoles.includes(r)) || current.roles.includes('director'))); },
  async readAll() { ensure(); m.db.notifications.forEach((n) => (n.read = true)); return commit(true); },
  async markRead(id: ID) { ensure(); const n = m.db.notifications.find((x) => x.id === id); if (n) n.read = true; return commit(true); },
};

export const demo = { reset() { m.reset(); emit(); } };

// ---- Additions for the logistics review (append-only) -----------------------
export const queue = {
  /** Move a waiting truck up (-1) or down (+1) in its loading point's queue (§17.4). */
  async move(entryId: ID, dir: -1 | 1) {
    ensure();
    const e = m.db.waiting.find((w) => w.id === entryId)!;
    const q = m.db.waiting.filter((w) => w.loadingPointId === e.loadingPointId && w.status === 'Waiting').sort((a, b) => a.position - b.position);
    const i = q.indexOf(e); const j = i + dir;
    if (j < 0 || j >= q.length) return wait(e);
    [q[i], q[j]] = [q[j], q[i]]; q.forEach((w, k) => (w.position = k + 1));
    return commit(e);
  },
  async remove(entryId: ID) {
    ensure();
    const e = m.db.waiting.find((w) => w.id === entryId)!;
    m.db.waiting = m.db.waiting.filter((w) => w.id !== entryId);
    m.db.waiting.filter((w) => w.loadingPointId === e.loadingPointId && w.status === 'Waiting').sort((a, b) => a.position - b.position).forEach((w, k) => (w.position = k + 1));
    return commit(true);
  },
  /** Register a non-regular (market) truck + driver on the spot and queue it (§17.4: company, truck, trailer, driver). */
  async addMarketTruck(loadingPointId: ID, input: { company: string; reg: string; trailer: string; capacityCases: number; driverName: string; driverPhone: string }) {
    ensure();
    if (!input.reg.trim() || !input.driverName.trim()) throw new Error('Truck registration and driver name are required');
    m.db.extraProviders ??= []; m.db.extraDrivers ??= [];
    const known = [...seed.providers, ...m.db.extraProviders].find((p) => p.name.toLowerCase() === input.company.trim().toLowerCase());
    const provider = known ?? { id: m.uid('pr'), name: input.company.trim() || 'Market truck', regular: false, phone: '' };
    if (!known) m.db.extraProviders.push(provider);
    const driver = { id: m.uid('d'), name: input.driverName.trim(), phone: input.driverPhone.trim(), licence: '', providerId: provider.id, hasApp: false };
    m.db.extraDrivers.push(driver);
    const truck = { id: m.uid('t'), providerId: provider.id, reg: input.reg.trim().toUpperCase(), trailer: input.trailer.trim().toUpperCase(), capacityCases: input.capacityCases || 2000, defaultDriverId: driver.id };
    m.db.trucks.push(truck);
    const position = m.db.waiting.filter((w) => w.loadingPointId === loadingPointId && w.status === 'Waiting').length + 1;
    const e = { id: m.uid('wl'), loadingPointId, truckId: truck.id, driverId: driver.id, arrivedAt: new Date().toISOString(), position, status: 'Waiting' as const };
    m.db.waiting.push(e);
    return commit({ truck, driver, entry: e });
  },
};

const tracking0 = {
  /** Explicit dispatch of a planned/loaded leg = departure from its first checkpoint. */
  async dispatch(legId: ID, source: CheckpointPass['source'] = 'office') {
    ensure(); const { leg } = m.findLeg(legId);
    m.recordPass(legId, leg.passes[0].checkpointId, 'departed', source);
    return commit(m.findLeg(legId).leg);
  },
  /** DS-02: end this leg at an intermediate warehouse where goods are unloaded and reloaded onto another truck. */
  async splitAt(legId: ID, checkpointId: ID) {
    ensure(); const { sh, leg } = m.findLeg(legId);
    const k = leg.passes.findIndex((p) => p.checkpointId === checkpointId);
    if (k <= 0 || k >= leg.passes.length - 1) throw new Error('Pick a point between origin and destination');
    if (leg.passes[k].arrivedAt) throw new Error('The truck has already reached that point');
    leg.passes = leg.passes.slice(0, k + 1); leg.toId = checkpointId; leg.plannedArrival = leg.passes[k].plannedAt;
    m.notify('Transfer point set', `${sh.ref}: unload at ${lookup.checkpoint(checkpointId)?.name}, then reload for the next leg`, `#/shipments/${sh.id}`, ['operations', 'fleet', 'receiver']);
    sh.status = m.deriveShipmentStatus(sh);
    return commit(leg);
  },
  async acks(shipmentId: ID) { ensure(); return wait(m.db.acks.filter((a) => a.shipmentId === shipmentId)); },
  /** Truck currently stopped at a checkpoint: how long, versus planned dwell (border dwell visibility). */
  dwell(leg: import('./types').Leg) {
    ensure();
    const i = leg.passes.reduce((a, p, k) => (p.arrivedAt ? k : a), -1);
    if (i < 0 || leg.passes[i].departedAt || i === leg.passes.length - 1) return null;
    const stop = m.db.routes.find((r) => r.id === leg.routeId)!.stops[i];
    const hours = (Date.now() - Date.parse(leg.passes[i].arrivedAt!)) / 36e5;
    return { checkpointId: leg.passes[i].checkpointId, hours: Math.round(hours), plannedDwellHours: stop.plannedDwellHours, over: hours > stop.plannedDwellHours + 2 };
  },
  /** "No check-in" (TR-05): next checkpoint expected (planned + current delay) more than `graceHours` ago and nothing recorded. */
  overdue(leg: import('./types').Leg, graceHours = 3) {
    ensure();
    if (['Acknowledged', 'Arrived', 'Cancelled', 'Planned', 'Loaded'].includes(leg.status)) return null;
    const i = leg.passes.reduce((a, p, k) => (p.arrivedAt ? k : a), -1);
    if (i < 0 || !leg.passes[i].departedAt) return null;
    const next = leg.passes[i + 1]; if (!next) return null;
    const stops = m.db.routes.find((r) => r.id === leg.routeId)!.stops;
    const delay = Date.parse(leg.passes[i].departedAt!) - (Date.parse(leg.passes[i].plannedAt) + stops[i].plannedDwellHours * 36e5);
    const expected = Date.parse(next.plannedAt) + delay;
    const late = (Date.now() - expected) / 36e5;
    return late > graceHours ? { checkpointId: next.checkpointId, expectedAt: new Date(expected).toISOString(), hours: Math.round(late) } : null;
  },
};

// ---- Additions for the real API (same names exist in http.ts) -------------------------------
export const mode = 'mock' as const;
/** Load what the synchronous helpers (ref, lookup, auth.me) need. Mock: nothing to load. */
export async function ready() { ensure(); }
/** Channel/app version headers for the API (no-op in the mock). */
export function configure(_o: { channel?: 'web' | 'app'; appVersion?: string; baseUrl?: string }) {}

export const auth = Object.assign(auth0, {
  /** Real sign-in shape. Mock accepts any password/PIN for a known username, id or phone. */
  async signIn(input: { username?: string; password?: string; phone?: string; pin?: string }) {
    const who = (input.username ?? input.phone ?? '').trim().toLowerCase();
    const u = seed.users.find((x) => x.id === who || x.id === `u-${who}` || x.phone === who || x.phone.replace(/\s/g, '') === who);
    if (!u) throw new Error('Wrong username or password');
    return auth0.login(u.id, input.pin ?? input.password ?? '');
  },
  onExpired(_fn: () => void) { return () => {}; },
});

const cpWithCode = (c: Checkpoint): Checkpoint => { const codes = R.checkpointCodes(c.name, c.kind); return { ...c, code: codes[0], aliases: codes }; };
function legView(sh: Shipment, leg: Leg): LegView {
  const stops = m.db.routes.find((r) => r.id === leg.routeId)?.stops ?? [];
  return {
    shipment: { ...sh, poRef: lookup.poRef(sh.poId) }, leg, route: m.db.routes.find((r) => r.id === leg.routeId),
    checkpoints: leg.passes.map((x) => cpWithCode(lookup.checkpoint(x.checkpointId)!)), truck: lookup.truck(leg.truckId), driver: lookup.driver(leg.driverId),
    eta: R.etaOf(leg, stops), dwell: R.dwell(leg, stops), overdue: R.overdue(leg, stops),
  };
}
const ACTIVE = (l: Leg) => !['Acknowledged', 'Cancelled'].includes(l.status);
/** Field app working sets (one call per role; cached offline by the app). */
export const field = {
  async driver(): Promise<DriverWork> {
    ensure(); const u = current; const d = u ? ref().drivers.find((x) => x.phone === u.phone) : undefined;
    if (!d) return wait({ driver: null, trips: [] });
    m.db.shipments.forEach((s) => (s.status = m.deriveShipmentStatus(s)));
    return wait({ driver: d, trips: m.db.shipments.flatMap((s) => s.legs.filter((l) => l.driverId === d.id && ACTIVE(l)).map((l) => legView(s, l))) });
  },
  async giver(): Promise<GiverWork> {
    ensure(); const u = current!;
    const lps = seed.suppliers.filter((s) => u.loadingPointIds.includes(s.id));
    const cps = [...lps.map((s) => s.checkpointId), ...seed.warehouses.filter((w) => u.warehouseIds.includes(w.id)).map((w) => w.checkpointId)];
    return wait({
      loadingPoints: lps,
      waiting: m.db.waiting.filter((w) => u.loadingPointIds.includes(w.loadingPointId) && w.status === 'Waiting').sort((a, b) => a.position - b.position),
      toLoad: m.db.loadings.filter((l) => l.status === 'Pending' && u.loadingPointIds.includes(l.loadingPointId)).map((l) => ({ ...l, poRef: lookup.poRef(l.poId), poTitle: m.db.pos.find((p) => p.id === l.poId)?.title ?? '' })),
      handover: m.db.shipments.flatMap((s) => s.legs.filter((l) => ['Planned', 'Loaded'].includes(l.status) && cps.includes(l.fromId)).map((l) => legView(s, l))),
    });
  },
  async receiver(): Promise<ReceiverWork> {
    ensure(); const u = current!;
    const whs = seed.warehouses.filter((w) => u.warehouseIds.includes(w.id)); const cps = whs.map((w) => w.checkpointId);
    m.db.shipments.forEach((s) => (s.status = m.deriveShipmentStatus(s)));
    const incoming = m.db.shipments.flatMap((s) => s.legs.filter((l) => cps.includes(l.toId) && ACTIVE(l) && l.status !== 'Planned').map((l) => legView(s, l)));
    const rank = (x: LegView) => (x.leg.status === 'Arrived' ? 0 : 1);
    return wait({ warehouses: whs, incoming: incoming.sort((a, b) => rank(a) - rank(b) || Date.parse(a.eta.eta) - Date.parse(b.eta.eta)) });
  },
};

export const plans = Object.assign(plans0, {
  async amend(id: ID, reason: string) {
    ensure(); const p = m.db.plans.find((x) => x.id === id)!;
    if (p.status !== 'Approved') throw new Error('Only approved plans are amended; edit drafts directly');
    if (!reason?.trim()) throw new Error('Give a reason for the amendment');
    p.version += 1; p.status = 'Draft'; p.history.push({ at: new Date().toISOString(), byUserId: current?.id ?? '', action: 'amended', comment: reason });
    return commit(p);
  },
  async versions(_id: ID) { return wait([] as { version: number; snapshot: Plan; reason: string | null; at: string }[]); },
});
export const pos = Object.assign(pos0, {
  async send(id: ID) { return pos0.markSent(id); },
  /** Server-rendered PDF letter (null in the mock — the web app prints its HTML letter instead). */
  async pdf(_id: ID): Promise<Blob | null> { return null; },
});
export const shipments = Object.assign(shipments0, {
  async ackPdf(_ackId: ID): Promise<Blob | null> { return null; },
  /** Correct the latest check-in after it was synced (audited on the server). */
  async undoPass(legId: ID, checkpointId: ID, kind: 'arrived' | 'departed') {
    ensure(); const { sh, leg } = m.findLeg(legId);
    R.undoPass(leg, checkpointId, kind, (id) => lookup.checkpoint(id)?.kind ?? 'town');
    sh.status = m.deriveShipmentStatus(sh);
    m.notify('Check-in corrected', `${m.truckReg(leg.truckId)}: ${kind} at ${lookup.checkpoint(checkpointId)?.name} undone`, `#/shipments/${sh.id}`, ['fleet', 'operations']);
    return commit(leg);
  },
});

export const analytics = Object.assign(analytics0, {
  async setThresholds(th: Partial<R.Thresholds>) {
    const next = { ...m.thresholds, ...th };
    if (!(next.fast > next.normal && next.normal > next.slow)) throw new Error('Thresholds must be fast > normal > slow');
    Object.assign(m.thresholds, next); emit(); return wait({ ...m.thresholds });
  },
});

export const masterdata = {
  async updateRouteStops(routeId: ID, stops: RouteStop[]) {
    ensure(); const r = m.db.routes.find((x) => x.id === routeId)!;
    if (stops.some((s, i) => i > 0 && s.plannedHours < stops[i - 1].plannedHours + stops[i - 1].plannedDwellHours)) throw new Error('Planned hours must increase along the route (including dwell)');
    r.stops = stops; return commit(r);
  },
  async addTruck(input: { providerId: ID; reg: string; trailer: string; capacityCases: number; defaultDriverId?: ID }) { ensure(); const x = { id: m.uid('t'), ...input, reg: input.reg.toUpperCase() }; m.db.trucks.push(x); return commit(x); },
  async addDriver(input: { providerId: ID; name: string; phone: string; licence?: string; hasApp?: boolean }) { ensure(); m.db.extraDrivers ??= []; const x = { id: m.uid('d'), licence: '', hasApp: false, ...input }; m.db.extraDrivers.push(x); return commit(x); },
  async addProvider(input: { name: string; regular?: boolean; phone?: string }) { ensure(); m.db.extraProviders ??= []; const x = { id: m.uid('pr'), regular: true, phone: '', ...input }; m.db.extraProviders.push(x); return commit(x); },
};

const mockUsers: UserAdmin[] = seed.users.map((u) => ({ ...u, username: u.id.replace(/^u-/, ''), email: `${u.id.replace(/^u-/, '')}@btw.local`, active: true, hasPassword: true, hasPin: true, driverId: seed.drivers.find((d) => d.phone === u.phone)?.id ?? null }));
export const users = {
  async list() { return wait(mockUsers); },
  async create(input: { name: string; phone: string; username?: string; email?: string; roles: Role[]; entityIds?: ID[]; loadingPointIds?: ID[]; warehouseIds?: ID[]; password?: string; pin?: string }) {
    if (!input.name?.trim() || !input.phone?.trim()) throw new Error('Name and phone are required');
    if (!input.roles?.length) throw new Error('Pick at least one valid role');
    const u: UserAdmin = { id: m.uid('u'), name: input.name, phone: input.phone, username: input.username ?? input.name.split(' ')[0].toLowerCase(), email: input.email ?? null, roles: input.roles, entityIds: input.entityIds ?? [], loadingPointIds: input.loadingPointIds ?? [], warehouseIds: input.warehouseIds ?? [], active: true, hasPassword: !!input.password, hasPin: !!input.pin, driverId: null };
    mockUsers.push(u); return wait(u);
  },
  async update(id: ID, input: Partial<Pick<UserAdmin, 'name' | 'email' | 'roles' | 'entityIds' | 'loadingPointIds' | 'warehouseIds' | 'active'>>) { const u = mockUsers.find((x) => x.id === id)!; Object.assign(u, input); return wait(u); },
  async setSecret(id: ID, input: { pin?: string; password?: string }) { if (input.pin && !/^\d{4,6}$/.test(input.pin)) throw new Error('PIN must be 4–6 digits'); const u = mockUsers.find((x) => x.id === id)!; if (input.pin) u.hasPin = true; if (input.password) u.hasPassword = true; return wait(true); },
  async devices(_id: ID) { return wait([] as Device[]); },
};
export const devices = {
  async register(_input: { pushToken?: string; platform?: string; appVersion?: string }) { return wait({ id: 'dev-mock' }); },
  async revoke(_deviceId: ID) { return wait(true); },
};
export const files = {
  async upload(input: { kind: 'photo' | 'signature' | 'document' | 'pdf'; name?: string; contentType: string; dataBase64: string }): Promise<StoredFile> {
    return wait({ id: m.uid('file'), url: `data:${input.contentType};base64,${input.dataBase64.replace(/^data:[^,]+,/, '')}`, size: Math.round(input.dataBase64.length * 0.75) });
  },
};

/** Phone GPS → checkpoint arrivals (mock geofence by distance; the API uses PostGIS). */
const distM = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const r = Math.PI / 180, x = (b.lng - a.lng) * r * Math.cos(((a.lat + b.lat) / 2) * r), y = (b.lat - a.lat) * r; return Math.sqrt(x * x + y * y) * 6371e3;
};
export const tracking = Object.assign(tracking0, {
  async positions(items: { legId?: ID; truckId?: ID; lat: number; lng: number; at?: string; accuracyM?: number }[]) {
    ensure(); const events: { legId: ID; checkpointId: ID; kind: 'arrived' | 'departed' }[] = [];
    for (const it of items) {
      const found = it.legId ? m.findLeg(it.legId) : (() => { for (const sh of m.db.shipments) { const leg = sh.legs.find((l) => l.truckId === it.truckId && ACTIVE(l)); if (leg) return { sh, leg }; } return null; })();
      if (!found) continue;
      const { leg } = found; const at = it.at ? Date.parse(it.at) : Date.now();
      leg.lastPing = { lat: it.lat, lng: it.lng, at: new Date(at).toISOString() };
      if (['Planned', 'Loaded'].includes(leg.status) || !ACTIVE(leg)) continue;
      const i = leg.passes.reduce((a, x, k) => (x.arrivedAt ? k : a), -1);
      const here = i >= 0 && !leg.passes[i].departedAt && i < leg.passes.length - 1 ? lookup.checkpoint(leg.passes[i].checkpointId)! : null;
      if (here && distM(here, it) > here.radiusM * 1.5) { m.recordPass(leg.id, here.id, 'departed', 'geofence', at); events.push({ legId: leg.id, checkpointId: here.id, kind: 'departed' }); }
      const next = leg.passes.slice(i + 1, i + 4).map((x) => lookup.checkpoint(x.checkpointId)!).find((c) => distM(c, it) <= c.radiusM);
      if (next) { m.recordPass(leg.id, next.id, 'arrived', 'geofence', at); events.push({ legId: leg.id, checkpointId: next.id, kind: 'arrived' }); }
    }
    return commit({ accepted: items.length, events });
  },
});

/** Replay outbox items (the API does this server-side at POST /sync/batch). */
export const sync = {
  async batch(items: { idempotencyKey: string; op: string; payload: any }[]): Promise<SyncResult[]> {
    const out: SyncResult[] = [];
    for (const it of items) {
      try {
        const x = it.payload;
        const run: Record<string, () => Promise<unknown>> = {
          'leg.pass': () => shipments.pass(x.legId, x.checkpointId, x.kind, x.source),
          'leg.issue': () => shipments.issue(x.legId, x.issue),
          'leg.pass.undo': () => shipments.undoPass(x.legId, x.checkpointId, x.kind),
          'leg.issue.fix': () => shipments.fixIssue(x.legId, x.issueId), 'issue.fix': () => shipments.fixIssue(x.legId, x.issueId),
          'leg.acknowledge': () => shipments.acknowledge(x.legId, x.input),
          'leg.dispatch': () => tracking.dispatch(x.legId, x.source ?? 'office'),
          'loading.confirm': () => loading.confirm(x.id, x.input),
          'waiting.add': () => loading.addWaiting(x.loadingPointId, x.truckId, x.driverId),
          'sale.create': () => sales.create(x.input, !!x.override),
          'positions': () => tracking.positions(x.items ?? x),
        };
        if (!run[it.op]) throw new Error(`Unknown operation ${it.op}`);
        out.push({ idempotencyKey: it.idempotencyKey, status: 'applied', result: await run[it.op]() });
      } catch (e) { out.push({ idempotencyKey: it.idempotencyKey, status: 'rejected', error: { title: (e as Error).message, status: 422 } }); }
    }
    return out;
  },
};
