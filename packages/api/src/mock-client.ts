// In-browser mock implementation of the client API (VITE_API=mock, the default).
// http.ts implements the same exports against the real API; index.ts picks one. Screens import only '@btw/api'.
import * as m from './mock/db';
import * as seed from './mock/seed';
import * as R from './rules';
import * as RP from './reports';
import type {
  AckLine, AppConfig, Checkpoint, LoadingAlternative, PeriodPlanLine, PurchaseOrder, CheckpointPass, Device, DriverWork, Entity, FeatureKey, FxRate, GiverWork, ID, Leg, LegView, PeriodKind, PeriodPlan, Plan, PlanLine,
  PlanLineContext, PvThresholds, ReceiverWork, Role, RouteStop, Sale, Shipment, StoredFile, SyncResult, TripCost, TruckIssue, User, UserAdmin, Warehouse, WarehouseInput,
  Driver, DriverInput, Provider, ProviderInput, SavedDriver, Truck, TruckInput,
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
/** Seed users + field-app logins created for new drivers in this demo. */
const allUsers = (): User[] => [...seed.users, ...(loaded ? m.db.extraUsers ?? [] : [])];
try { const id = localStorage.getItem('btw-user'); if (id) { current = seed.users.find((u) => u.id === id) ?? null; if (!current && id.startsWith('u-')) { ensure(); current = allUsers().find((u) => u.id === id) ?? null; } } } catch { /* ignore */ }
// ---- Active company (tenant) — same contract as the API's X-Entity-Id header --------------------------------
const ALL_ENTITIES = seed.entities.map((e) => e.id);
let activeEntity: ID | null = null;
const entityKey = (u: User) => `btw-entity:${u.id}`;
function restoreEntity() {
  activeEntity = null;
  if (!current) return;
  try { const v = localStorage.getItem(entityKey(current)); if (v && current.allowedEntityIds.includes(v)) activeEntity = v; } catch { /* ignore */ }
  if (!activeEntity && current.allowedEntityIds.length === 1) activeEntity = current.allowedEntityIds[0];
}
restoreEntity();
/** Companies this request covers: the active one, or every allowed one (Group / multi-company staff). */
function scopeIds(): ID[] { const allowed = current?.allowedEntityIds ?? ALL_ENTITIES; return R.resolveScope(allowed, activeEntity) ?? []; }
const inScope = (e: ID | undefined | null) => !!e && scopeIds().includes(e);
const notAllowed = () => Object.assign(new Error('That belongs to another company'), { status: 403 });
/** The single company a write goes to: the record's own, or the active company. Group view is read-only for new records. */
function writeEntity(explicit?: ID | null): ID {
  if (explicit) { if (!inScope(explicit)) throw notAllowed(); return explicit; }
  const sc = scopeIds();
  if (sc.length === 1) return sc[0];
  throw Object.assign(new Error('Choose a company first — in the Group view a new record must name its company'), { status: 422 });
}
const assertScope = (e: ID | undefined) => { if (!inScope(e)) throw notAllowed(); };

const auth0 = {
  demoUsers: () => allUsers(),
  me: () => current,
  async login(userId: ID, _pin: string) {
    ensure(); current = allUsers().find((u) => u.id === userId) ?? null;
    try { localStorage.setItem('btw-user', userId); } catch { /* ignore */ }
    restoreEntity();
    return wait(current);
  },
  logout(): Promise<void> { current = null; activeEntity = null; try { localStorage.removeItem('btw-user'); } catch { /* ignore */ } return Promise.resolve(); },
  has: (...roles: Role[]) => !!current && current.roles.some((r) => roles.includes(r)),
};

// ---- Server config (apps/api/config.toml on the server; same defaults here) --------------------------
/** Business settings: approvals.purchaseOrders (director approves POs), loading allowance / alternatives / revision suffix.
 *  Demo override: localStorage 'btw-config' (JSON, same shape) or demo.setConfig(). */
const mockConfig: AppConfig = structuredClone(R.defaultConfig);
try { const raw = localStorage.getItem('btw-config'); if (raw) { const c = JSON.parse(raw); Object.assign(mockConfig.approvals, c.approvals ?? {}); Object.assign(mockConfig.loading, c.loading ?? {}); } } catch { /* ignore */ }

// ---- Reference / master data (MD-*) ---------------------------------------
export function ref() {
  ensure();
  return {
    config: mockConfig,
    entities: seed.entities, suppliers: seed.suppliers, products: seed.products, priceList: seed.priceList,
    providers: m.db.providers, trucks: m.db.trucks, drivers: m.db.drivers, checkpoints: seed.checkpoints,
    routes: m.db.routes, warehouses: seed.warehouses, receivingCompanies: seed.receivingCompanies, users: allUsers(),
  };
}
export const lookup = {
  product: (id: ID) => seed.products.find((p) => p.id === id),
  entity: (id: ID) => seed.entities.find((p) => p.id === id),
  supplier: (id: ID) => seed.suppliers.find((p) => p.id === id),
  truck: (id: ID) => { ensure(); return m.db.trucks.find((p) => p.id === id); },
  driver: (id: ID) => { ensure(); return m.db.drivers.find((p) => p.id === id); },
  provider: (id: ID) => { ensure(); return m.db.providers.find((p) => p.id === id); },
  poRef: (poId: ID) => { ensure(); return m.db.pos.find((p) => p.id === poId)?.ref ?? '—'; },
  checkpoint: (id: ID) => seed.checkpoints.find((p) => p.id === id),
  route: (id: ID) => { ensure(); return m.db.routes.find((p) => p.id === id); },
  warehouse: (id: ID) => seed.warehouses.find((p) => p.id === id),
  company: (id: ID) => seed.receivingCompanies.find((p) => p.id === id),
  user: (id: ID) => allUsers().find((p) => p.id === id),
  price: (productId: ID) => seed.priceList.find((p) => p.productId === productId)?.price ?? 0,
};

// ---- Plans & approvals (PL-*) ---------------------------------------------
const plans0 = {
  /** Orders (PO drafts). Revision copies made at loading are reached from their PO, not listed. */
  async list() { ensure(); if (!R.hasFeature(current!.roles, 'purchase-orders')) return wait([] as Plan[]); return wait(m.db.plans.filter((p) => !p.revisionOf && inScope(p.entityId)).sort((a, b) => b.date.localeCompare(a.date))); },
  async get(id: ID) { ensure(); feat('purchase-orders'); const p = m.db.plans.find((x) => x.id === id); return wait(p && inScope(p.entityId) ? p : null); },
  async create(entityId: ID, supplierId: ID): Promise<Plan> {
    ensure(); canEditPO(); entityId = writeEntity(entityId);
    const plan: Plan = {
      id: m.uid('plan'), ref: m.nextRef(entityId), title: '', entityId, supplierId, currency: 'USD',
      date: new Date().toISOString().slice(0, 10), requiredBy: new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10),
      status: 'Draft', version: 1, lines: [], history: [], createdById: current?.id ?? 'u-kabonge',
    };
    m.db.plans.push(plan); return commit(plan);
  },
  async save(plan: Plan) {
    ensure(); canEditPO();
    const i = m.db.plans.findIndex((p) => p.id === plan.id);
    assertScope(m.db.plans[i]?.entityId);
    if (plan.entityId !== m.db.plans[i].entityId) throw new Error('A plan cannot move to another company');
    if (m.db.plans[i].status === 'Approved') throw new Error('Approved plans are locked — create an amendment (PL-04)');
    if ((m.db.plans[i].status === 'Submitted' && mockConfig.approvals.purchaseOrders) || m.db.plans[i].status === 'Rejected') throw Object.assign(new Error(`A ${m.db.plans[i].status.toLowerCase()} plan cannot be edited`), { status: 409 });
    const cleaned = { ...plan, lines: plan.lines.map((l) => ({ ...l, qty: Math.max(0, Math.round(l.qty)) })) };
    m.db.plans[i] = R.applyPlanLinks(cleaned, m.db.periodPlans ?? [], m.db.plans, destOf); // PO-06/07
    return commit(m.db.plans[i]);
  },
  newLine(plan: Plan, truckNo: number): PlanLine {
    const prod = seed.products.find((p) => p.supplierId === plan.supplierId) ?? seed.products[0];
    return { id: m.uid('pl'), truckNo, productId: prod.id, qty: 0, price: lookup.price(prod.id), deliveredToId: 'rc-asie', routeId: m.db.routes[0].id };
  },
  /** approvals.purchaseOrders = true: send for director approval. false (default): "Issue purchase order" — the PO is
   *  created at once (approvedBy = the issuer) with its loadings, exactly as on approval. Period plans gate nothing. */
  async submit(id: ID) {
    ensure(); canEditPO(); const p = m.db.plans.find((x) => x.id === id)!; assertScope(p?.entityId);
    const issue = !mockConfig.approvals.purchaseOrders;
    if (!(issue ? ['Draft', 'Returned', 'Submitted'] : ['Draft', 'Returned']).includes(p.status)) throw Object.assign(new Error(`Only draft or returned plans can be ${issue ? 'issued' : 'submitted'} (now ${p.status})`), { status: 409 });
    if (!p.lines.length) throw new Error('Add at least one line');
    if (p.lines.some((l) => l.qty <= 0)) throw new Error('Every line needs a quantity above zero');
    Object.assign(p, R.applyPlanLinks(p, m.db.periodPlans ?? [], m.db.plans, destOf)); // informational marks only
    if (issue) {
      p.status = 'Approved'; p.history.push({ at: new Date().toISOString(), byUserId: current?.id ?? '', action: 'issued' });
      createPo(p, current?.id ?? '', undefined, 'issued');
      const cases = p.lines.reduce((a, l) => a + l.qty, 0);
      m.notify('Purchase order issued', `${p.ref} · ${p.title} · ${cases.toLocaleString('en-US')} cases · by ${current?.name ?? ''}`, `#/pos/${p.poId}`, ['planner', 'director'], p.entityId);
      return commit(p);
    }
    p.status = 'Submitted'; p.history.push({ at: new Date().toISOString(), byUserId: current?.id ?? '', action: 'submitted' });
    m.notify('Plan awaiting approval', `${p.ref} · ${p.title}`, `#/plans/${p.id}`, ['director'], p.entityId);
    return commit(p);
  },
  async decide(id: ID, action: 'approved' | 'returned' | 'rejected', comment?: string, signature?: string) {
    ensure(); feat('purchase-orders.approve');
    if (!mockConfig.approvals.purchaseOrders) throw Object.assign(new Error('Director approval of purchase orders is switched off (config.toml) — the planner issues the PO'), { status: 409 });
    const p = m.db.plans.find((x) => x.id === id)!; assertScope(p?.entityId);
    if (p.status !== 'Submitted') throw new Error('Only submitted plans can be decided');
    p.status = action === 'approved' ? 'Approved' : action === 'returned' ? 'Returned' : 'Rejected';
    p.history.push({ at: new Date().toISOString(), byUserId: current?.id ?? 'u-dir', action, comment, signature });
    if (action === 'approved') createPo(p, current?.id ?? 'u-dir', signature, 'director'); // PO-01: PO generated from the approved plan, no retyping
    m.notify(`Plan ${p.status.toLowerCase()}`, `${p.ref}${comment ? ' — ' + comment : ''}`, `#/plans/${p.id}`, ['planner'], p.entityId);
    return commit(p);
  },
};

