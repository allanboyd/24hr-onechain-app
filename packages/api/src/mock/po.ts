// Purchase orders in the in-browser mock (docs/09 §4) — same rules as apps/api planning.service: a PO is created, updated
// (= the next revision, never an overwrite) or soft-deleted; never drafted. Used by mock-client and by the demo seed.
import * as R from '../rules';
import * as seed from './seed';
import type { AppConfig, ID, Loading, LoadingAlternative, Plan, PlanLine, PoInput, PoUpdateInput, PoVersion, PurchaseOrder, Role } from '../types';
import { createLoadingsForPO, notify, uid, type DB } from './db';

export const INSTRUCTION = 'Kindly process and avail stock for loading.';
export interface Actor { id: ID; name: string; roles: Role[] }
export interface PoCtx { d: DB; by: Actor; config: AppConfig; price: (productId: ID) => number; at?: string }
const err = (message: string, status = 422) => Object.assign(new Error(message), { status });
const iso = () => new Date().toISOString();
const n = (x: number) => x.toLocaleString('en-US');

export const versionsOf = (d: DB) => (d.poVersions ??= []);
/** The chain of a PO: base first, every revision, the effective (latest) PO. */
export function chainOf(d: DB, id: ID) {
  const po = d.pos.find((p) => p.id === id);
  if (!po) return null;
  const baseId = po.revisionOf ?? po.id;
  const chain = d.pos.filter((x) => x.id === baseId || x.revisionOf === baseId).sort((a, b) => (a.revision ?? 0) - (b.revision ?? 0));
  const effective = chain.find((x) => !x.supersededById) ?? chain.at(-1)!;
  return { asked: po, baseId, chain, effective, plan: d.plans.find((p) => p.id === effective.planId)! };
}
const destOf = (d: DB) => (l: PlanLine) => { const cp = d.routes.find((r) => r.id === l.routeId)?.stops.at(-1)?.checkpointId; return seed.warehouses.find((w) => w.checkpointId === cp)?.id; };
export const loadingsOf = (d: DB, poIds: ID[]) => d.loadings.filter((l) => poIds.includes(l.poId));
export const shipmentsOf = (d: DB, poIds: ID[]) => d.shipments.filter((s) => poIds.includes(s.poId));
export function loadedOf(lds: Loading[]) {
  const loaded: Record<ID, number> = {}; const loadedTrucks: number[] = [];
  for (const l of lds) if (l.status === 'Loaded') { loadedTrucks.push(l.truckNo); for (const x of l.lines) loaded[x.planLineId] = (loaded[x.planLineId] ?? 0) + x.loadedQty; }
  return { loaded, loadedTrucks };
}

