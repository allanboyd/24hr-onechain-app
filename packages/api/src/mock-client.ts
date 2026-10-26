// In-browser mock implementation of the client API (VITE_API=mock, the default).
// http.ts implements the same exports against the real API; index.ts picks one. Screens import only '@btw/api'.
import * as m from './mock/db';
import * as seed from './mock/seed';
import * as R from './rules';
import * as A from './access';
import * as RP from './reports';
import * as PO from './mock/po';
import type {
  AckLine, AppConfig, AuditFilter, AuditPage, Checkpoint, EntityInput, PriceListItem, Product, ProductInput, ReceivingCompany, ReceivingCompanyInput, Supplier, SupplierInput, UserPair, LoadingAlternative, PeriodPlanLine, PurchaseOrder, CheckpointPass, Device, DriverWork, Entity, FeatureKey, FxRate, GiverWork, ID, Leg, LegView, PeriodKind, PeriodPlan, Plan, PlanLine,
  PlanLineContext, PoDetail, PoInput, PoUpdateInput, PvThresholds, ReceiverWork, Role, RouteStop, Sale, Shipment, StoredFile, SyncResult, TripCost, TruckIssue, User, UserAdmin, Warehouse, WarehouseInput,
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
  demoUsers: () => allUsers().filter((u) => mockUsers.find((x) => x.id === u.id)?.active !== false),
  me: () => current,
  async login(userId: ID, _pin: string) {
    ensure(); current = allUsers().find((u) => u.id === userId) ?? null;
    if (current && mockUsers.find((x) => x.id === current!.id)?.active === false) { current = null; throw Object.assign(new Error('This account is deactivated — ask a director'), { status: 403 }); }
    if (current) { const admin = mockUsers.find((x) => x.id === current!.id); if (admin) current = { ...current, roles: admin.roles, entityIds: admin.entityIds, loadingPointIds: admin.loadingPointIds, warehouseIds: admin.warehouseIds, pairs: admin.pairs, routeIds: admin.routeIds, ...R.entityAccess(admin, ALL_ENTITIES), features: R.featuresFor(admin.roles) }; }
    if (current) { (m.db.lastLogin ??= {})[current.id] = new Date().toISOString(); m.save(); }
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
try { const raw = localStorage.getItem('btw-config'); if (raw) { const c = JSON.parse(raw); for (const k of ['approvals', 'loading', 'fees', 'costs'] as const) Object.assign(mockConfig[k]!, c[k] ?? {}); } } catch { /* ignore */ }

// ---- Reference / master data (MD-*) ---------------------------------------
export function ref() {
  ensure();
  return {
    config: mockConfig,
    entities: seed.entities, suppliers: seed.suppliers, products: seed.products, priceList: !current || A.seesPrices(current) ? seed.priceList : [],
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

// ---- Access (roles document §7 — same rules as the API: ./access.ts) ----------------------------------------------
const me = (): A.Subject => (current ? { ...current, driverId: current.roles.includes('driver') ? m.db.drivers.find((d) => d.phone === current!.phone)?.id ?? null : null } : { roles: [], loadingPointIds: [], warehouseIds: [] });
/** Receiving companies of the user's warehouses (receivers see orders delivering to them). */
const myRc = () => [...new Set(seed.warehouses.filter((w) => current?.warehouseIds.includes(w.id)).map((w) => w.receivingCompanyId))];
const myWhCps = () => seed.warehouses.filter((w) => current?.warehouseIds.includes(w.id)).map((w) => w.checkpointId);
const myLpCps = () => seed.suppliers.filter((x) => current?.loadingPointIds.includes(x.id)).map((x) => x.checkpointId);
const lpOfShipment = (sh: Shipment) => m.db.pos.find((p) => p.id === sh.poId)?.supplierId ?? null;
const seesSh = (sh: Shipment) => !!current && inScope(sh.entityId) && A.seesShipment(me(), sh, { loadingPointId: lpOfShipment(sh), myWarehouseCps: myWhCps() });
const forbid = (msg = 'Not available for your role') => Object.assign(new Error(msg), { status: 403 });
const planAccess = (p: Pick<Plan, 'entityId' | 'supplierId' | 'lines'>) => (current ? A.orderAccess(me(), p, myRc()) : null);
const planOut = (p: Plan) => A.orderFor(me(), p, myRc());
/** Audit row for a change made in the mock (same paths as the API). */
const log = (method: string, path: string, x: Parameters<typeof m.audit>[3] = {}) => m.audit(current?.id ?? null, method, path, { entityId: activeEntity, ...x });

// ---- Purchase orders (docs/09 §4): created, updated (= revision) or deleted — never drafted ---------------------------
/** The orders behind the POs (read-only here; reports and splits). Revision copies and deleted orders are not listed. */
const plans0 = {
  async list() { ensure(); if (!R.hasFeature(current!.roles, 'purchase-orders')) return wait([] as Plan[]); return wait(m.db.plans.filter((p) => !p.revisionOf && p.status !== 'Deleted' && inScope(p.entityId) && planAccess(p)).sort((a, b) => b.date.localeCompare(a.date)).map(planOut)); },
  async get(id: ID) { ensure(); feat('purchase-orders'); const p = m.db.plans.find((x) => x.id === id); return wait(p && inScope(p.entityId) && planAccess(p) ? planOut(p) : null); },
  /** A fresh line for the PO editor: the supplier's first product at its list price, on the supplier's first lane. */
  newLine(plan: Pick<Plan, 'supplierId'>, truckNo: number): PlanLine {
    const prod = seed.products.find((p) => p.supplierId === plan.supplierId) ?? seed.products[0];
    const cp = seed.suppliers.find((s) => s.id === plan.supplierId)?.checkpointId;
    const route = m.db.routes.find((r) => r.stops[0].checkpointId === cp) ?? m.db.routes[0];
    const wh = seed.warehouses.find((w) => w.checkpointId === route.stops.at(-1)?.checkpointId);
    return { id: m.uid('pl'), truckNo, productId: prod.id, qty: 0, price: lookup.price(prod.id), deliveredToId: wh?.receivingCompanyId ?? 'rc-asie', routeId: route.id };
  },
};
const poCtx = (): PO.PoCtx => ({ d: m.db, by: { id: current?.id ?? 'system', name: current?.name ?? 'System', roles: current?.roles ?? [] }, config: mockConfig, price: lookup.price });
/** Destination warehouse of an order line: the warehouse at the end of its route (docs/07 §D). */
const destOf = (l: PlanLine) => { const cp = m.db.routes.find((r) => r.id === l.routeId)?.stops.at(-1)?.checkpointId; return seed.warehouses.find((w) => w.checkpointId === cp)?.id; };
const roleError = () => Object.assign(new Error('Not available for your role'), { status: 403 });
const feat = (f: FeatureKey) => { if (!current || !R.hasFeature(current.roles, f)) throw roleError(); };
const pp = () => (m.db.periodPlans ??= []);
const ppPrefix = (entityId: ID) => (seed.entities.find((e) => e.id === entityId)?.poPrefix ?? 'XX-PO').replace(/-PO$/, '-PP');
/** Purchase orders are raised and edited by planners (and directors); directors approve (docs/07 §E). */
const canEditPO = () => { if (!current?.roles.some((r) => R.PO_EDITORS.includes(r))) throw Object.assign(new Error('Only planners raise purchase orders'), { status: 403 }); };
const canEditPP = () => { if (!current?.roles.some((r) => R.PERIOD_PLAN_EDITORS.includes(r))) throw Object.assign(new Error('Only planners, directors and admins edit period plans'), { status: 403 }); };
/** A planner changes only the orders of their buyer–supplier pairs (Kabonge: not Nihna–GBI). */
const canEditPlan = (p: Pick<Plan, 'entityId' | 'supplierId' | 'lines'> | undefined) => { if (!p || planAccess(p) !== 'edit') throw forbid('This order is not one of your buyer–supplier pairs'); };
/** Period-plan lines this user may see and change (pair-scoped planners: their pairs only). */
const ppLineMine = (entityId: ID) => (l: PeriodPlanLine) => A.periodLineVisible(me(), entityId, l.supplierId);
const ppOut = (p: PeriodPlan): PeriodPlan => ({ ...p, lines: p.lines.filter(ppLineMine(p.entityId)) });
/** Lines a pair-scoped planner sends must be theirs; lines they cannot see are kept as they were. */
function ppMerge(entityId: ID, incoming: PeriodPlanLine[], current0: PeriodPlanLine[] = []): PeriodPlanLine[] {
  const mine = ppLineMine(entityId);
  const bad = incoming.find((l) => !mine(l));
  if (bad) throw forbid(`${seed.suppliers.find((x) => x.id === bad.supplierId)?.code ?? bad.supplierId} lines are not one of your buyer–supplier pairs`);
  return [...current0.filter((l) => !mine(l)), ...incoming];
}
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
  async list(opts: { all?: boolean } = {}): Promise<PeriodPlan[]> { ensure(); feat('period-plans'); return wait(pp().filter((p) => inScope(p.entityId) && (opts.all || p.status === 'Active')).sort((a, b) => b.from.localeCompare(a.from)).map(ppOut)); },
  async get(id: ID): Promise<PeriodPlan | null> { ensure(); feat('period-plans'); const p = pp().find((x) => x.id === id); return wait(p && inScope(p.entityId) ? ppOut(p) : null); },
  /** A new plan is Active at once (suggestions — no approval). `replace: true` overwrites overlapping plans. */
  async create(input: { entityId?: ID; periodKind: PeriodKind; from: string; to: string; title: string; lines?: PeriodPlanLine[]; replace?: boolean }): Promise<PeriodPlan> {
    ensure(); feat('period-plans'); canEditPP();
    const entityId = writeEntity(input.entityId);
    if (!DATE.test(input.from) || !DATE.test(input.to) || input.from > input.to) throw Object.assign(new Error('Give a period with a start and an end date'), { status: 422 });
    const plan: PeriodPlan = { id: m.uid('pp'), ref: R.nextRef(pp().map((x) => x.ref), ppPrefix(entityId), Number(input.from.slice(0, 4))), entityId, title: input.title ?? '',
      periodKind: input.periodKind ?? 'custom', from: input.from, to: input.to, status: 'Active', version: 1, lines: ppLines(ppMerge(entityId, input.lines ?? [])), history: [{ at: new Date().toISOString(), byUserId: current!.id, action: 'created' }], createdById: current!.id };
    const replaced = claimPeriod(plan, input.replace);
    if (replaced.length) plan.history[0].comment = `replaces ${replaced.map((x) => x.ref).join(', ')}`;
    pp().push(plan); log('POST', '/period-plans', { recordType: 'period-plan', recordId: plan.id, entityId, summary: `${plan.ref} created` }); return commit(ppOut(plan));
  },
  /** Save an Active plan (each save = next version). New dates overlapping another Active plan → 409 unless `replace`. */
  async save(plan: PeriodPlan, opts: { replace?: boolean } = {}): Promise<PeriodPlan> {
    ensure(); feat('period-plans'); canEditPP();
    const i = pp().findIndex((x) => x.id === plan.id); const cur = pp()[i];
    if (!cur || !inScope(cur.entityId)) throw notAllowed();
    if (plan.entityId !== cur.entityId) throw new Error('A plan cannot move to another company');
    if (cur.status === 'Replaced') throw Object.assign(new Error('This plan was replaced by a newer one and is kept for history'), { status: 409 });
    if (!DATE.test(plan.from) || !DATE.test(plan.to) || plan.from > plan.to) throw Object.assign(new Error('Give a period with a start and an end date'), { status: 422 });
    const next: PeriodPlan = { ...cur, title: plan.title, periodKind: plan.periodKind, from: plan.from, to: plan.to, lines: ppLines(ppMerge(cur.entityId, plan.lines, cur.lines)), version: cur.version + 1, history: [...cur.history] };
    const replaced = next.from !== cur.from || next.to !== cur.to ? claimPeriod(next, opts.replace) : [];
    next.history.push({ at: new Date().toISOString(), byUserId: current!.id, action: 'edited', ...(replaced.length ? { comment: `replaces ${replaced.map((x) => x.ref).join(', ')}` } : {}) });
    pp()[i] = next;
    log('PUT', `/period-plans/${cur.id}`, { recordType: 'period-plan', recordId: cur.id, entityId: cur.entityId, summary: `${cur.ref} v${next.version}` });
    return commit(ppOut(next));
  },
  async copy(fromId: ID, to: { from: string; to: string; title?: string; replace?: boolean }): Promise<PeriodPlan> {
    ensure(); feat('period-plans'); canEditPP();
    const src = pp().find((x) => x.id === fromId); if (!src || !inScope(src.entityId)) throw notAllowed();
    writeEntity(src.entityId);
    if (!DATE.test(to.from) || !DATE.test(to.to) || to.from > to.to) throw Object.assign(new Error('Give a period with a start and an end date'), { status: 422 });
    const plan = R.copyPeriodPlan(src, to, { id: m.uid('pp'), ref: R.nextRef(pp().map((x) => x.ref), ppPrefix(src.entityId), Number(to.from.slice(0, 4))), lineId: () => m.uid('ppl') }, current!.id);
    if (!A.isDirector(me())) plan.lines = plan.lines.filter(ppLineMine(plan.entityId));
    claimPeriod(plan, to.replace);
    pp().push(plan); return commit(ppOut(plan));
  },
  /** Active plans of the same company whose period overlaps (preview of the 409 a save would get). */
  async overlaps(plan: Pick<PeriodPlan, 'id' | 'entityId' | 'from' | 'to'>): Promise<PeriodPlan[]> { ensure(); return wait(R.overlapsOf(plan, pp().filter((x) => inScope(x.entityId)))); },
  async versions(_id: ID) { return wait([] as { version: number; snapshot: PeriodPlan; reason: string | null; at: string }[]); },
};

const pos0 = {
  /** Effective POs (latest revision) with their stage; `{ all: true }` also lists deleted ones. */
  async list(opts: { all?: boolean } = {}) {
    ensure(); if (!current || !R.hasFeature(current.roles, 'purchase-orders')) return wait([] as PurchaseOrder[]);
    autoApprove();
    const money = A.seesPrices(me());
    const out = m.db.pos.filter((p) => !p.supersededById && (opts.all || p.status !== 'Deleted') && inScope(p.entityId) && planAccess(poPlan(p))).map((p) => {
      const lines = planOut(poPlan(p) as Plan).lines ?? [];
      const x: PurchaseOrder = { ...p, stage: R.poStage(p, PO.loadingsOf(m.db, [p.id]), PO.shipmentsOf(m.db, [p.id])), baseRef: p.revisionOf ? m.db.pos.find((b) => b.id === p.revisionOf)?.ref ?? p.ref : p.ref,
        cases: lines.reduce((a, l) => a + l.qty, 0), trucks: new Set(lines.map((l) => l.truckNo)).size, ...(money ? { amount: Math.round(lines.reduce((a, l) => a + l.qty * (l.price ?? 0), 0) * 100) / 100 } : { pricesHidden: true }) };
      if (!money) delete x.signature;
      return x;
    });
    return wait(out.sort((a, b) => b.approvedAt.localeCompare(a.approvedAt)));
  },
  /** The PO (as asked), its order lines, the whole chain, every version snapshot, what was loaded and what this user may do. */
  async get(id: ID): Promise<PoDetail | null> {
    ensure(); autoApprove();
    const c = PO.chainOf(m.db, id);
    if (!c || !inScope(c.asked.entityId) || !current || !R.hasFeature(current.roles, 'purchase-orders') || !planAccess(c.plan)) return wait(null);
    const ids = c.chain.map((x) => x.id);
    const lds = PO.loadingsOf(m.db, ids), shs = PO.shipmentsOf(m.db, ids);
    const money = A.seesPrices(me());
    const vs = PO.versionsOf(m.db).filter((v) => v.basePoId === ids[0]).sort((a, b) => a.revision - b.revision)
      .map((v) => (money ? v : { ...A.withoutPrices(v), lineChanges: v.lineChanges.map((x) => ({ ...x, before: x.before && { ...x.before, price: undefined }, after: x.after && { ...x.after, price: undefined } })) }))
      .map((v) => ({ ...v, lines: A.orderFor(me(), { entityId: c.effective.entityId, supplierId: c.effective.supplierId, lines: v.lines }, myRc()).lines }));
    const editor = planAccess(c.plan) === 'edit' && current.roles.some((r) => R.PO_EDITORS.includes(r));
    const { loaded, loadedTrucks } = PO.loadedOf(lds);
    const trucks = Math.max(new Set(c.plan.lines.map((l) => l.truckNo)).size, lds.length);
    const delBlock = R.poDeleteBlock(c.effective, lds, shs);
    const updBlock = c.effective.status === 'Deleted' ? 'A deleted purchase order cannot be updated' : trucks > 0 && loadedTrucks.length >= trucks ? 'Every truck of this purchase order is loaded — it can no longer be updated' : null;
    const strip = (x: PurchaseOrder): PurchaseOrder => (money ? x : (({ signature: _s, ...rest }) => ({ ...rest, pricesHidden: true }))(x));
    return wait({
      po: { ...strip(c.asked), stage: R.poStage(c.effective, lds, shs) }, plan: planOut(m.db.plans.find((p) => p.id === c.asked.planId)!), revisions: c.chain.length > 1 ? c.chain.map(strip) : [], versions: vs, effectiveId: c.effective.id, loaded,
      actions: { update: editor && !updBlock, delete: editor && !delBlock, approve: current.roles.includes('director') && mockConfig.approvals.purchaseOrders && c.effective.status === 'Awaiting approval', ...(delBlock ? { deleteBlocked: delBlock } : {}), ...(updBlock ? { updateBlocked: updBlock } : {}) },
    });
  },
  /** "Create purchase order": issued at once (approved automatically), or awaiting a director when approvals are on. */
  async create(input: PoInput): Promise<PurchaseOrder> {
    ensure(); canEditPO(); feat('purchase-orders');
    const entityId = writeEntity(input.entityId);
    if (!A.seesPair(me(), entityId, input.supplierId) && !A.isDirector(me())) throw forbid(`${seed.entities.find((e) => e.id === entityId)?.shortName}–${seed.suppliers.find((x) => x.id === input.supplierId)?.code} is not one of your buyer–supplier pairs`);
    const po = PO.createPo(poCtx(), entityId, input);
    log('POST', '/pos', { recordType: 'po', recordId: po.id, entityId, summary: `${po.ref} created${po.status === 'Awaiting approval' ? ' · awaiting approval' : ` · ${R.approvalText(po, current?.name ?? '')}`}` });
    return commit({ ...po, stage: R.poStage(po, [], []) });
  },
  /** Update = the next revision `<ref>-rev00N` (reason required); the original and every revision are kept. */
  async update(id: ID, input: PoUpdateInput): Promise<PurchaseOrder> {
    ensure(); canEditPO();
    const c = PO.chainOf(m.db, id); if (!c) throw httpErr('Purchase order not found', 404);
    assertScope(c.effective.entityId); canEditPlan(c.plan);
    const next = PO.updatePo(poCtx(), id, input);
    log('PUT', `/pos/${id}`, { recordType: 'po', recordId: next.id, entityId: next.entityId, summary: `${c.effective.ref} updated → ${next.ref}: ${input.reason.trim()}` });
    return commit(next);
  },
  /** Soft delete with a reason — only while nothing has been loaded. */
  async remove(id: ID, reason: string): Promise<PurchaseOrder> {
    ensure(); canEditPO();
    const c = PO.chainOf(m.db, id); if (!c) throw httpErr('Purchase order not found', 404);
    assertScope(c.effective.entityId); canEditPlan(c.plan);
    const po = PO.deletePo(poCtx(), id, reason);
    log('POST', `/pos/${id}/delete`, { recordType: 'po', recordId: po.id, entityId: po.entityId, summary: `${po.ref} deleted: ${reason.trim()}` });
    return commit({ ...po, stage: 'Deleted' as const });
  },
  /** Approvals on: approve (signature) or reject (comment → deleted) a PO awaiting approval. */
  async decide(id: ID, action: 'approved' | 'rejected', comment?: string, signature?: string): Promise<PurchaseOrder> {
    ensure(); feat('purchase-orders.approve');
    if (!mockConfig.approvals.purchaseOrders) throw httpErr('Director approval of purchase orders is switched off (config.toml) — POs are approved automatically on create', 409);
    const c = PO.chainOf(m.db, id); if (!c) throw httpErr('Purchase order not found', 404);
    assertScope(c.effective.entityId);
    if (c.effective.status !== 'Awaiting approval') throw httpErr('Only purchase orders awaiting approval can be decided', 409);
    if (action === 'approved' && !signature) throw httpErr('Signature required to approve', 422);
    if (action === 'rejected' && !comment?.trim()) throw httpErr('Add a comment for the planner', 422);
    const po = action === 'approved' ? PO.approvePo(poCtx(), c.effective, 'director', signature, comment) : PO.deletePo(poCtx(), id, `Rejected by ${current?.name}: ${comment!.trim()}`, true);
    log('POST', `/pos/${id}/decision`, { recordType: 'po', recordId: po.id, entityId: po.entityId, summary: `${po.ref} ${action}` });
    return commit(po);
  },
  async markSent(id: ID) {
    ensure(); const po = m.db.pos.find((p) => p.id === id)!; assertScope(po?.entityId); canEditPlan(poPlan(po));
    if (po.status === 'Deleted') throw httpErr('A deleted purchase order is not sent', 409);
    if (po.status === 'Awaiting approval') throw httpErr('Approve the purchase order before sending it', 409);
    po.sentAt = new Date().toISOString(); log('POST', `/pos/${id}/sent`, { recordType: 'po', recordId: id, entityId: po.entityId }); return commit(po);
  },
  newLine: (supplierId: ID, truckNo: number) => plans0.newLine({ supplierId }, truckNo),
};
/** Approvals switched off (demo.setConfig): POs still awaiting approval are approved automatically, as the API does at start-up. */
function autoApprove() {
  if (mockConfig.approvals.purchaseOrders) return;
  const waiting = m.db.pos.filter((p) => p.status === 'Awaiting approval' && !p.supersededById);
  if (!waiting.length) return;
  for (const p of waiting) PO.approvePo({ ...poCtx(), by: { id: 'system', name: 'System', roles: [] } }, p, 'issued');
  m.save();
}
const poPlan = (po: PurchaseOrder) => m.db.plans.find((p) => p.id === po.planId) ?? { entityId: po.entityId, supplierId: po.supplierId, lines: [] };
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
/** Queues and loadings this user may see: their loading points, and a planner's pairs (Kabonge: not Nihna–GBI). */
const seesLp = (lp: ID, entityId?: ID) => !!current && R.seesLoadingPoint(current, lp) && (!entityId || !current.roles.includes('planner') || A.seesPair(me(), entityId, lp));
const assertLp = (lp: ID) => { if (!seesLp(lp)) throw httpErr('Not your loading point', 403); };
const canQueue = (lp: ID) => { assertLp(lp); if (!A.canEditQueue(me(), lp)) throw httpErr('Only the truck follow-up officer, the planner of that loading point and its loaders change the waiting list', 403); };
const loadingOut = <T extends import('./types').Loading>(l: T): T => (A.seesPrices(me()) ? l : (A.loadingWithoutPrice(l) as T));
const queueAt = (lp: ID) => m.db.waiting.filter((w) => w.loadingPointId === lp && w.status === 'Waiting').sort((a, b) => a.position - b.position);
export const loading = {
  async waiting(loadingPointId?: ID) { ensure(); if (!current || !R.hasFeature(current.roles, 'loading')) return wait([]); return wait(m.db.waiting.filter((w) => inScope(w.entityId) && seesLp(w.loadingPointId, w.entityId) && (!loadingPointId || w.loadingPointId === loadingPointId)).sort((a, b) => a.position - b.position)); },
  async addWaiting(loadingPointId: ID, truckId: ID, driverId: ID, entityId?: ID) {
    ensure(); canQueue(loadingPointId); const company = waitingEntity(loadingPointId, entityId);
    if (!seed.suppliers.some((x) => x.id === loadingPointId)) throw httpErr('Loading point not found', 404);
    const truck = m.db.trucks.find((x) => x.id === truckId); if (!truck) throw httpErr('Truck not found', 404);
    if (!m.db.drivers.some((x) => x.id === driverId)) throw httpErr('Driver not found', 404);
    if (truck.active === false || m.db.providers.find((p) => p.id === truck.providerId)?.active === false) throw httpErr(`${truck.reg} is deactivated — reactivate it in master data first`, 409);
    if (m.db.waiting.some((w) => w.truckId === truckId && w.status === 'Waiting')) throw httpErr(`${truck.reg} is already in a waiting list`, 409);
    const pos = queueAt(loadingPointId).length + 1;
    const e = { id: m.uid('wl'), entityId: company, loadingPointId, truckId, driverId, arrivedAt: new Date().toISOString(), position: pos, status: 'Waiting' as const };
    m.db.waiting.push(e); log('POST', `/loading-points/${loadingPointId}/waiting`, { recordType: 'waiting', recordId: e.id, entityId: company }); return commit(e);
  },
  async list(loadingPointId?: ID) { ensure(); if (!current || !R.hasFeature(current.roles, 'loading')) return wait([]); return wait(m.db.loadings.filter((l) => inScope(l.entityId) && seesLp(l.loadingPointId, l.entityId) && (!loadingPointId || l.loadingPointId === loadingPointId)).map(withNextRevision).map((l) => loadingOut({ ...l, poRef: lookup.poRef(l.poId) }))); },
  /** Loading against the PO: per-line quantities and (config loading.allowAlternatives) substitutes from the supplier's
   *  price list; the total must stay within ±allowancePct of the order and the truck's capacity. Any difference writes
   *  a PO revision (…-rev001, -rev002 …) that every truck of the order then follows. */
  /** docs/12 A-04: no price at hand-over — the agreed transport price is recorded afterwards (finance.setAgreedPrice).
   *  `agreedTransport` is accepted only from someone with truck expenses (Testfie loading at GBI); from a loader it is ignored. */
  async confirm(id: ID, input: { truckId: ID; driverId: ID; loadedQty: Record<ID, number>; agreedTransport?: number | null; transportCurrency?: string; documents: string[]; alternatives?: LoadingAlternative[]; confirmUnusual?: boolean }) {
    ensure(); const ld = m.db.loadings.find((l) => l.id === id)!; assertScope(ld?.entityId);
    if (!A.canRecordLoading(me(), ld.loadingPointId)) throw forbid('Only the loaders of this loading point record its loadings');
    if (ld.status === 'Loaded') throw Object.assign(new Error('This truck is already loaded'), { status: 409 });
    const truck = m.db.trucks.find((t) => t.id === input.truckId)!;
    const price = R.hasFeature(current!.roles, 'truck-expenses') && Number(input.agreedTransport) > 0 ? Number(input.agreedTransport) : null;
    // docs/17 F4: a price always comes with its currency and must be plausible for it
    const priceNote = price === null ? '' : (await import('./mock/sanity')).mockSane('transport', price, input.transportCurrency, Date.now(), input.confirmUnusual).note;
    if (price !== null) ld.transportCurrency = input.transportCurrency as typeof ld.transportCurrency;
    const po = m.db.pos.find((p) => p.id === ld.poId)!;
    const alternatives = (input.alternatives ?? []).slice(0, 20);
    const check = R.loadingCheck(ld.lines, input.loadedQty, alternatives, truck.capacityCases, mockConfig.loading, { supplierId: po.supplierId, products: seed.products });
    if (check.error) throw Object.assign(new Error(check.error), { status: 422 });
    for (const l of ld.lines) { const v = input.loadedQty?.[l.planLineId]; l.loadedQty = v === undefined || v === null || !Number.isFinite(Number(v)) ? l.orderedQty : Math.max(0, Math.round(Number(v))); }
    if (po.status === 'Deleted' || po.status === 'Awaiting approval') throw httpErr(po.status === 'Deleted' ? 'This purchase order was deleted — nothing to load' : 'This purchase order is awaiting approval — load it once a director has approved it', 409);
    if (check.deviates) PO.reviseAtLoading(poCtx(), ld, { loadedQty: input.loadedQty, alternatives }, check, truck.reg); // same counter as office updates
    ld.documents = input.documents.map((n) => ({ id: m.uid('doc'), kind: 'delivery-note', name: n }));
    const sh = m.completeLoading(ld, input.truckId, input.driverId, price);
    m.notify('Truck loaded', `${truck.reg} · ${check.loaded} cases · ${sh.ref}${price === null ? ' · agreed price not recorded yet' : ''}`, `#/shipments/${sh.id}`, ['operations', 'fleet', 'director', 'truck_planner'], sh.entityId);
    log('POST', `/loadings/${id}/confirm`, { recordType: 'loading', recordId: id, entityId: ld.entityId, summary: `${truck.reg} loaded · ${sh.ref}${price === null ? '' : ` · agreed ${ld.transportCurrency} ${price}${priceNote}`}` });
    return commit(sh);
  },
};

// ---- Shipments, legs, tracking (DS-*, TR-*) --------------------------------
const shipments0 = {
  async list() { ensure(); m.db.shipments.forEach((s) => (s.status = m.deriveShipmentStatus(s))); return wait(m.db.shipments.filter(seesSh).reverse()); },
  async get(id: ID) { ensure(); const sh = m.db.shipments.find((s) => s.id === id); if (sh) sh.status = m.deriveShipmentStatus(sh); return wait(sh && seesSh(sh) ? sh : null); },
  eta: (leg: Parameters<typeof m.etaOf>[0]) => { ensure(); return m.etaOf(leg); },
  async forDriver(driverId: ID) { ensure(); return wait(m.db.shipments.flatMap((s) => s.legs.filter((l) => l.driverId === driverId && l.status !== 'Acknowledged').map((leg) => ({ shipment: s, leg })))); },
  async incoming(warehouseIds: ID[]) {
    ensure();
    const cps = warehouseIds.map((w) => lookup.warehouse(w)!.checkpointId);
    return wait(m.db.shipments.flatMap((s) => s.legs.filter((l) => cps.includes(l.toId) && l.status !== 'Acknowledged').map((leg) => ({ shipment: s, leg }))));
  },
  async pass(legId: ID, checkpointId: ID, kind: 'arrived' | 'departed', source: CheckpointPass['source'] = 'driver') {
    ensure(); const { sh, leg } = tripLeg(legId);
    const dispatching = kind === 'departed' && leg.passes[0]?.checkpointId === checkpointId && ['Planned', 'Loaded'].includes(leg.status);
    if (!(dispatching ? A.canDispatch(me(), leg, { myLoadingCps: myLpCps(), myWarehouseCps: myWhCps() }) : A.canUpdateTrip(me(), leg))) throw forbid('Your role can view this trip but not change it');
    m.recordPass(legId, checkpointId, kind, source); log('POST', `/legs/${legId}/passes`, { recordType: 'leg', recordId: legId, entityId: sh.entityId, summary: `${kind} ${lookup.checkpoint(checkpointId)?.name ?? ''}` }); return commit(m.findLeg(legId).leg);
  },
  async issue(legId: ID, issue: Omit<TruckIssue, 'id'>) { ensure(); const { sh, leg } = tripLeg(legId); if (!A.canUpdateTrip(me(), leg)) throw forbid('Your role can view this trip but not change it'); m.addIssue(legId, issue); log('POST', `/legs/${legId}/issues`, { recordType: 'issue', recordId: legId, entityId: sh.entityId, summary: issue.reason }); return commit(m.findLeg(legId).leg); },
  async fixIssue(legId: ID, issueId: ID) { ensure(); const { leg } = tripLeg(legId); if (!A.canUpdateTrip(me(), leg)) throw forbid('Your role can view this trip but not change it'); const i = leg.issues.find((x) => x.id === issueId)!; i.fixedAt = new Date().toISOString(); return commit(leg); },
  async acknowledge(legId: ID, input: { receiverName: string; lines: AckLine[]; signature?: string; photos?: string[] }) {
    ensure(); const { sh, leg } = tripLeg(legId);
    if (!A.canAcknowledge(me(), leg, myWhCps())) throw forbid('This truck is not coming to your warehouse');
    if (input.lines?.some((l) => l.reason)) (await money()).checkAckReasons({ httpErr }, input.lines);
    const ack = m.acknowledge(legId, { ...input, photos: (input.photos ?? []).map((n) => ({ id: m.uid('doc'), kind: 'photo' as const, name: n })) });
    log('POST', `/legs/${legId}/acknowledgement`, { recordType: 'ack', recordId: ack.id, entityId: sh.entityId, summary: `${sh.ref} received` });
    return commit(ack);
  },
  /** Doc 08 §2: onward move from the warehouse where the shipment was received = a NEW shipment (returned). */
  async sendOn(fromShipmentId: ID, input: { routeId: ID; truckId: ID; driverId: ID; lines?: Leg['lines'] }) {
    ensure(); const from = m.db.shipments.find((s) => s.id === fromShipmentId && seesSh(s));
    if (!from) throw new Error('Shipment not found');
    const fromWh = seed.warehouses.find((w) => w.checkpointId === from.legs.at(-1)?.toId);
    if (!A.canSendOn(me(), fromWh?.id ?? '')) throw forbid('Only the truck follow-up officer (or the re-export planner of that warehouse) sends goods on');
    const out = m.sendOn(from.id, input, Date.now() + 2 * 36e5);
    log('POST', `/shipments/${fromShipmentId}/send-on`, { recordType: 'shipment', recordId: out.id, entityId: out.entityId, summary: `${out.ref} from ${fromWh?.name ?? ''}` });
    return commit(out);
  },
  /** @deprecated use sendOn — kept for older screens: sends the goods on and returns the new shipment's first leg. */
  async addLeg(shipmentId: ID, routeId: ID, truckId: ID, driverId: ID) { const sh = await shipments.sendOn(shipmentId, { routeId, truckId, driverId }); return sh.legs[0]; },
  /** The whole journey containing a shipment, origin first, each with loaded / received / damaged cases. */
  async journey(id: ID) { ensure(); return wait(R.journeyOf(m.db.shipments.filter(seesSh), m.db.acks, id)); },
  async ack(id: ID) { ensure(); const a = m.db.acks.find((x) => x.id === id); const sh = a && m.db.shipments.find((x) => x.id === a.shipmentId); return wait(a && sh && seesSh(sh) && seesAcks() ? a : null); },
};

/** §7: acknowledgement records for directors, the planner and receivers (not truck follow-up, loaders, drivers). */
const seesAcks = () => !!current && (A.isDirector(current) || current.roles.some((r) => ['planner', 'receiver', 'fleet', 'operations', 'accounts', 'sales'].includes(r)));
/** A leg the user may see (404/403 like the API). */
function tripLeg(legId: ID) { const x = m.findLeg(legId); if (!seesSh(x.sh)) throw forbid('Not your trip'); return x; }
// ---- Inventory & sales (IN-*, SL-*) ---------------------------------------
/** Stock of a warehouse (same rule as the API, access.seesWarehouseStock): directors; receivers their own warehouses. */
const seesWh = (wh: ID) => !current || A.seesWarehouseStock(me(), wh);
const stockOut = (r: import('./types').StockRow) => (A.seesPrices(me()) ? r : { ...r, landedCostPerCase: undefined as unknown as number });
export const inventory = {
  async stock() { ensure(); return wait(m.stock().filter((r) => inScope(r.entityId) && seesWh(r.warehouseId)).map(stockOut)); },
  async ledger(warehouseId: ID, productId: ID) { ensure(); if (!seesWh(warehouseId)) throw httpErr('Not available for your role', 403); return wait(m.db.stockMoves.filter((x) => inScope(x.entityId) && x.warehouseId === warehouseId && x.productId === productId).slice(-50).reverse()); },
};
export const sales = {
  async list(warehouseId?: ID) { ensure(); if (!current || !R.hasFeature(current.roles, 'sales')) return wait([] as Sale[]); return wait(m.db.sales.filter((s) => inScope(s.entityId) && seesWh(s.warehouseId) && (!warehouseId || s.warehouseId === warehouseId)).slice(-200).reverse()); },
  async create(input: Omit<Sale, 'id' | 'ref' | 'status' | 'entityId'> & { entityId?: ID }, override = false) {
    ensure(); if (!A.canSell(me(), input.warehouseId)) throw forbid('Sales are recorded by the directors');
    const entityId = writeEntity(input.entityId);
    if (input.counterpartyEntityId && (input.counterpartyEntityId === entityId || !ALL_ENTITIES.includes(input.counterpartyEntityId))) throw new Error('An intercompany sale must name a different sibling company');
    const st = m.stock();
    for (const l of input.lines) {
      // a sale draws only its own company's stock, even in a shared warehouse
      const avail = st.find((r) => r.entityId === entityId && r.warehouseId === input.warehouseId && r.productId === l.productId)?.closing ?? 0;
      if (l.qty > avail && !override) throw new Error(`Only ${avail} cases of ${lookup.product(l.productId)?.brand} in stock`);
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
const tripsAllowed = () => !!current && (R.hasFeature(current.roles, 'finance') || R.hasFeature(current.roles, 'truck-expenses'));
export const finance = {
  /** Trip costs, payments and transport owed. Truck expenses (Testfie) see the transport side, not goods value / landed cost.
   *  `agreedRecorded: false` = the agreed transport price is not recorded yet (counted, never shown as zero). */
  async trips() {
    ensure(); if (!tripsAllowed()) throw roleError();
    const full = R.hasFeature(current!.roles, 'finance');
    return wait(m.db.shipments.filter((s) => inScope(s.entityId) && seesSh(s)).map((s) => {
      const costs = m.db.costs.filter((c) => c.shipmentId === s.id).map((c) => ({ ...c, amountUsd: c.amountUsd ?? c.amount }));
      const pays = m.db.payments.filter((p) => p.shipmentId === s.id);
      const transport = costs.filter((c) => c.kind === 'Transport').reduce((a, c) => a + c.amountUsd, 0);
      const paid = pays.filter((p) => p.status !== 'Pending approval').reduce((a, p) => a + (p.amountUsd ?? p.amount), 0);
      const plan = m.db.plans.find((p) => p.poId === s.poId);
      const goods = s.legs[0].lines.reduce((a, l) => a + l.loadedQty * (plan?.lines.find((pl) => pl.productId === l.productId)?.price ?? 0), 0);
      const cases = s.legs[0].lines.reduce((a, l) => a + l.loadedQty, 0);
      const expenses = costs.reduce((a, c) => a + c.amountUsd, 0);
      const agreedRecorded = costs.some((c) => c.kind === 'Transport');
      const row = { shipment: s, costs, payments: pays, transport, paid, balance: transport - paid, goods, expenses, landing: goods + expenses, cases, perCase: cases ? (goods + expenses) / cases : 0, agreedRecorded };
      return full ? row : { ...row, goods: undefined as unknown as number, landing: undefined as unknown as number, perCase: undefined as unknown as number };
    }));
  },
  /** docs/12 A-04: the agreed transport price of a loaded truck, recorded after loading (Testfie, directors). Creates the
   *  Transport cost line of the trip, or corrects it while nothing has been paid against it. */
  async setAgreedPrice(shipmentId: ID, input: { amount: number; currency?: import('./types').Currency; docRef?: string; confirmUnusual?: boolean }) { ensure(); feat('truck-expenses'); const sh = m.db.shipments.find((x) => x.id === shipmentId); if (!sh || !seesSh(sh)) throw httpErr('Shipment not found', 404); return (await admin()).setAgreedPrice(adminCtx(), sh, input); },
  async addCost(input: Omit<TripCost, 'id' | 'entityId'> & { entityId?: ID; confirmUnusual?: boolean }) {
    ensure(); feat('truck-expenses'); const { confirmUnusual, ...c } = input; if (!(c.amount > 0)) throw httpErr('Amount must be above zero', 422);
    const sh = m.db.shipments.find((x) => x.id === c.shipmentId); assertScope(sh?.entityId);
    if (c.entityId && c.entityId !== sh!.entityId) throw notAllowed();
    const { check, note } = (await import('./mock/sanity')).mockSane(c.kind === 'Transport' ? 'transport' : 'trip-expense', c.amount, c.currency, Date.now(), confirmUnusual);
    const currency = check.currency as TripCost['currency']; const rate = R.fxFor(m.db.fxRates ?? seed.seedFxRates(), currency, Date.now());
    const x: TripCost = { ...c, currency, entityId: sh!.entityId, id: m.uid('cost'), fxRate: rate, amountUsd: Math.round((c.amount / rate) * 100) / 100 };
    m.db.costs.push(x); log('POST', '/finance/costs', { recordType: 'cost', recordId: x.id, entityId: x.entityId, summary: `${x.kind} ${x.currency} ${x.amount}${note}`, after: { kind: x.kind, amount: x.amount, currency: x.currency } }); return commit(x);
  },
  async pay(shipmentId: ID, costId: ID, amount: number, reference: string, threshold = 500, opts: { confirmUnusual?: boolean } = {}) {
    ensure(); if (!current || !A.canRecordPayment(me())) throw httpErr('Only the directors record payments', 403);
    const sh = m.db.shipments.find((x) => x.id === shipmentId); assertScope(sh?.entityId);
    const cost = m.db.costs.find((c) => c.id === costId);
    if (!cost || cost.shipmentId !== shipmentId || cost.entityId !== sh!.entityId) throw new Error('Pick a cost line of this trip');
    const { note } = (await import('./mock/sanity')).mockSane('payment', amount, cost.currency, Date.now(), opts.confirmUnusual);
    const rate = cost.fxRate ?? 1; const amountUsd = Math.round((amount / rate) * 100) / 100;
    const status = amountUsd > threshold ? 'Pending approval' as const : 'Paid' as const;
    const p = { id: m.uid('pay'), entityId: sh!.entityId, shipmentId, costId, amount, at: new Date().toISOString(), reference, status, fxRate: rate, amountUsd };
    m.db.payments.push(p); log('POST', '/finance/payments', { recordType: 'payment', recordId: p.id, entityId: p.entityId, summary: `${reference} · ${cost.currency} ${amount}${note}` });
    if (status === 'Pending approval') m.notify('Payment needs approval', `USD ${amountUsd} · ${reference}`, '#/finance', ['director'], sh!.entityId);
    return commit(p);
  },
  /** docs/14 B-04: each trip's transport fee — paid / part paid / unpaid against references, with its age (Testfie, directors). */
  fees: mo('fees'),
  async approve(paymentId: ID) { ensure(); if (!current?.roles.includes('director')) throw httpErr('Only directors approve payments above the threshold', 403); const p = m.db.payments.find((x) => x.id === paymentId)!; assertScope(p?.entityId); p.status = 'Paid'; p.approvedById = current?.id; log('POST', `/finance/payments/${paymentId}/approve`, { recordType: 'payment', recordId: paymentId, entityId: p.entityId }); return commit(p); },
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
    const money = A.seesPrices(me()), seesSales = !!current && R.hasFeature(current.roles, 'sales');
    const scopedSales = seesSales ? m.db.sales.filter((s) => inScope(s.entityId) && seesWh(s.warehouseId)) : [];
    const sales30 = scopedSales.filter((s) => Date.parse(s.at) >= since).reduce((a, s) => a + s.lines.reduce((b, l) => b + l.qty * l.price, 0), 0);
    const daily = Array.from({ length: 30 }, (_, i) => {
      const day = new Date(Date.now() - (29 - i) * 864e5).toISOString().slice(0, 10);
      return { day, cases: scopedSales.filter((s) => s.at.slice(0, 10) === day).reduce((a, s) => a + s.lines.reduce((b, l) => b + l.qty, 0), 0) };
    });
    m.db.shipments.forEach((x) => (x.status = m.deriveShipmentStatus(x)));
    // docs/18: the shared fleet / stock / balance figures (same as the server; metrics.ts, lazy)
    const MX = await import('./metrics');
    const fleet = MX.fleetFigures({ shipments: m.db.shipments.filter((s) => inScope(s.entityId) && seesSh(s)), stopsOf: (id) => m.db.routes.find((r) => r.id === id)?.stops ?? [], now: Date.now() });
    const rates = m.db.fxRates ?? seed.seedFxRates();
    const usdSales = scopedSales.map((s) => { const cv = (v: number) => R.toUsd(v, s.currency, rates, s.at); return { ...s, paid: cv(s.paid), lines: s.lines.map((l) => ({ ...l, price: cv(l.price) })) }; });
    return wait({
      stockValue: money ? MX.stockValue(st) ?? 0 : 0,
      stockCases: MX.casesOnHand(st),
      inTransitCases: MX.casesInTransit(st),
      sales30, daily,
      trucksActive: fleet.onRoad,
      trucksDelayed: fleet.delayed,
      trucksAtBorder: fleet.atBorder,
      plansPending: mockConfig.approvals.purchaseOrders ? m.db.plans.filter((p) => p.status === 'Submitted' && inScope(p.entityId)).length : 0,
      paymentsPending: R.hasFeature(current?.roles ?? [], 'finance') ? m.db.payments.filter((p) => p.status === 'Pending approval' && inScope(p.entityId)).length : 0,
      unpaidBalance: MX.owedByCustomers(usdSales, Date.now()),
    });
  },
};
export const notifications = {
  async list() { ensure(); return wait(m.db.notifications.filter((n) => (!n.entityId || inScope(n.entityId)) && (!current || current.roles.some((r) => n.forRoles.includes(r)) || current.roles.includes('director')))); },
  async readAll() { ensure(); m.db.notifications.forEach((n) => (n.read = true)); return commit(true); },
  async markRead(id: ID) { ensure(); const n = m.db.notifications.find((x) => x.id === id); if (n) n.read = true; return commit(true); },
};

export const demo = {
  reset() { m.reset(); emit(); if (typeof document !== 'undefined') void ready().then(emit); /* browser: add the money history (lazy); node tests call ready() */ },
  /** Mock only: change the config.toml stand-in (e.g. turn director approval of POs on) for demos and tests. */
  setConfig(c: { approvals?: Partial<AppConfig['approvals']>; loading?: Partial<AppConfig['loading']>; fees?: Partial<NonNullable<AppConfig['fees']>>; costs?: Partial<NonNullable<AppConfig['costs']>> }) { for (const k of ['approvals', 'loading', 'fees', 'costs'] as const) Object.assign(mockConfig[k]!, c[k] ?? {}); emit(); },
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
    if (e.position !== before) log('POST', `/waiting/${entryId}/move`, { recordType: 'waiting', recordId: entryId, entityId: e.entityId, before: { position: before }, after: { position: e.position } });
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
    log('DELETE', `/waiting/${entryId}`, { recordType: 'waiting', recordId: entryId, entityId: e.entityId, summary: reason?.trim() || 'removed' });
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
    ensure(); const { sh, leg } = tripLeg(legId);
    if (!A.canDispatch(me(), leg, { myLoadingCps: myLpCps(), myWarehouseCps: myWhCps() })) throw forbid('Your role can view this trip but not dispatch it');
    if (!['Planned', 'Loaded'].includes(leg.status)) throw httpErr('This leg has already left', 409);
    m.recordPass(legId, leg.passes[0].checkpointId, 'departed', source);
    log('POST', `/legs/${legId}/dispatch`, { recordType: 'leg', recordId: legId, entityId: sh.entityId, summary: `${m.truckReg(leg.truckId)} dispatched` });
    return commit(m.findLeg(legId).leg);
  },
  /** DS-02: end this leg at an intermediate warehouse where goods are unloaded and reloaded onto another truck. */
  async splitAt(legId: ID, checkpointId: ID) {
    ensure(); const { sh, leg } = tripLeg(legId);
    if (!A.canSplitLeg(me())) throw forbid('Only the truck follow-up officer sets a transfer point');
    const k = leg.passes.findIndex((p) => p.checkpointId === checkpointId);
    if (k <= 0 || k >= leg.passes.length - 1) throw new Error('Pick a point between origin and destination');
    if (leg.passes[k].arrivedAt) throw new Error('The truck has already reached that point');
    leg.passes = leg.passes.slice(0, k + 1); leg.toId = checkpointId; leg.plannedArrival = leg.passes[k].plannedAt;
    m.notify('Transfer point set', `${sh.ref}: unload at ${lookup.checkpoint(checkpointId)?.name}, then reload for the next leg`, `#/shipments/${sh.id}`, ['operations', 'fleet', 'receiver']);
    sh.status = m.deriveShipmentStatus(sh);
    return commit(leg);
  },
  async acks(shipmentId: ID) { ensure(); const sh = m.db.shipments.find((x) => x.id === shipmentId); if (!sh || !seesSh(sh) || !seesAcks()) return wait([]); return wait(m.db.acks.filter((a) => a.shipmentId === shipmentId)); },
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
export async function ready() { ensure(); if (!m.db.reexports) (await money()).fill(); }
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
      toLoad: m.db.loadings.filter((l) => l.status === 'Pending' && inScope(l.entityId) && u.loadingPointIds.includes(l.loadingPointId)).map(withNextRevision).map((l) => loadingOut({ ...l, poRef: lookup.poRef(l.poId), poTitle: m.db.pos.find((p) => p.id === l.poId)?.title ?? '' })),
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
    ensure(); const { sh, leg } = tripLeg(legId);
    if (!A.canUpdateTrip(me(), leg)) throw forbid('Your role can view this trip but not change it');
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
  async saveWarehouse(id: ID | null, input: Partial<WarehouseInput>): Promise<Warehouse> { return (await admin()).saveWarehouse(adminCtx(), id, input); },
  async addRoute(input: { name: string; code?: string; distanceKm?: number; stops: RouteStop[] }) { return (await admin()).addRoute(adminCtx(), input); },
  async updateRouteStops(routeId: ID, stops: RouteStop[]) { return (await admin()).updateRouteStops(adminCtx(), routeId, stops); },
  // ---- Transport onboarding (docs/10): providers, trucks, drivers — truck planners, fleet, planners, directors, admins ----
  async addTruck(input: TruckInput) { return masterdata.saveTruck(null, input); },
  async addDriver(input: DriverInput & { appLogin?: boolean }) { return masterdata.saveDriver(null, input); },
  async addProvider(input: Partial<ProviderInput> & { name: string }) { return masterdata.saveProvider(null, { kind: input.regular === false ? 'market' : 'company', ...input }); },
  /** Add (id null) or edit a transport provider. `active: false` deactivates it (kept for history). */
  async saveProvider(id: ID | null, input: Partial<ProviderInput>): Promise<Provider> { return (await admin()).saveProvider(adminCtx(), id, input); },
  async saveTruck(id: ID | null, input: Partial<TruckInput>): Promise<Truck> { return (await admin()).saveTruck(adminCtx(), id, input); },
  async saveDriver(id: ID | null, input: Partial<DriverInput> & { appLogin?: boolean }): Promise<SavedDriver> { return (await admin()).saveDriver(adminCtx(), id, input); },
  // ---- Static data (docs/12 A-05): companies, suppliers, goods, receiving companies — lazy chunk (./mock/admin) ----
  async saveEntity(id: ID | null, input: Partial<EntityInput>): Promise<Entity> { return (await admin()).saveEntity(adminCtx(), id, input); },
  async saveSupplier(id: ID | null, input: Partial<SupplierInput>): Promise<Supplier> { return (await admin()).saveSupplier(adminCtx(), id, input); },
  async saveProduct(id: ID | null, input: Partial<ProductInput>): Promise<Product> { return (await admin()).saveProduct(adminCtx(), id, input); },
  async saveReceivingCompany(id: ID | null, input: Partial<ReceivingCompanyInput>): Promise<ReceivingCompany> { return (await admin()).saveReceivingCompany(adminCtx(), id, input); },
};

const mockUsers: UserAdmin[] = seed.users.map((u) => ({ ...u, username: u.id.replace(/^u-/, ''), email: `${u.id.replace(/^u-/, '')}@btw.local`, active: true, hasPassword: true, hasPin: true, driverId: seed.drivers.find((d) => d.phone === u.phone)?.id ?? null }));
let mockUsersLoaded = false;
/** Field-app logins created for new drivers in this demo join the admin list once. */
const adminUsers = () => { if (!mockUsersLoaded) { ensure(); mockUsersLoaded = true; for (const u of m.db.extraUsers ?? []) if (!mockUsers.some((x) => x.id === u.id)) mockUsers.push({ ...u, username: u.id.replace(/^u-/, ''), email: null, active: true, hasPassword: false, hasPin: true, driverId: m.db.drivers.find((d) => d.phone === u.phone)?.id ?? null }); } return mockUsers; };
type UserScopeInput = { entityIds?: ID[]; loadingPointIds?: ID[]; warehouseIds?: ID[]; pairs?: UserPair[]; routeIds?: ID[] };
/** Admin-only operations live in a lazy chunk (./mock/admin) so the apps' entry stays small. */
const admin = () => import('./mock/admin');
// docs/14: warehouse money lives in a lazy chunk too; `mo(name)` forwards a call to it with the mock's context.
const money = () => import('./mock/money');
type MoneyMod = typeof import('./mock/money');
type MoneyFn<K extends keyof MoneyMod> = MoneyMod[K] extends (c: never, ...a: infer A) => infer T ? (...a: A) => T : never;
function mo<K extends keyof MoneyMod>(k: K): MoneyFn<K> {
  return (async (...a: unknown[]) => ((await money())[k] as (...x: unknown[]) => unknown)({ current, me, ensure, log, commit, wait, httpErr, inScope, writeEntity, config: mockConfig, seesSh, reportData }, ...a)) as MoneyFn<K>;
}
const adminCtx = (): import('./mock/admin').Ctx => ({ current, me, ensure, price: lookup.price, log, commit, wait, httpErr, allUsers, adminUsers, mockUsers, ALL_ENTITIES });
export const users = {
  async list() { return (await admin()).listUsers(adminCtx()); },
  async create(input: { name: string; phone: string; username?: string; email?: string; roles: Role[]; password?: string; pin?: string } & UserScopeInput) { return (await admin()).createUser(adminCtx(), input); },
  async update(id: ID, input: Partial<Pick<UserAdmin, 'name' | 'email' | 'roles' | 'entityIds' | 'loadingPointIds' | 'warehouseIds' | 'pairs' | 'routeIds' | 'active'>>) { return (await admin()).updateUser(adminCtx(), id, input); },
  async setSecret(id: ID, input: { pin?: string; password?: string }) { if (input.pin && !/^\d{4,6}$/.test(input.pin)) throw new Error('PIN must be 4–6 digits'); const u = mockUsers.find((x) => x.id === id)!; if (input.pin) u.hasPin = true; if (input.password) u.hasPassword = true; return wait(true); },
  async devices(_id: ID) { return wait([] as Device[]); },
};
/** docs/12 A-07: the audit log — search by user, feature, date and text; newest first, paged (directors). */
export const audit = { async list(f: AuditFilter = {}): Promise<AuditPage> { return (await admin()).auditList(adminCtx(), f); } };

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
  // Own scope (docs/12): a planner's pairs; the truck follow-up officer every truck; the rest as their features allow
  const u = me(), director = A.isDirector(u);
  const shipments = m.db.shipments.filter((s) => director || seesSh(s));
  const shipIds = new Set(shipments.map((s) => s.id));
  const pairOk = (o: { entityId: ID; supplierId: ID }) => director || A.seesPair(u, o.entityId, o.supplierId);
  const pos = m.db.pos.filter(pairOk); const poIds = new Set(pos.map((p) => p.id));
  const seesSales = director || R.hasFeature(u.roles, 'sales') || u.roles.includes('planner');
  return {
    now: Date.now(), sales: seesSales ? m.db.sales : [], shipments: shipments.map((s) => ({ ...s, status: m.deriveShipmentStatus(s) })), acks: m.db.acks.filter((a) => shipIds.has(a.shipmentId)),
    costs: m.db.costs.filter((c) => shipIds.has(c.shipmentId)), payments: m.db.payments.filter((x) => shipIds.has(x.shipmentId)), plans: m.db.plans.filter(pairOk), pos, loadings: m.db.loadings.filter((l) => poIds.has(l.poId)), moves: m.db.stockMoves, stock: m.stock(),
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
  /** docs/14 B-07: combined performance + margins at product / warehouse / company / receiving company / business level (directors). */
  performance: mo('performance'),
};

// ---- docs/14 workstream B: warehouse money and data (lazy chunk mock/money.ts) ----------------------------------------
/** Warehouse expenses (B-01) and inventory recording (B-02): receivers their own warehouses (no values), directors all. */
export const warehouse = {
  expenses: mo('expenses'), addExpense: mo('addExpense'), updateExpense: mo('updateExpense'), deleteExpense: mo('deleteExpense'),
  stock: mo('warehouseStock'), adjust: mo('adjust'), adjustments: mo('adjustments'),
};
/** Re-export orders Asie → Yonas (B-03). */
export const reexports = { list: mo('listReexports'), get: mo('getReexport'), create: mo('createReexport'), load: mo('loadReexport'), cancel: mo('cancelReexport') };
/** Selling prices per product (B-05, directors). */
export const pricing = { list: mo('listPrices'), set: mo('setPrice') };

/** docs/15: P1 dashboards (lazy chunk mock/dash.ts, same builders as GET /v1/dashboards). */
export const dashboards = {
  async get(keys: import('./dashboards').DashKey[], f: import('./dashboards').DashFilter = {}) {
    return (await import('./mock/dash')).dashboards({ current, me, ensure, wait, httpErr, scopeIds, config: mockConfig, people: allUsers, fees: () => finance.fees(), users: () => users.list() }, keys, f);
  },
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