/** The PO for an approved / issued order (same path for both) and its loadings. */
function createPo(p: Plan, byUserId: ID, signature: string | undefined, approval: 'director' | 'issued') {
  const po: PurchaseOrder = { id: m.uid('po'), ref: p.ref, planId: p.id, entityId: p.entityId, supplierId: p.supplierId, currency: p.currency, date: p.date, title: p.title, instruction: 'Kindly process and avail stock for loading.', version: p.version, approvedById: byUserId, approvedAt: new Date().toISOString(), signature, approval };
  m.db.pos.push(po); p.poId = po.id; m.createLoadingsForPO(po);
  const lp = seed.suppliers.find((s) => s.id === p.supplierId);
  m.notify('New trucks to load', `${p.ref} · ${new Set(p.lines.map((l) => l.truckNo)).size} trucks at ${lp?.code} ${lp?.city}`, '#/loading', ['loader', 'operations', 'fleet'], p.entityId);
  return po;
}
/** Destination warehouse of an order line: the warehouse at the end of its route (docs/07 §D). */
const destOf = (l: PlanLine) => { const cp = m.db.routes.find((r) => r.id === l.routeId)?.stops.at(-1)?.checkpointId; return seed.warehouses.find((w) => w.checkpointId === cp)?.id; };
const roleError = () => Object.assign(new Error('Not available for your role'), { status: 403 });
const feat = (f: FeatureKey) => { if (!current || !R.hasFeature(current.roles, f)) throw roleError(); };
const pp = () => (m.db.periodPlans ??= []);
const ppPrefix = (entityId: ID) => (seed.entities.find((e) => e.id === entityId)?.poPrefix ?? 'XX-PO').replace(/-PO$/, '-PP');
/** Purchase orders are raised and edited by planners (and directors); directors approve (docs/07 §E). */
const canEditPO = () => { if (!current?.roles.some((r) => R.PO_EDITORS.includes(r))) throw Object.assign(new Error('Only planners raise purchase orders'), { status: 403 }); };
const canEditPP = () => { if (!current?.roles.some((r) => R.PERIOD_PLAN_EDITORS.includes(r))) throw Object.assign(new Error('Only planners, directors and admins edit period plans'), { status: 403 }); };
/** Plans never overlap per company: 409 with the conflicting refs, unless `replace` (then they become Replaced). */
function claimPeriod(plan: Pick<PeriodPlan, 'id' | 'entityId' | 'from' | 'to' | 'ref'>, replace?: boolean) {
  const hits = R.overlapsOf(plan, pp());
  if (!hits.length) return [];
  if (!replace) throw Object.assign(new Error(R.overlapMessage(hits)), { status: 409, code: 'overlap', conflicts: hits.map((h) => ({ id: h.id, ref: h.ref, from: h.from, to: h.to, title: h.title })) });
  for (const h of hits) { h.status = 'Replaced'; h.replacedById = plan.id; h.history.push({ at: new Date().toISOString(), byUserId: current!.id, action: 'replaced', comment: `replaced by ${plan.ref}` }); }
  return hits;
}
const ppLines = (lines: PeriodPlanLine[]) => lines.map((l) => ({ ...l, id: l.id || m.uid('ppl'), cases: Math.max(0, Math.round(l.cases)), price: Number(l.price) || 0 }));
const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** §8.3 PL-06..PL-12: period plans per company (Group view reads only). */
export const periodPlans = {
  /** Active plans; `{ all: true }` also lists Replaced ones (kept for history). */
  async list(opts: { all?: boolean } = {}): Promise<PeriodPlan[]> { ensure(); feat('period-plans'); return wait(pp().filter((p) => inScope(p.entityId) && (opts.all || p.status === 'Active')).sort((a, b) => b.from.localeCompare(a.from))); },
  async get(id: ID): Promise<PeriodPlan | null> { ensure(); feat('period-plans'); const p = pp().find((x) => x.id === id); return wait(p && inScope(p.entityId) ? p : null); },
  /** A new plan is Active at once (suggestions — no approval). `replace: true` overwrites overlapping plans. */
  async create(input: { entityId?: ID; periodKind: PeriodKind; from: string; to: string; title: string; lines?: PeriodPlanLine[]; replace?: boolean }): Promise<PeriodPlan> {
    ensure(); feat('period-plans'); canEditPP();
    const entityId = writeEntity(input.entityId);
    if (!DATE.test(input.from) || !DATE.test(input.to) || input.from > input.to) throw Object.assign(new Error('Give a period with a start and an end date'), { status: 422 });
    const plan: PeriodPlan = { id: m.uid('pp'), ref: R.nextRef(pp().map((x) => x.ref), ppPrefix(entityId), Number(input.from.slice(0, 4))), entityId, title: input.title ?? '',
      periodKind: input.periodKind ?? 'custom', from: input.from, to: input.to, status: 'Active', version: 1, lines: ppLines(input.lines ?? []), history: [{ at: new Date().toISOString(), byUserId: current!.id, action: 'created' }], createdById: current!.id };
    const replaced = claimPeriod(plan, input.replace);
    if (replaced.length) plan.history[0].comment = `replaces ${replaced.map((x) => x.ref).join(', ')}`;
    pp().push(plan); return commit(plan);
  },
  /** Save an Active plan (each save = next version). New dates overlapping another Active plan → 409 unless `replace`. */
  async save(plan: PeriodPlan, opts: { replace?: boolean } = {}): Promise<PeriodPlan> {
    ensure(); feat('period-plans'); canEditPP();
    const i = pp().findIndex((x) => x.id === plan.id); const cur = pp()[i];
    if (!cur || !inScope(cur.entityId)) throw notAllowed();
    if (plan.entityId !== cur.entityId) throw new Error('A plan cannot move to another company');
    if (cur.status === 'Replaced') throw Object.assign(new Error('This plan was replaced by a newer one and is kept for history'), { status: 409 });
    if (!DATE.test(plan.from) || !DATE.test(plan.to) || plan.from > plan.to) throw Object.assign(new Error('Give a period with a start and an end date'), { status: 422 });
    const next: PeriodPlan = { ...cur, title: plan.title, periodKind: plan.periodKind, from: plan.from, to: plan.to, lines: ppLines(plan.lines), version: cur.version + 1, history: [...cur.history] };
    const replaced = next.from !== cur.from || next.to !== cur.to ? claimPeriod(next, opts.replace) : [];
    next.history.push({ at: new Date().toISOString(), byUserId: current!.id, action: 'edited', ...(replaced.length ? { comment: `replaces ${replaced.map((x) => x.ref).join(', ')}` } : {}) });
    pp()[i] = next;
    return commit(next);
  },
  async copy(fromId: ID, to: { from: string; to: string; title?: string; replace?: boolean }): Promise<PeriodPlan> {
    ensure(); feat('period-plans'); canEditPP();
    const src = pp().find((x) => x.id === fromId); if (!src || !inScope(src.entityId)) throw notAllowed();
    writeEntity(src.entityId);
    if (!DATE.test(to.from) || !DATE.test(to.to) || to.from > to.to) throw Object.assign(new Error('Give a period with a start and an end date'), { status: 422 });
    const plan = R.copyPeriodPlan(src, to, { id: m.uid('pp'), ref: R.nextRef(pp().map((x) => x.ref), ppPrefix(src.entityId), Number(to.from.slice(0, 4))), lineId: () => m.uid('ppl') }, current!.id);
    claimPeriod(plan, to.replace);
    pp().push(plan); return commit(plan);
  },
  /** Active plans of the same company whose period overlaps (preview of the 409 a save would get). */
  async overlaps(plan: Pick<PeriodPlan, 'id' | 'entityId' | 'from' | 'to'>): Promise<PeriodPlan[]> { ensure(); return wait(R.overlapsOf(plan, pp().filter((x) => inScope(x.entityId)))); },
  async versions(_id: ID) { return wait([] as { version: number; snapshot: PeriodPlan; reason: string | null; at: string }[]); },
};