/** Validate and normalise lines (same messages as the API). Existing ids are kept; an unchanged product keeps its PO price. */
export function cleanLines(ctx: PoCtx, supplierId: ID, input: PoInput['lines'] | undefined, prev: PlanLine[] = []): PlanLine[] {
  if (!Array.isArray(input)) throw err('lines must be a list', 400);
  const director = ctx.by.roles.includes('director');
  const out: PlanLine[] = [];
  for (const l of input) {
    if (!(Number(l.qty) > 0)) throw err('Every line needs a quantity above zero');
    if (!(Number(l.truckNo) >= 1)) throw err('Truck numbers start at 1');
    const product = seed.products.find((x) => x.id === l.productId);
    if (!product) throw err(`Unknown product ${l.productId}`);
    if (product.supplierId !== supplierId) throw err(`${product.brand} ${product.pack} is not supplied by this export section`);
    if (!ctx.d.routes.some((r) => r.id === l.routeId)) throw err(`Unknown route ${l.routeId}`);
    if (!seed.receivingCompanies.some((r) => r.id === l.deliveredToId)) throw err(`Unknown receiving company ${l.deliveredToId}`);
    const old = l.id ? prev.find((x) => x.id === l.id) : undefined;
    const listPrice = old && old.productId === l.productId ? old.price : ctx.price(l.productId);
    out.push({ id: old?.id ?? uid('pl'), truckNo: Math.round(Number(l.truckNo)), productId: l.productId, qty: Math.round(Number(l.qty)),
      price: director && l.price !== undefined && Number.isFinite(Number(l.price)) ? Number(l.price) : listPrice || Number(l.price) || 0, deliveredToId: l.deliveredToId, routeId: l.routeId,
      ...(old?.alternativeFor ? { alternativeFor: old.alternativeFor } : {}), ...(l.exceptionReason?.trim() ? { exceptionReason: l.exceptionReason.trim() } : {}) });
  }
  if (!out.length) throw err('Add at least one truck line');
  return out;
}
function header(input: Partial<PoInput>, cur?: { title: string; requiredBy: string; currency: Plan['currency']; instruction: string }) {
  const title = (input.title ?? cur?.title ?? '').trim();
  if (!title) throw err('Give the purchase order a title, e.g. “October ’26 Order”');
  return { title, instruction: (input.instruction ?? cur?.instruction ?? INSTRUCTION).trim() || INSTRUCTION, requiredBy: input.requiredBy ?? cur?.requiredBy ?? new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10), currency: (input.currency ?? cur?.currency ?? 'USD') as Plan['currency'] };
}
function snapshot(d: DB, po: PurchaseOrder, plan: Plan, basePoId: ID, revision: number, kind: PoVersion['kind'], lineChanges: PoVersion['lineChanges'], reason: string | null, byUserId: ID, at: string) {
  if (versionsOf(d).some((v) => v.poId === po.id)) return;
  versionsOf(d).push({ poId: po.id, basePoId, planId: plan.id, ref: po.ref, revision, kind, title: plan.title, instruction: po.instruction, requiredBy: plan.requiredBy, currency: plan.currency, lines: structuredClone(plan.lines), lineChanges, byUserId, at, reason });
}
/** Snapshot of an existing PO as its original version (seed data made before versions existed). */
export const snapshotOriginal = (d: DB, po: PurchaseOrder) => { const plan = d.plans.find((p) => p.id === po.planId)!; snapshot(d, po, plan, po.id, 0, 'original', [], null, plan.createdById, po.approvedAt); };
function trucksToLoad(plan: Plan) {
  const lp = seed.suppliers.find((s) => s.id === plan.supplierId);
  notify('New trucks to load', `${plan.ref} · ${new Set(plan.lines.map((l) => l.truckNo)).size} trucks at ${lp?.code} ${lp?.city}`, '#/loading', ['loader', 'operations', 'fleet'], plan.entityId);
}
/** One loading per truck: new trucks get one, pending ones the new quantities, trucks gone from the PO lose their pending loading. */
export function syncLoadings(d: DB, po: PurchaseOrder, plan: Plan) {
  const nos = [...new Set(plan.lines.map((l) => l.truckNo))];
  const mine = d.loadings.filter((l) => l.poId === po.id);
  if (!mine.length) { createLoadingsForPO(po); return; }
  for (const no of nos) {
    const lines = plan.lines.filter((l) => l.truckNo === no).map((l) => ({ planLineId: l.id, productId: l.productId, orderedQty: l.qty, loadedQty: l.qty }));
    const cur = mine.find((x) => x.truckNo === no);
    if (!cur) d.loadings.push({ id: uid('ld'), entityId: po.entityId, poId: po.id, truckNo: no, truckId: '', driverId: '', loadingPointId: po.supplierId, status: 'Pending', lines, agreedTransport: null, transportCurrency: 'USD', documents: [] });
    else if (cur.status === 'Pending') cur.lines = lines;
  }
  d.loadings = d.loadings.filter((l) => !(l.poId === po.id && l.status === 'Pending' && !nos.includes(l.truckNo)));
}