const pos0 = {
  async list() { ensure(); if (!current || !R.hasFeature(current.roles, 'purchase-orders')) return wait([] as PurchaseOrder[]); return wait(m.db.pos.filter((p) => inScope(p.entityId)).reverse()); },
  /** The PO, its order lines and — for a PO revised at loading — the whole chain (original first, latest last). */
  async get(id: ID) {
    ensure(); const po = m.db.pos.find((p) => p.id === id);
    if (!po || !inScope(po.entityId) || !current || !R.hasFeature(current.roles, 'purchase-orders')) return wait(null);
    const base = po.revisionOf ?? po.id;
    const chain = m.db.pos.filter((x) => x.id === base || x.revisionOf === base).sort((a, b) => (a.revision ?? 0) - (b.revision ?? 0));
    return wait({ po, plan: m.db.plans.find((p) => p.id === po.planId)!, revisions: chain.length > 1 ? chain : [] as PurchaseOrder[] });
  },
  async markSent(id: ID) { ensure(); const po = m.db.pos.find((p) => p.id === id)!; assertScope(po?.entityId); po.sentAt = new Date().toISOString(); return commit(po); },
};

// ---- Loading & waiting list (LD-*, §17.4) ---------------------------------
/** Pending trucks carry the PO ref a deviation would create ("This will create BTW-PO-…-rev001"). */
function withNextRevision<T extends import('./types').Loading>(l: T): T {
  if (l.status !== 'Pending') return l;
  const po = m.db.pos.find((p) => p.id === l.poId); if (!po) return l;
  const baseId = po.revisionOf ?? po.id; const base = m.db.pos.find((p) => p.id === baseId) ?? po;
  const n = m.db.pos.filter((p) => p.revisionOf === baseId).reduce((a, p) => Math.max(a, p.revision ?? 0), 0) + 1;
  return { ...l, nextRevisionRef: R.revisionRef(base.ref, mockConfig.loading.revisionSuffix, n) };
}
/** A queued truck loads for one company: the named one, the active one, or (several in scope) the loading point's. */
const waitingEntity = (loadingPointId: ID, entityId?: ID) => writeEntity(entityId ?? (scopeIds().length > 1 ? seed.ENTITY_OF_SUPPLIER[loadingPointId] : undefined));
const httpErr = (msg: string, code: number) => Object.assign(new Error(msg), { status: code });
/** Loading-point scope (same rule as the API): loaders and truck planners see the points on their profile. */
const seesLp = (lp: ID) => !!current && R.seesLoadingPoint(current, lp);
const assertLp = (lp: ID) => { if (!seesLp(lp)) throw httpErr('Not your loading point', 403); };
const canQueue = (lp: ID) => { assertLp(lp); if (!current!.roles.some((r) => R.QUEUE_EDITORS.includes(r))) throw httpErr('Only loading-point and truck planning staff change the waiting list', 403); };
const queueAt = (lp: ID) => m.db.waiting.filter((w) => w.loadingPointId === lp && w.status === 'Waiting').sort((a, b) => a.position - b.position);
export const loading = {
  async waiting(loadingPointId?: ID) { ensure(); return wait(m.db.waiting.filter((w) => inScope(w.entityId) && seesLp(w.loadingPointId) && (!loadingPointId || w.loadingPointId === loadingPointId)).sort((a, b) => a.position - b.position)); },
  async addWaiting(loadingPointId: ID, truckId: ID, driverId: ID, entityId?: ID) {
    ensure(); canQueue(loadingPointId); const company = waitingEntity(loadingPointId, entityId);
    if (!seed.suppliers.some((x) => x.id === loadingPointId)) throw httpErr('Loading point not found', 404);
    const truck = m.db.trucks.find((x) => x.id === truckId); if (!truck) throw httpErr('Truck not found', 404);
    if (!m.db.drivers.some((x) => x.id === driverId)) throw httpErr('Driver not found', 404);
    if (truck.active === false || m.db.providers.find((p) => p.id === truck.providerId)?.active === false) throw httpErr(`${truck.reg} is deactivated — reactivate it in master data first`, 409);
    if (m.db.waiting.some((w) => w.truckId === truckId && w.status === 'Waiting')) throw httpErr(`${truck.reg} is already in a waiting list`, 409);
    const pos = queueAt(loadingPointId).length + 1;
    const e = { id: m.uid('wl'), entityId: company, loadingPointId, truckId, driverId, arrivedAt: new Date().toISOString(), position: pos, status: 'Waiting' as const };
    m.db.waiting.push(e); return commit(e);
  },
  async list(loadingPointId?: ID) { ensure(); return wait(m.db.loadings.filter((l) => inScope(l.entityId) && seesLp(l.loadingPointId) && (!loadingPointId || l.loadingPointId === loadingPointId)).map(withNextRevision).map((l) => ({ ...l, poRef: lookup.poRef(l.poId) }))); },
  /** Loading against the PO: per-line quantities and (config loading.allowAlternatives) substitutes from the supplier's
   *  price list; the total must stay within ±allowancePct of the order and the truck's capacity. Any difference writes
   *  a PO revision (…-rev001, -rev002 …) that every truck of the order then follows. */
  async confirm(id: ID, input: { truckId: ID; driverId: ID; loadedQty: Record<ID, number>; agreedTransport: number; documents: string[]; alternatives?: LoadingAlternative[] }) {
    ensure(); const ld = m.db.loadings.find((l) => l.id === id)!; assertScope(ld?.entityId);
    if (ld.status === 'Loaded') throw Object.assign(new Error('This truck is already loaded'), { status: 409 });
    const truck = m.db.trucks.find((t) => t.id === input.truckId)!;
    if (!(Number(input.agreedTransport) > 0)) throw new Error('Enter the agreed transport price (§17.5)');
    const po = m.db.pos.find((p) => p.id === ld.poId)!;
    const alternatives = (input.alternatives ?? []).slice(0, 20);
    const check = R.loadingCheck(ld.lines, input.loadedQty, alternatives, truck.capacityCases, mockConfig.loading, { supplierId: po.supplierId, products: seed.products });
    if (check.error) throw Object.assign(new Error(check.error), { status: 422 });
    for (const l of ld.lines) { const v = input.loadedQty?.[l.planLineId]; l.loadedQty = v === undefined || v === null || !Number.isFinite(Number(v)) ? l.orderedQty : Math.max(0, Math.round(Number(v))); }
    if (check.deviates) {
      const baseId = po.revisionOf ?? po.id; const base = m.db.pos.find((p) => p.id === baseId)!;
      const n = m.db.pos.filter((p) => p.revisionOf === baseId).reduce((a, p) => Math.max(a, p.revision ?? 0), 0) + 1;
      const ref = R.revisionRef(base.ref, mockConfig.loading.revisionSuffix, n);
      const prev = m.db.plans.find((p) => p.id === po.planId)!;
      const poId = m.uid('po'); const at = new Date().toISOString();
      const r = R.revisePlan(prev, ld.truckNo, ld.lines, input.loadedQty, alternatives, { id: m.uid('plan'), ref, poId, lineId: () => m.uid('pl'), basePlanId: base.planId, revision: n }, lookup.price, current?.id ?? '', at);
      const changes = check.changes.map((c) => ({ ...c, truckNo: ld.truckNo, ...(c.kind === 'alternative' ? { planLineId: r.altLines.find((a) => a.productId === c.productId && a.alternativeFor === c.replacesPlanLineId)?.planLineId } : {}) }));
      const summary = R.revisionSummary(changes, (pid) => lookup.product(pid)?.brand ?? pid);
      const next: PurchaseOrder = { ...po, id: poId, ref, planId: r.plan.id, version: 1, approvedById: current?.id ?? '', approvedAt: at, signature: undefined, sentAt: undefined, approval: 'revision',
        revisionOf: baseId, revision: n, changes, revisionReason: `Loaded truck ${ld.truckNo} differs from the PO (${summary || 'quantities'}) — revised automatically at loading`, createdBy: 'system', onBehalfOfId: current?.id };
      delete next.supersededById;
      m.db.plans.push(r.plan); m.db.pos.push(next);
      prev.supersededById = r.plan.id; po.supersededById = poId;
      // downstream follows the latest revision: every truck of the order (loaded or not) points at it
      for (const x of m.db.loadings) if (x.poId === po.id) x.poId = poId;
      for (const x of m.db.shipments) if (x.poId === po.id) x.poId = poId;
      ld.lines.push(...r.altLines.map((a) => ({ planLineId: a.planLineId, productId: a.productId, orderedQty: 0, loadedQty: a.qty, ...(a.alternativeFor ? { alternativeFor: a.alternativeFor } : {}) })));
      m.notify('PO revised at loading', `PO ${po.ref} revised → ${ref} at loading${summary ? ` (${summary})` : ''} · ${truck.reg}`, `#/pos/${poId}`, ['planner', 'director'], po.entityId);
    }
    ld.documents = input.documents.map((n) => ({ id: m.uid('doc'), kind: 'delivery-note', name: n }));
    const sh = m.completeLoading(ld, input.truckId, input.driverId, input.agreedTransport);
    m.notify('Truck loaded', `${truck.reg} · ${check.loaded} cases · ${sh.ref}`, `#/shipments/${sh.id}`, ['operations', 'fleet', 'director'], sh.entityId);
    return commit(sh);
  },
};

// ---- Shipments, legs, tracking (DS-*, TR-*) --------------------------------
const shipments0 = {
  async list() { ensure(); m.db.shipments.forEach((s) => (s.status = m.deriveShipmentStatus(s))); return wait(m.db.shipments.filter((s) => inScope(s.entityId)).reverse()); },
  async get(id: ID) { ensure(); const sh = m.db.shipments.find((s) => s.id === id); if (sh) sh.status = m.deriveShipmentStatus(sh); return wait(sh && inScope(sh.entityId) ? sh : null); },
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
  /** Doc 08 §2: onward move from the warehouse where the shipment was received = a NEW shipment (returned). */
  async sendOn(fromShipmentId: ID, input: { routeId: ID; truckId: ID; driverId: ID; lines?: Leg['lines'] }) {
    ensure(); const from = m.db.shipments.find((s) => s.id === fromShipmentId && inScope(s.entityId));
    if (!from) throw new Error('Shipment not found');
    return commit(m.sendOn(from.id, input, Date.now() + 2 * 36e5));
  },
  /** @deprecated use sendOn — kept for older screens: sends the goods on and returns the new shipment's first leg. */
  async addLeg(shipmentId: ID, routeId: ID, truckId: ID, driverId: ID) { const sh = await shipments.sendOn(shipmentId, { routeId, truckId, driverId }); return sh.legs[0]; },
  /** The whole journey containing a shipment, origin first, each with loaded / received / damaged cases. */
  async journey(id: ID) { ensure(); return wait(R.journeyOf(m.db.shipments.filter((s) => inScope(s.entityId)), m.db.acks, id)); },
  async ack(id: ID) { ensure(); return wait(m.db.acks.find((a) => a.id === id) ?? null); },
};

// ---- Inventory & sales (IN-*, SL-*) ---------------------------------------
/** Stock and sales of a warehouse (same rule as the API): office roles, or staff of that warehouse. Truck planners: none. */
const seesWh = (wh: ID) => !current || current.roles.some((r) => ['director', 'admin', 'planner', 'fleet', 'operations', 'accounts'].includes(r)) || current.warehouseIds.includes(wh);
export const inventory = {
  async stock() { ensure(); return wait(m.stock().filter((r) => inScope(r.entityId) && seesWh(r.warehouseId))); },
  async ledger(warehouseId: ID, productId: ID) { ensure(); if (!seesWh(warehouseId)) throw httpErr('Not available for your role', 403); return wait(m.db.stockMoves.filter((x) => inScope(x.entityId) && x.warehouseId === warehouseId && x.productId === productId).slice(-50).reverse()); },
};
export const sales = {
  async list(warehouseId?: ID) { ensure(); return wait(m.db.sales.filter((s) => inScope(s.entityId) && seesWh(s.warehouseId) && (!warehouseId || s.warehouseId === warehouseId)).slice(-200).reverse()); },
  async create(input: Omit<Sale, 'id' | 'ref' | 'status' | 'entityId'> & { entityId?: ID }, override = false) {
    ensure();
    const entityId = writeEntity(input.entityId);
    if (input.counterpartyEntityId && (input.counterpartyEntityId === entityId || !ALL_ENTITIES.includes(input.counterpartyEntityId))) throw new Error('An intercompany sale must name a different sibling company');
    const st = m.stock();
    for (const l of input.lines) {
      // a sale draws only its own company's stock, even in a shared warehouse
      const avail = st.find((r) => r.entityId === entityId && r.warehouseId === input.warehouseId && r.productId === l.productId)?.closing ?? 0;
      if (l.qty > avail && !override) throw new Error(`Only ${avail} cases of ${lookup.product(l.productId)?.brand} in stock (SL-02)`);
    }
    const total = input.lines.reduce((a, l) => a + m.amount(l.qty, l.price), 0);
    const sale: Sale = { ...input, entityId, id: m.uid('sale'), ref: `SAL-${String(m.db.sales.length + 1).padStart(5, '0')}`, status: input.paid >= total ? 'Paid' : input.paid > 0 ? 'Part-paid' : 'Unpaid' };
    m.db.sales.push(sale);
    for (const l of sale.lines) m.db.stockMoves.push({ entityId, warehouseId: sale.warehouseId, productId: l.productId, kind: 'sold', qty: l.qty, at: sale.at, ref: sale.ref });
    if (sale.counterpartyEntityId) for (const l of sale.lines) m.db.stockMoves.push({ entityId: sale.counterpartyEntityId, warehouseId: sale.warehouseId, productId: l.productId, kind: 'transferIn', qty: l.qty, at: sale.at, ref: sale.ref });
    return commit(sale);
  },
};