/** Create: Issued at once (approved automatically) — or Awaiting approval when approvals are on. */
export function createPo(ctx: PoCtx, entityId: ID, input: PoInput): PurchaseOrder {
  const { d, by } = ctx;
  const sup = seed.suppliers.find((s) => s.id === input.supplierId);
  if (!sup) throw err('Supplier not found', 404);
  const e = seed.entities.find((x) => x.id === entityId)!;
  const head = header(input);
  const date = input.date && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : (ctx.at ?? iso()).slice(0, 10);
  const lines = cleanLines(ctx, sup.id, input.lines);
  const awaiting = ctx.config.approvals.purchaseOrders;
  const at = ctx.at ?? iso();
  const ref = R.nextRef(d.plans.map((p) => p.ref), e.poPrefix, Number(date.slice(0, 4)));
  let plan: Plan = { id: uid('plan'), ref, title: head.title, entityId, supplierId: sup.id, currency: head.currency, date, requiredBy: head.requiredBy, status: awaiting ? 'Submitted' : 'Approved', version: 1, lines, createdById: by.id,
    history: [{ at, byUserId: by.id, action: 'created' }, ...(awaiting ? [] : [{ at, byUserId: by.id, action: 'issued' as const, comment: 'Approved automatically' }])] };
  plan = R.applyPlanLinks(plan, d.periodPlans ?? [], d.plans, destOf(d));
  const po: PurchaseOrder = { id: uid('po'), ref, planId: plan.id, entityId, supplierId: sup.id, currency: head.currency, date, title: head.title, instruction: head.instruction, version: 1,
    approvedById: awaiting ? '' : by.id, approvedAt: at, approval: 'issued', status: awaiting ? 'Awaiting approval' : 'Issued' };
  plan.poId = po.id;
  d.plans.push(plan); d.pos.push(po);
  snapshot(d, po, plan, po.id, 0, 'original', [], null, by.id, at);
  const cases = lines.reduce((a, l) => a + l.qty, 0);
  if (awaiting) notify('Purchase order awaiting approval', `${ref} · ${plan.title} · ${n(cases)} cases · by ${by.name}`, `#/pos/${po.id}`, ['director'], entityId);
  else {
    createLoadingsForPO(po);
    notify('Purchase order created', `${ref} · ${plan.title} · ${n(cases)} cases · approved automatically · by ${by.name}`, `#/pos/${po.id}`, ['planner', 'director'], entityId);
    trucksToLoad(plan);
  }
  return po;
}
/** Awaiting approval → Issued (director, or automatically when approvals are switched off). */
export function approvePo(ctx: PoCtx, po: PurchaseOrder, approval: 'director' | 'issued', signature?: string, comment?: string) {
  const plan = ctx.d.plans.find((p) => p.id === po.planId)!;
  const at = ctx.at ?? iso();
  plan.status = 'Approved';
  plan.history.push({ at, byUserId: ctx.by.id, action: approval === 'director' ? 'approved' : 'issued', ...(approval === 'issued' ? { comment: 'Approved automatically' } : comment ? { comment } : {}), ...(signature ? { signature } : {}) });
  Object.assign(po, { status: 'Issued', approvedById: ctx.by.id, approvedAt: at, approval, signature });
  syncLoadings(ctx.d, po, plan);
  notify('Purchase order approved', `${po.ref} · ${approval === 'director' ? `approved by ${ctx.by.name}` : 'approved automatically'}`, `#/pos/${po.id}`, ['planner'], po.entityId);
  trucksToLoad(plan);
  return po;
}
/** Update = the next revision (reason required); loaded lines can't drop below what was loaded; fully loaded → refused. */
export function updatePo(ctx: PoCtx, id: ID, input: PoUpdateInput): PurchaseOrder {
  const { d, by } = ctx;
  const reason = input?.reason?.trim();
  if (!reason) throw err('Give a reason for the update — it is kept with the revision');
  const c = chainOf(d, id); if (!c) throw err('Purchase order not found', 404);
  const cur = c.effective, prev = c.plan;
  const lines0 = cleanLines(ctx, cur.supplierId, input.lines, prev.lines);
  const head = header(input, { title: prev.title, requiredBy: prev.requiredBy, currency: prev.currency, instruction: cur.instruction });
  const lds = d.loadings.filter((l) => l.poId === cur.id);
  const { loaded, loadedTrucks } = loadedOf(lds);
  const block = R.poUpdateBlock(cur, prev.lines, lines0, loadedTrucks, loaded, Math.max(new Set(prev.lines.map((l) => l.truckNo)).size, lds.length));
  if (block) throw err(block, 409);
  const lines = R.applyPlanLinks({ ...prev, lines: lines0 }, d.periodPlans ?? [], d.plans, destOf(d)).lines;
  const changes = R.diffPoLines(prev.lines, lines, 'updated');
  if (!changes.length && head.title === prev.title && head.requiredBy === prev.requiredBy && head.currency === prev.currency && head.instruction === cur.instruction) throw err('Nothing changed — the purchase order stays as it is');
  const base = c.chain[0];
  const no = R.nextRevisionNo(c.chain);
  const ref = R.revisionRef(base.ref, ctx.config.loading.revisionSuffix, no);
  const at = ctx.at ?? iso();
  const poId = uid('po'), planId = uid('plan');
  const plan: Plan = { ...structuredClone(prev), id: planId, ref, title: head.title, requiredBy: head.requiredBy, currency: head.currency, lines, poId, revisionOf: base.planId, revision: no,
    history: [...prev.history, { at, byUserId: by.id, action: 'updated', comment: reason }] };
  delete plan.supersededById;
  const next: PurchaseOrder = { ...cur, id: poId, ref, planId, title: head.title, instruction: head.instruction, currency: head.currency, version: 1, approvedById: by.id, approvedAt: at, signature: undefined, sentAt: undefined,
    approval: 'update', revisionOf: base.id, revision: no, changes: [], revisionReason: reason, revisionKind: 'updated', lineChanges: changes };
  delete next.supersededById; delete next.createdBy; delete next.onBehalfOfId;
  d.plans.push(plan); d.pos.push(next);
  prev.supersededById = planId; cur.supersededById = poId;
  for (const x of d.loadings) if (x.poId === cur.id) x.poId = poId;
  for (const x of d.shipments) if (x.poId === cur.id) x.poId = poId;
  snapshot(d, next, plan, base.id, no, 'updated', changes, reason, by.id, at);
  if (next.status !== 'Awaiting approval') syncLoadings(d, next, plan);
  const name = (pid: ID) => seed.products.find((x) => x.id === pid)?.brand ?? pid;
  const summary = changes.slice(0, 3).map((x) => R.lineChangeText(x, name)).join('; ') + (changes.length > 3 ? ` (+${changes.length - 3} more)` : '');
  notify('Purchase order updated', `${cur.ref} → ${ref} · ${summary || 'header changed'} · “${reason}” · by ${by.name}`, `#/pos/${poId}`, ['planner', 'director', ...(next.status !== 'Awaiting approval' ? ['loader', 'operations', 'fleet'] as Role[] : [])], cur.entityId);
  return next;
}
/** Soft delete (reason kept) while nothing is loaded; pending loadings are removed. */
export function deletePo(ctx: PoCtx, id: ID, reason: string, rejected = false): PurchaseOrder {
  const { d, by } = ctx;
  const why = reason?.trim();
  if (!why) throw err('Give a reason for deleting the purchase order');
  const c = chainOf(d, id); if (!c) throw err('Purchase order not found', 404);
  const ids = c.chain.map((x) => x.id);
  const lds = loadingsOf(d, ids), shs = shipmentsOf(d, ids);
  const block = R.poDeleteBlock(c.effective, lds, shs);
  if (block) throw err(block, 409);
  const at = ctx.at ?? iso();
  for (const x of c.chain) Object.assign(x, { status: 'Deleted', deletedAt: at, deletedById: by.id, deleteReason: why });
  for (const p of d.plans) if (c.chain.some((x) => x.planId === p.id)) p.status = 'Deleted';
  c.plan.history.push({ at, byUserId: by.id, action: rejected ? 'rejected' : 'deleted', comment: why });
  const trucks = lds.map((l) => l.truckId).filter(Boolean);
  d.loadings = d.loadings.filter((l) => !ids.includes(l.poId));
  for (const w of d.waiting) if (trucks.includes(w.truckId) && w.status === 'Assigned') w.status = 'Waiting';
  notify(rejected ? 'Purchase order rejected' : 'Purchase order deleted', `${c.effective.ref} · ${c.plan.title} · “${why}” · by ${by.name}`, `#/pos/${c.effective.id}`, ['planner', 'director', ...(lds.length ? ['loader', 'operations', 'fleet'] as Role[] : [])], c.effective.entityId);
  return c.effective;
}