// ---- Trip financials & landing cost (FN-*, §17.6) -------------------------
export const finance = {
  async trips() {
    ensure(); feat('finance');
    return wait(m.db.shipments.filter((s) => inScope(s.entityId)).map((s) => {
      const costs = m.db.costs.filter((c) => c.shipmentId === s.id).map((c) => ({ ...c, amountUsd: c.amountUsd ?? c.amount }));
      const pays = m.db.payments.filter((p) => p.shipmentId === s.id);
      const transport = costs.filter((c) => c.kind === 'Transport').reduce((a, c) => a + c.amountUsd, 0);
      const paid = pays.filter((p) => p.status !== 'Pending approval').reduce((a, p) => a + (p.amountUsd ?? p.amount), 0);
      const plan = m.db.plans.find((p) => p.poId === s.poId)!;
      const goods = s.legs[0].lines.reduce((a, l) => a + l.loadedQty * (plan.lines.find((pl) => pl.productId === l.productId)?.price ?? 0), 0);
      const cases = s.legs[0].lines.reduce((a, l) => a + l.loadedQty, 0);
      const expenses = costs.reduce((a, c) => a + c.amountUsd, 0);
      return { shipment: s, costs, payments: pays, transport, paid, balance: transport - paid, goods, expenses, landing: goods + expenses, cases, perCase: cases ? (goods + expenses) / cases : 0 };
    }));
  },
  async addCost(c: Omit<TripCost, 'id' | 'entityId'> & { entityId?: ID }) {
    ensure(); feat('finance'); if (!(c.amount > 0)) throw httpErr('Amount must be above zero', 422);
    const sh = m.db.shipments.find((x) => x.id === c.shipmentId); assertScope(sh?.entityId);
    if (c.entityId && c.entityId !== sh!.entityId) throw notAllowed();
    const currency = c.currency ?? 'USD'; const rate = R.fxFor(m.db.fxRates ?? seed.seedFxRates(), currency, Date.now());
    const x: TripCost = { ...c, currency, entityId: sh!.entityId, id: m.uid('cost'), fxRate: rate, amountUsd: Math.round((c.amount / rate) * 100) / 100 };
    m.db.costs.push(x); return commit(x);
  },
  async pay(shipmentId: ID, costId: ID, amount: number, reference: string, threshold = 500) {
    ensure(); if (!current?.roles.some((r) => r === 'accounts' || r === 'director')) throw httpErr('Only accounts record payments', 403);
    const sh = m.db.shipments.find((x) => x.id === shipmentId); assertScope(sh?.entityId);
    const cost = m.db.costs.find((c) => c.id === costId);
    if (!cost || cost.shipmentId !== shipmentId || cost.entityId !== sh!.entityId) throw new Error('Pick a cost line of this trip');
    const rate = cost.fxRate ?? 1; const amountUsd = Math.round((amount / rate) * 100) / 100;
    const status = amountUsd > threshold ? 'Pending approval' as const : 'Paid' as const;
    const p = { id: m.uid('pay'), entityId: sh!.entityId, shipmentId, costId, amount, at: new Date().toISOString(), reference, status, fxRate: rate, amountUsd };
    m.db.payments.push(p);
    if (status === 'Pending approval') m.notify('Payment needs approval', `USD ${amountUsd} · ${reference}`, '#/finance', ['director'], sh!.entityId);
    return commit(p);
  },
  async approve(paymentId: ID) { ensure(); if (!current?.roles.includes('director')) throw httpErr('Only directors approve payments above the threshold (FN-03)', 403); const p = m.db.payments.find((x) => x.id === paymentId)!; assertScope(p?.entityId); p.status = 'Paid'; p.approvedById = current?.id; return commit(p); },
};

// ---- Analytics & notifications --------------------------------------------
const analytics0 = {
  async velocity() { ensure(); return wait(m.velocity().filter((r) => inScope(r.entityId))); },
  async flags() { ensure(); return wait(m.flags().filter((r) => inScope(r.entityId))); },
  thresholds: m.thresholds,
  async summary() {
    ensure();
    const st = m.stock().filter((r) => inScope(r.entityId) && seesWh(r.warehouseId));
    const since = Date.now() - 30 * 864e5;
    const scopedSales = m.db.sales.filter((s) => inScope(s.entityId) && seesWh(s.warehouseId));
    const sales30 = scopedSales.filter((s) => Date.parse(s.at) >= since).reduce((a, s) => a + s.lines.reduce((b, l) => b + l.qty * l.price, 0), 0);
    const daily = Array.from({ length: 30 }, (_, i) => {
      const day = new Date(Date.now() - (29 - i) * 864e5).toISOString().slice(0, 10);
      return { day, cases: scopedSales.filter((s) => s.at.slice(0, 10) === day).reduce((a, s) => a + s.lines.reduce((b, l) => b + l.qty, 0), 0) };
    });
    m.db.shipments.forEach((x) => (x.status = m.deriveShipmentStatus(x)));
    const active = m.db.shipments.filter((s) => s.status !== 'Acknowledged' && inScope(s.entityId));
    return wait({
      stockValue: st.reduce((a, r) => a + r.closing * r.landedCostPerCase, 0),
      stockCases: st.reduce((a, r) => a + r.closing, 0),
      inTransitCases: st.reduce((a, r) => a + r.inTransit, 0),
      sales30, daily,
      trucksActive: active.length,
      trucksDelayed: active.filter((s) => s.status === 'Delayed').length,
      trucksAtBorder: active.filter((s) => s.legs.some((l) => l.status === 'At border')).length,
      plansPending: mockConfig.approvals.purchaseOrders ? m.db.plans.filter((p) => p.status === 'Submitted' && inScope(p.entityId)).length : 0,
      paymentsPending: m.db.payments.filter((p) => p.status === 'Pending approval' && inScope(p.entityId)).length,
      unpaidBalance: scopedSales.reduce((a, s) => a + s.lines.reduce((b, l) => b + l.qty * l.price, 0) - s.paid, 0),
    });
  },
};
export const notifications = {
  async list() { ensure(); return wait(m.db.notifications.filter((n) => (!n.entityId || inScope(n.entityId)) && (!current || current.roles.some((r) => n.forRoles.includes(r)) || current.roles.includes('director')))); },
  async readAll() { ensure(); m.db.notifications.forEach((n) => (n.read = true)); return commit(true); },
  async markRead(id: ID) { ensure(); const n = m.db.notifications.find((x) => x.id === id); if (n) n.read = true; return commit(true); },
};

export const demo = {
  reset() { m.reset(); emit(); },
  /** Mock only: change the config.toml stand-in (e.g. turn director approval of POs on) for demos and tests. */
  setConfig(c: { approvals?: Partial<AppConfig['approvals']>; loading?: Partial<AppConfig['loading']> }) { Object.assign(mockConfig.approvals, c.approvals ?? {}); Object.assign(mockConfig.loading, c.loading ?? {}); emit(); },
};

// ---- Additions for the logistics review (append-only) -----------------------
export const queue = {
  /** Move a waiting truck up (-1) or down (+1) in its loading point's queue (§17.4). */
  async move(entryId: ID, dir: -1 | 1) {
    ensure(); const e = m.db.waiting.find((w) => w.id === entryId);
    if (!e) throw httpErr('Waiting entry not found', 404);
    return queue.moveTo(entryId, queueAt(e.loadingPointId).indexOf(e) + 1 + dir);
  },
  /** Put a waiting truck at `position` (1 = next to load); the others shift. The loader is told. */
  async moveTo(entryId: ID, position: number) {
    ensure(); const e = m.db.waiting.find((w) => w.id === entryId);
    if (!e) throw httpErr('Waiting entry not found', 404);
    assertScope(e.entityId); canQueue(e.loadingPointId);
    if (e.status !== 'Waiting') throw httpErr('This truck is no longer waiting', 409);
    if (!Number.isFinite(position)) throw httpErr('Give the new position as a number', 422);
    const q = queueAt(e.loadingPointId); const before = q.indexOf(e) + 1;
    const ids = R.reorderQueue(q.map((w) => w.id), entryId, position);
    ids.forEach((id, k) => (m.db.waiting.find((w) => w.id === id)!.position = k + 1));
    if (e.position !== before) m.notify('Loading queue changed', `${seed.suppliers.find((x) => x.id === e.loadingPointId)?.code ?? ''}: ${m.truckReg(e.truckId)} moved from #${before} to #${e.position} by ${current?.name ?? ''}`, `#/loading?lp=${e.loadingPointId}`, ['loader'], e.entityId);
    return commit(e);
  },
  /** Take a truck out of the queue, with the reason the loader sees. */
  async remove(entryId: ID, reason?: string) {
    ensure();
    const e = m.db.waiting.find((w) => w.id === entryId);
    if (!e) throw httpErr('Waiting entry not found', 404);
    assertScope(e.entityId); canQueue(e.loadingPointId);
    if (reason !== undefined && (typeof reason !== 'string' || reason.length > 200)) throw httpErr('The reason must be text (200 characters at most)', 422);
    m.db.waiting = m.db.waiting.filter((w) => w.id !== entryId);
    queueAt(e.loadingPointId).forEach((w, k) => (w.position = k + 1));
    m.notify('Truck removed from the queue', `${seed.suppliers.find((x) => x.id === e.loadingPointId)?.code ?? ''}: ${m.truckReg(e.truckId)} removed by ${current?.name ?? ''}${reason?.trim() ? ` — ${reason.trim()}` : ''}`, `#/loading?lp=${e.loadingPointId}`, ['loader'], e.entityId);
    return commit(true);
  },
  /** Register a non-regular (market) truck + driver on the spot and queue it (§17.4: company, truck, trailer, driver). */
  async addMarketTruck(loadingPointId: ID, input: { company: string; reg: string; trailer: string; capacityCases: number; driverName: string; driverPhone: string }) {
    ensure(); canQueue(loadingPointId);
    if (!input.reg.trim() || !input.driverName.trim()) throw new Error('Truck registration and driver name are required');
    const reg = R.normReg(input.reg);
    if (m.db.trucks.some((t) => R.normReg(t.reg).replace(/\s/g, '') === reg.replace(/\s/g, ''))) throw httpErr(`${reg} is already registered — pick it from the list`, 409);
    const entityId = waitingEntity(loadingPointId);
    const known = m.db.providers.find((p) => p.name.toLowerCase() === input.company.trim().toLowerCase());
    const provider = known ?? { id: m.uid('pr'), name: input.company.trim() || 'Market truck', kind: 'market' as const, regular: false, phone: '', active: true };
    if (!known) m.db.providers.push(provider);
    const driver = { id: m.uid('d'), name: input.driverName.trim(), phone: input.driverPhone.trim(), licence: '', providerId: provider.id, hasApp: false };
    m.db.drivers.push(driver);
    const truck = { id: m.uid('t'), providerId: provider.id, reg, trailer: input.trailer.trim().toUpperCase(), capacityCases: input.capacityCases || 2000, defaultDriverId: driver.id };
    m.db.trucks.push(truck);
    const position = queueAt(loadingPointId).length + 1;
    const e = { id: m.uid('wl'), entityId, loadingPointId, truckId: truck.id, driverId: driver.id, arrivedAt: new Date().toISOString(), position, status: 'Waiting' as const };
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
/** Channel/app version headers for the API (no-op in the mock) and the active company (`entityId`, null = Group /
 *  all allowed companies). Persisted per user, like the HTTP client. */
export function configure(o: { channel?: 'web' | 'app'; appVersion?: string; baseUrl?: string; entityId?: ID | null }) {
  if (!('entityId' in o)) return;
  const id = o.entityId ?? null;
  if (id && current && !current.allowedEntityIds.includes(id)) throw notAllowed();
  activeEntity = id;
  try { if (current) { if (id) localStorage.setItem(entityKey(current), id); else localStorage.removeItem(entityKey(current)); } } catch { /* ignore */ }
  emit();
}

export const auth = Object.assign(auth0, {
  /** Real sign-in shape. Mock accepts any password/PIN for a known username, id or phone. */
  async signIn(input: { username?: string; password?: string; phone?: string; pin?: string }) {
    const who = (input.username ?? input.phone ?? '').trim().toLowerCase();
    ensure(); const u = allUsers().find((x) => x.id === who || x.id === `u-${who}` || x.phone === who || x.phone.replace(/\s/g, '') === who);
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
      waiting: m.db.waiting.filter((w) => inScope(w.entityId) && u.loadingPointIds.includes(w.loadingPointId) && w.status === 'Waiting').sort((a, b) => a.position - b.position),
      toLoad: m.db.loadings.filter((l) => l.status === 'Pending' && inScope(l.entityId) && u.loadingPointIds.includes(l.loadingPointId)).map(withNextRevision).map((l) => ({ ...l, poRef: lookup.poRef(l.poId), poTitle: m.db.pos.find((p) => p.id === l.poId)?.title ?? '' })),
      handover: m.db.shipments.filter((s) => inScope(s.entityId)).flatMap((s) => s.legs.filter((l) => ['Planned', 'Loaded'].includes(l.status) && cps.includes(l.fromId)).map((l) => legView(s, l))),
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
    if (p.supersededById || p.revisionOf) throw Object.assign(new Error('This PO was revised at loading — its trucks are being loaded; raise a new order for further changes'), { status: 409 });
    if (!reason?.trim()) throw new Error('Give a reason for the amendment');
    p.version += 1; p.status = 'Draft'; p.history.push({ at: new Date().toISOString(), byUserId: current?.id ?? '', action: 'amended', comment: reason });
    return commit(p);
  },
  async versions(_id: ID) { return wait([] as { version: number; snapshot: Plan; reason: string | null; at: string }[]); },
  /** PO-06: each line against the approved period plan — planned, ordered before, this PO, remaining, over/unplanned. */
  async planContext(planId: ID): Promise<PlanLineContext[]> {
    ensure(); const p = m.db.plans.find((x) => x.id === planId); if (!p || !inScope(p.entityId)) throw notAllowed();
    return wait(R.planContext(p, m.db.periodPlans ?? [], m.db.plans, destOf));
  },
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
  /** Doc 08 §3: add a warehouse (admin, director); its geofence becomes a warehouse checkpoint. */
  async addWarehouse(input: WarehouseInput) { return masterdata.saveWarehouse(null, input); },
  async updateWarehouse(id: ID, input: Partial<WarehouseInput>) { return masterdata.saveWarehouse(id, input); },
  async saveWarehouse(id: ID | null, input: Partial<WarehouseInput>): Promise<Warehouse> {
    ensure();
    if (!current || !current.roles.some((r) => r === 'admin' || r === 'director')) throw Object.assign(new Error('Only an admin or director manages warehouses'), { status: 403 });
    const cur = id ? seed.warehouses.find((w) => w.id === id) : null;
    if (id && !cur) throw Object.assign(new Error('Warehouse not found'), { status: 404 });
    const cp = cur ? seed.checkpoints.find((c) => c.id === cur.checkpointId) : null;
    const v = { name: cur?.name, country: cur?.country, town: cur?.town, receivingCompanyId: cur?.receivingCompanyId, lat: cp?.lat, lng: cp?.lng, radiusM: cp?.radiusM, active: cur?.active ?? true, ...input };
    const errs = R.validateWarehouse(v, seed.receivingCompanies.map((r) => r.id));
    if (errs.length) throw Object.assign(new Error(errs.join('; ')), { status: 422 });
    const name = v.name!.trim(), country = v.country!.trim(), town = v.town!.trim();
    const codes = R.checkpointCodes(`${name} ${town}`, 'warehouse');
    const ncp: Checkpoint = { ...(cp ?? { id: m.uid('cp-wh'), kind: 'warehouse' as const, code: codes[0], aliases: codes }), name, country: R.countryCode(country), lat: v.lat!, lng: v.lng!, radiusM: v.radiusM ?? 500 };
    const nw: Warehouse = { ...(cur ?? { id: m.uid('w'), checkpointId: ncp.id }), name, country, town, receivingCompanyId: v.receivingCompanyId!, active: v.active !== false };
    const up = <T extends { id: ID }>(list: T[] | undefined, x: T) => [...(list ?? []).filter((y) => y.id !== x.id), x];
    m.db.warehouseEdits = up(m.db.warehouseEdits, nw); m.db.checkpointEdits = up(m.db.checkpointEdits, ncp);
    m.applyMasterEdits();
    return commit(nw);
  },
  /** Doc 08 §3: a new route (checkpoints in order), e.g. ending at a new warehouse. */
  async addRoute(input: { name: string; code?: string; distanceKm?: number; stops: RouteStop[] }) {
    ensure();
    const errs = R.validateRoute(input, seed.checkpoints.map((c) => c.id));
    if (errs.length) throw Object.assign(new Error(errs.join('; ')), { status: 422 });
    const short = (id: ID) => (seed.checkpoints.find((c) => c.id === id)?.code ?? R.checkpointCodes(seed.checkpoints.find((c) => c.id === id)?.name ?? 'X', 'town')[0]).slice(0, 3);
    const r = { id: m.uid('r'), code: input.code?.trim() || `${short(input.stops[0].checkpointId)}-${short(input.stops.at(-1)!.checkpointId)}`, name: input.name.trim(), distanceKm: input.distanceKm ?? 0, stops: input.stops };
    m.db.routes.push(r); return commit(r);
  },
  async updateRouteStops(routeId: ID, stops: RouteStop[]) {
    ensure(); const r = m.db.routes.find((x) => x.id === routeId)!;
    if (stops.some((s, i) => i > 0 && s.plannedHours < stops[i - 1].plannedHours + stops[i - 1].plannedDwellHours)) throw new Error('Planned hours must increase along the route (including dwell)');
    r.stops = stops; return commit(r);
  },
  // ---- Transport onboarding (docs/10): providers, trucks, drivers — truck planners, fleet, planners, directors, admins ----
  async addTruck(input: TruckInput) { return masterdata.saveTruck(null, input); },
  async addDriver(input: DriverInput & { appLogin?: boolean }) { return masterdata.saveDriver(null, input); },
  async addProvider(input: Partial<ProviderInput> & { name: string }) { return masterdata.saveProvider(null, { kind: input.regular === false ? 'market' : 'company', ...input }); },
  /** Add (id null) or edit a transport provider. `active: false` deactivates it (kept for history). */
  async saveProvider(id: ID | null, input: Partial<ProviderInput>): Promise<Provider> {
    ensure(); canTransport();
    const cur = id ? m.db.providers.find((p) => p.id === id) : null;
    if (id && !cur) throw httpErr('Provider not found', 404);
    const v = { name: cur?.name, kind: cur?.kind ?? (cur && !cur.regular ? 'market' : 'company'), regular: cur?.regular, phone: cur?.phone, contactName: cur?.contactName, email: cur?.email, notes: cur?.notes, active: cur?.active ?? true, ...input } as Partial<ProviderInput>;
    const errs = R.validateProvider(v, m.db.providers, id); if (errs.length) throw httpErr(errs.join('; '), 422);
    const x: Provider = { id: cur?.id ?? m.uid('pr'), name: v.name!.trim(), kind: v.kind!, regular: v.regular ?? v.kind !== 'market', phone: v.phone ? R.normPhone(v.phone) : '', contactName: (v.contactName ?? '').trim(), email: (v.email ?? '').trim(), notes: (v.notes ?? '').trim(), active: v.active !== false };
    if (cur) Object.assign(cur, x); else m.db.providers.push(x);
    return commit(x);
  },
  /** Add or edit a truck: unique registration, capacity in cases, default driver; `active: false` takes it off queues. */
  async saveTruck(id: ID | null, input: Partial<TruckInput>): Promise<Truck> {
    ensure(); canTransport();
    const cur = id ? m.db.trucks.find((t) => t.id === id) : null;
    if (id && !cur) throw httpErr('Truck not found', 404);
    const v = { providerId: cur?.providerId, reg: cur?.reg, trailer: cur?.trailer ?? '', capacityCases: cur?.capacityCases, defaultDriverId: cur?.defaultDriverId ?? null, active: cur?.active ?? true, note: cur?.note ?? null, documents: cur?.documents ?? [], ...input } as Partial<TruckInput>;
    const errs = R.validateTruck(v, { providers: m.db.providers, trucks: m.db.trucks, drivers: m.db.drivers }, id); if (errs.length) throw httpErr(errs.join('; '), 422);
    if (cur && v.active === false && cur.active !== false && m.db.waiting.some((w) => w.truckId === cur.id && w.status === 'Waiting')) throw httpErr(`${cur.reg} is in a loading queue — remove it from the queue first`, 409);
    const x: Truck = { ...(cur ?? {}), id: cur?.id ?? m.uid('t'), providerId: v.providerId!, reg: R.normReg(v.reg), trailer: (v.trailer ?? '').trim().toUpperCase(), capacityCases: v.capacityCases!, active: v.active !== false, note: v.note ?? null, documents: (v.documents ?? []).map((d) => ({ id: d.id || m.uid('doc'), kind: d.kind ?? 'photo', name: d.name })) };
    if (v.defaultDriverId) x.defaultDriverId = v.defaultDriverId; else delete x.defaultDriverId;
    if (cur) Object.assign(cur, x); else m.db.trucks.push(x);
    return commit(x);
  },
  /** Add or edit a driver (unique phone). `appLogin: true` with `hasApp` gives the driver a field-app login (PIN). */
  async saveDriver(id: ID | null, input: Partial<DriverInput> & { appLogin?: boolean }): Promise<SavedDriver> {
    ensure(); canTransport();
    const cur = id ? m.db.drivers.find((d) => d.id === id) : null;
    if (id && !cur) throw httpErr('Driver not found', 404);
    const v = { providerId: cur?.providerId, name: cur?.name, phone: cur?.phone, licence: cur?.licence ?? '', hasApp: cur?.hasApp ?? false, active: cur?.active ?? true, ...input };
    const errs = R.validateDriver(v, { providers: m.db.providers, drivers: m.db.drivers }, id); if (errs.length) throw httpErr(errs.join('; '), 422);
    const phone = R.normPhone(v.phone);
    const x: Driver = { ...(cur ?? {}), id: cur?.id ?? m.uid('d'), providerId: v.providerId!, name: v.name!.trim(), phone, licence: (v.licence ?? '').trim(), hasApp: v.hasApp === true, active: v.active !== false };
    if (cur && cur.phone !== phone) { delete x.localPhone; delete x.phoneNote; }
    let login: SavedDriver['login'];
    if (input.appLogin && x.hasApp) {
      const owner = allUsers().find((u) => R.normPhone(u.phone) === phone);
      if (owner && !owner.roles.includes('driver')) throw httpErr('This phone number belongs to an office user — use another number for the driver', 409);
      if (owner) login = { userId: owner.id, username: owner.id.replace(/^u-/, '') };
      else {
        const u: User = { id: m.uid('u'), name: x.name, phone, roles: ['driver'], entityIds: [], loadingPointIds: [], warehouseIds: [], ...R.entityAccess({ roles: ['driver'], entityIds: [] }, ALL_ENTITIES), features: [] };
        (m.db.extraUsers ??= []).push(u);
        mockUsers.push({ ...u, username: u.id.replace(/^u-/, ''), email: null, active: true, hasPassword: false, hasPin: true, driverId: x.id });
        login = { userId: u.id, username: u.id.replace(/^u-/, ''), pin: '1234' }; // demo PIN (mock)
      }
    }
    if (cur) Object.assign(cur, x); else m.db.drivers.push(x);
    return commit({ ...x, ...(login ? { login } : {}) });
  },
};
const canTransport = () => { if (!current || !R.canEditTransport(current.roles)) throw httpErr('Only truck planners, fleet, planners, directors and admins manage transport providers', 403); };

const mockUsers: UserAdmin[] = seed.users.map((u) => ({ ...u, username: u.id.replace(/^u-/, ''), email: `${u.id.replace(/^u-/, '')}@btw.local`, active: true, hasPassword: true, hasPin: true, driverId: seed.drivers.find((d) => d.phone === u.phone)?.id ?? null }));
let mockUsersLoaded = false;
/** Field-app logins created for new drivers in this demo join the admin list once. */
const adminUsers = () => { if (!mockUsersLoaded) { ensure(); mockUsersLoaded = true; for (const u of m.db.extraUsers ?? []) if (!mockUsers.some((x) => x.id === u.id)) mockUsers.push({ ...u, username: u.id.replace(/^u-/, ''), email: null, active: true, hasPassword: false, hasPin: true, driverId: m.db.drivers.find((d) => d.phone === u.phone)?.id ?? null }); } return mockUsers; };
export const users = {
  async list() { return wait(adminUsers()); },
  async create(input: { name: string; phone: string; username?: string; email?: string; roles: Role[]; entityIds?: ID[]; loadingPointIds?: ID[]; warehouseIds?: ID[]; password?: string; pin?: string }) {
    if (!input.name?.trim() || !input.phone?.trim()) throw new Error('Name and phone are required');
    if (!input.roles?.length) throw new Error('Pick at least one valid role');
    const u: UserAdmin = { id: m.uid('u'), name: input.name, phone: input.phone, username: input.username ?? input.name.split(' ')[0].toLowerCase(), email: input.email ?? null, roles: input.roles, entityIds: input.entityIds ?? [], ...R.entityAccess({ roles: input.roles, entityIds: input.entityIds ?? [] }, ALL_ENTITIES), loadingPointIds: input.loadingPointIds ?? [], warehouseIds: input.warehouseIds ?? [], active: true, hasPassword: !!input.password, hasPin: !!input.pin, driverId: null };
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
          'waiting.add': () => loading.addWaiting(x.loadingPointId, x.truckId, x.driverId, x.entityId),
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

// ---- Reports (same pure functions as the server: packages/api/src/reports.ts) -------------------
function reportData(): RP.ReportData {
  ensure(); const r = ref();
  return {
    now: Date.now(), sales: m.db.sales, shipments: m.db.shipments.map((s) => ({ ...s, status: m.deriveShipmentStatus(s) })), acks: m.db.acks,
    costs: m.db.costs, payments: m.db.payments, plans: m.db.plans, pos: m.db.pos, loadings: m.db.loadings, moves: m.db.stockMoves, stock: m.stock(),
    products: r.products, priceList: r.priceList, warehouses: r.warehouses, routes: r.routes, checkpoints: r.checkpoints, suppliers: r.suppliers,
    trucks: r.trucks, drivers: r.drivers, providers: r.providers, entities: r.entities,
    fxRates: m.db.fxRates ?? seed.seedFxRates(), entityScope: scopeIds(),
    periodPlans: m.db.periodPlans ?? [], pvThresholds: m.db.pvThresholds ?? R.defaultPvThresholds,
  };
}
const assertGroup = () => { if (!current?.canGroup) throw Object.assign(new Error('The Group view is for directors'), { status: 403 }); };
const assertFilter = (f: { entityId?: ID }, report = 'reports') => {
  if (!current || !R.canOpenReport(current.roles, report)) throw roleError();
  if (f.entityId) assertScope(f.entityId);
};
export const reports = {
  resolvePeriod: RP.resolvePeriod,
  quarterOf: RP.quarterOf,
  dashboard: (f: { entityId?: ID } = {}) => { assertFilter(f, 'dashboard'); return wait(RP.dashboardReport(reportData(), f)); },
  sales: (f: RP.ReportFilter & { groupBy?: RP.GroupBy } = {}) => { assertFilter(f, 'sales'); return wait(RP.salesReport(reportData(), f)); },
  quarterly: (quarter?: string, f: RP.ReportFilter = {}) => { assertFilter(f, 'quarterly'); return wait(RP.quarterlyReport(reportData(), quarter, f)); },
  logistics: (f: RP.ReportFilter = {}) => { assertFilter(f, 'logistics'); return wait(RP.logisticsReport(reportData(), f)); },
  inventory: (f: RP.ReportFilter = {}) => { assertFilter(f, 'inventory'); return wait(RP.inventoryReport(reportData(), f)); },
  planning: (f: RP.ReportFilter & { horizonDays?: number } = {}) => { assertFilter(f, 'planning'); return wait(RP.planningReport(reportData(), f)); },
  finance: (f: RP.ReportFilter = {}) => { assertFilter(f, 'finance'); return wait(RP.financeReport(reportData(), f)); },
  periodPlan: (f: RP.ReportFilter = {}) => { assertFilter(f, 'period-plan'); return wait(RP.periodPlan(reportData(), f)); },
  captureCheck: (f: RP.ReportFilter = {}) => { assertFilter(f, 'capture-check'); return wait(RP.captureCheck(reportData(), f)); },
  /** Directors: companies side by side + consolidated total (Σ companies − intercompany). Uses all allowed companies. */
  /** §8.14 PV-01..07: planned vs ordered for approved period plans (Group: + byEntity). */
  plannedVsActual: (f: RP.PvFilter = {}) => { assertFilter(f, 'planned-vs-actual'); return wait(RP.plannedVsActual(reportData(), f)); },
  group: (f: RP.ReportFilter = {}) => { assertGroup(); return wait(RP.groupReport({ ...reportData(), entityScope: current!.allowedEntityIds }, f)); },
};

// ---- Companies & settings ------------------------------------------------------------------------------
export const entities = {
  /** Company records the user may work in (legal/contact/brand fields). `ref().entities` has all three for lookups. */
  async list(): Promise<Entity[]> { return wait(seed.entities.filter((e) => (current?.allowedEntityIds ?? ALL_ENTITIES).includes(e.id))); },
  /** Active company id, or null for Group / all allowed companies. */
  active: (): ID | null => activeEntity,
  setActive: (id: ID | null) => configure({ entityId: id }),
};
export const settings = {
  async fx(): Promise<FxRate[]> { ensure(); return wait(m.db.fxRates ?? (m.db.fxRates = seed.seedFxRates())); },
  /** Directors approve exchange rates (units of currency per 1 USD) for a month. */
  async setFx(rate: FxRate) {
    ensure();
    if (!current?.roles.includes('director')) throw Object.assign(new Error('Only directors approve exchange rates'), { status: 403 });
    if (!/^\d{4}-\d{2}$/.test(rate.month) || !(rate.avg > 0) || !(rate.closing > 0) || rate.currency === 'USD') throw new Error('Give a month (YYYY-MM), a currency other than USD and rates above zero');
    m.db.fxRates ??= seed.seedFxRates();
    const i = m.db.fxRates.findIndex((x) => x.currency === rate.currency && x.month === rate.month);
    if (i >= 0) m.db.fxRates[i] = rate; else m.db.fxRates.push(rate);
    return commit(rate);
  },
  /** §8.14: planned-vs-actual flag thresholds (behind < behind × expected; over > over × planned). */
  async pvThresholds(): Promise<PvThresholds> { ensure(); return wait(m.db.pvThresholds ?? R.defaultPvThresholds); },
  async setPvThresholds(t: Partial<PvThresholds>): Promise<PvThresholds> {
    ensure();
    if (!current?.roles.includes('director')) throw Object.assign(new Error('Only directors change the planned-vs-actual thresholds'), { status: 403 });
    const next = { ...(m.db.pvThresholds ?? R.defaultPvThresholds), ...t };
    if (!(next.behind > 0 && next.behind <= 1) || !(next.over >= 1 && next.over <= 2)) throw Object.assign(new Error('Behind must be between 0 and 1, over between 1 and 2 (e.g. 0.85 and 1.05)'), { status: 422 });
    m.db.pvThresholds = next; return commit(next);
  },
};