/** A loading that differs from the PO → the next revision (same counter as office updates), auto-issued; the chain follows it. */
export function reviseAtLoading(ctx: PoCtx, ld: Loading, input: { loadedQty?: Record<ID, number>; alternatives?: LoadingAlternative[] }, check: R.LoadingCheck, truckReg: string) {
  const { d, by } = ctx;
  const po = d.pos.find((p) => p.id === ld.poId)!;
  const c = chainOf(d, po.id)!;
  const base = c.chain[0];
  const no = R.nextRevisionNo(c.chain);
  const ref = R.revisionRef(base.ref, ctx.config.loading.revisionSuffix, no);
  const prev = d.plans.find((p) => p.id === po.planId)!;
  const poId = uid('po'); const at = ctx.at ?? iso();
  const r = R.revisePlan(prev, ld.truckNo, ld.lines, input.loadedQty, input.alternatives, { id: uid('plan'), ref, poId, lineId: () => uid('pl'), basePlanId: base.planId, revision: no }, ctx.price, by.id, at);
  const changes = check.changes.map((x) => ({ ...x, truckNo: ld.truckNo, ...(x.kind === 'alternative' ? { planLineId: r.altLines.find((a) => a.productId === x.productId && a.alternativeFor === x.replacesPlanLineId)?.planLineId } : {}) }));
  const summary = R.revisionSummary(changes, (pid) => seed.products.find((x) => x.id === pid)?.brand ?? pid);
  const lineChanges = R.diffPoLines(prev.lines, r.plan.lines, 'revised at loading');
  const next: PurchaseOrder = { ...po, id: poId, ref, planId: r.plan.id, version: 1, approvedById: by.id, approvedAt: at, signature: undefined, sentAt: undefined, approval: 'revision',
    revisionOf: base.id, revision: no, changes, revisionReason: `Loaded truck ${ld.truckNo} differs from the PO (${summary || 'quantities'}) — revised automatically at loading`, createdBy: 'system', onBehalfOfId: by.id,
    revisionKind: 'revised at loading', lineChanges };
  delete next.supersededById;
  d.plans.push(r.plan); d.pos.push(next);
  prev.supersededById = r.plan.id; po.supersededById = poId;
  for (const x of d.loadings) if (x.poId === po.id) x.poId = poId;
  for (const x of d.shipments) if (x.poId === po.id) x.poId = poId;
  ld.lines.push(...r.altLines.map((a) => ({ planLineId: a.planLineId, productId: a.productId, orderedQty: 0, loadedQty: a.qty, ...(a.alternativeFor ? { alternativeFor: a.alternativeFor } : {}) })));
  snapshot(d, next, r.plan, base.id, no, 'revised at loading', lineChanges, next.revisionReason ?? null, by.id, at);
  notify('PO revised at loading', `PO ${po.ref} revised → ${ref} at loading${summary ? ` (${summary})` : ''} · ${truckReg}`, `#/pos/${poId}`, ['planner', 'director'], po.entityId);
  return next;
}
