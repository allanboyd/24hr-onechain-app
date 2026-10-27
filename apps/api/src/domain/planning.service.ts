import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { and, desc, eq, inArray, or } from 'drizzle-orm';
import { db, schema as t, type Tx } from '../db/client';
import { applyPlanLinks, approvalText, diffPoLines, hasFeature, lineChangeText, nextRef, nextRevisionNo, planContext, PO_EDITORS, poDeleteBlock, poStage, poUpdateBlock, revisionRef } from '@btw/api/rules';
import type { Loading, PeriodPlan, Plan, PlanLine, PoActions, PoDetail, PoInput, PoUpdateInput, PoVersion, PurchaseOrder } from '@btw/api/types';
import { fail, forbidden, notFound } from '../common/errors';
import { isUsableImage } from '../common/images';
import { iso, uid } from '../common/ids';
import { assertEntity, canSeeEntity, has, writeEntity, type Principal } from '../auth/principal';
import { isDirector, orderAccess, orderFor, seesPair, seesPrices, withoutPrices } from '@btw/api/access';
import { auditNote } from '../common/audit-context';
import { entityById, pdfEntity } from './companies';
import { MAIL, PDF, type MailPort, type PdfPort, type PoLetterData } from '../integrations/ports';
import { NotifyService } from './notify.service';
import { appConfig } from '../config/app-config';
import { RefService } from './ref.service';
import { loadShipments, map } from './store';

const INSTRUCTION = 'Kindly process and avail stock for loading.';
const SYSTEM = 'system';
const n = (x: number) => x.toLocaleString('en-US');

/**
 * Purchase orders (docs/09 §4): a PO is created, updated or deleted — never drafted.
 * - Create → Issued at once ("Approved automatically"), or Awaiting approval when config approvals.purchase_orders = true.
 * - Update → the next revision `<original ref>-rev00N` (one counter with the revisions made at loading); the original and
 *   every revision stay as immutable snapshots (`po_versions`) with per-line change records. The latest revision is the PO
 *   in force: loadings and shipments follow it.
 * - Delete → soft delete (status Deleted, reason kept), only while nothing has been loaded.
 * Each PO is backed by an order row (`plans`) holding its lines; a revision has its own order copy.
 */
@Injectable()
export class PlanningService implements OnModuleInit {
  private log = new Logger('Planning');
  constructor(private ref: RefService, private notify: NotifyService, @Inject(PDF) private pdf: PdfPort, @Inject(MAIL) private mail: MailPort) {}

  /** POs awaiting approval while approvals are switched off (orders submitted before migration 0011, or the switch was
   *  turned off later) are approved automatically at start-up. */
  async onModuleInit() {
    if (appConfig.approvals.purchaseOrders) return;
    try {
      const waiting = await db.select().from(t.pos).where(eq(t.pos.status, 'Awaiting approval'));
      for (const r of waiting) await db.transaction(async (tx) => this.approveTx(tx, map.po(r), SYSTEM, undefined, 'issued'));
      if (waiting.length) this.log.log(`approved ${waiting.length} purchase order(s) automatically (approvals.purchase_orders = false)`);
    } catch (e) { this.log.warn(`automatic approval skipped: ${(e as Error).message}`); }
  }

  /** Roles document §7: directors all orders; Kabonge his buyer–supplier pairs (edit); loaders and Testfie the orders
   *  loading at their points (view, loaders without prices); receivers the orders delivering to them (their lines, no prices). */
  private seesPlans = (p: Principal) => hasFeature(p.roles, 'purchase-orders');
  /** Receiving companies of the user's warehouses. */
  private async myRc(p: Principal) { const { bundle } = await this.ref.get(); return [...new Set(bundle.warehouses.filter((w) => p.warehouseIds.includes(w.id)).map((w) => w.receivingCompanyId))]; }
  private async access(p: Principal, plan: Pick<Plan, 'entityId' | 'supplierId' | 'lines'>) { return this.seesPlans(p) && canSeeEntity(p, plan.entityId) ? orderAccess(p, plan, await this.myRc(p)) : null; }
  /** The order as this reader may see it (404 outside scope). */
  private async load(p: Principal, id: string, need: 'view' | 'edit' = 'view') {
    const [r] = await db.select().from(t.plans).where(eq(t.plans.id, id));
    if (!r) return notFound('Order');
    assertEntity(p, r.entityId);
    const plan = map.plan(r);
    const a = await this.access(p, plan);
    if (!a) forbidden();
    if (need === 'edit' && a !== 'edit') forbidden('This order is not one of your buyer–supplier pairs');
    return plan;
  }
  private async out(p: Principal, plan: Plan) { return orderFor(p, plan, await this.myRc(p)); }

  /** Period plans and orders of a company, and a line → destination warehouse lookup (PO-06). */
  private async planLinks(entityId: string, q: typeof db | Tx = db) {
    const [pps, orders, { bundle }] = await Promise.all([
      q.select().from(t.periodPlans).where(eq(t.periodPlans.entityId, entityId)), q.select().from(t.plans).where(eq(t.plans.entityId, entityId)), this.ref.get(),
    ]);
    const destOf = (l: PlanLine) => { const cp = bundle.routes.find((r) => r.id === l.routeId)?.stops.at(-1)?.checkpointId; return bundle.warehouses.find((w) => w.checkpointId === cp)?.id; };
    return { periodPlans: pps.map(map.periodPlan) as PeriodPlan[], orders: orders.map(map.plan), destOf };
  }
  /** PO-06: each order line against the period plan — planned, ordered before, this PO, remaining, over/unplanned. */
  async planContext(p: Principal, id: string) {
    const plan = await this.load(p, id);
    const k = await this.planLinks(plan.entityId);
    return planContext(plan, k.periodPlans, k.orders, k.destOf);
  }

  /** Orders behind the POs (read-only; reports and splits). Revision copies and deleted orders are not listed. */
  async list(p: Principal) {
    if (!this.seesPlans(p)) return [];
    const rows = await db.select().from(t.plans).orderBy(desc(t.plans.date));
    const rc = await this.myRc(p);
    return rows.map(map.plan).filter((x) => !x.revisionOf && x.status !== 'Deleted' && canSeeEntity(p, x.entityId) && orderAccess(p, x, rc)).map((x) => orderFor(p, x, rc));
  }
  async get(p: Principal, id: string) { return this.out(p, await this.load(p, id)); }

  // ---- Lines in, validated ----------------------------------------------------------------------------------------
  /** Validate and normalise PO lines. Existing line ids (of `prev`) are kept so loadings keep pointing at their lines;
   *  prices come from the price list (an unchanged product keeps its PO price); directors may set prices. */
  private async cleanLines(p: Principal, supplierId: string, input: PoInput['lines'] | undefined, prev: PlanLine[] = []): Promise<PlanLine[]> {
    if (!Array.isArray(input)) fail('lines must be a list', 400, 'bad-request');
    if (input!.length > 200) fail('At most 200 lines', 400, 'bad-request');
    const { bundle } = await this.ref.get();
    const priceOf = await this.ref.priceOf();
    const director = has(p, 'director');
    const out: PlanLine[] = [];
    for (const l of input!) {
      if (!l || typeof l !== 'object') fail('Each line must be an object', 400, 'bad-request');
      if (!Number.isFinite(Number(l.qty)) || Number(l.qty) <= 0) fail('Every line needs a quantity above zero');
      if (!Number.isFinite(Number(l.truckNo)) || Number(l.truckNo) < 1) fail('Truck numbers start at 1');
      const product = bundle.products.find((x) => x.id === l.productId);
      if (!product) fail(`Unknown product ${l.productId}`);
      if (product!.supplierId !== supplierId) fail(`${product!.brand} ${product!.pack} is not supplied by this export section`);
      if (!bundle.routes.some((r) => r.id === l.routeId)) fail(`Unknown route ${l.routeId}`);
      if (!bundle.receivingCompanies.some((r) => r.id === l.deliveredToId)) fail(`Unknown receiving company ${l.deliveredToId}`);
      if (director && l.price !== undefined && (!Number.isFinite(Number(l.price)) || Number(l.price) < 0)) fail('Price must be a number ≥ 0');
      if (l.exceptionReason !== undefined && (typeof l.exceptionReason !== 'string' || l.exceptionReason.length > 500)) fail('A reason must be text (max 500 characters)', 400, 'bad-request');
      const old = typeof l.id === 'string' ? prev.find((x) => x.id === l.id) : undefined;
      if (old && out.some((x) => x.id === old.id)) fail('A line appears twice', 400, 'bad-request');
      const listPrice = old && old.productId === l.productId ? old.price : priceOf(l.productId);
      out.push({
        id: old?.id ?? uid('pl'), truckNo: Math.round(Number(l.truckNo)), productId: l.productId, qty: Math.round(Number(l.qty)),
        price: director && l.price !== undefined ? Number(l.price) : listPrice || Number(l.price) || 0, deliveredToId: l.deliveredToId, routeId: l.routeId,
        ...(old?.alternativeFor ? { alternativeFor: old.alternativeFor } : {}),
        ...(typeof l.exceptionReason === 'string' && l.exceptionReason.trim() ? { exceptionReason: l.exceptionReason.trim() } : {}),
      });
    }
    if (!out.length) fail('Add at least one truck line');
    return out;
  }
  private header(input: Partial<PoInput>, cur?: { title: string; requiredBy: string; currency: Plan['currency']; instruction: string }) {
    const title = input.title ?? cur?.title ?? '';
    if (typeof title !== 'string' || title.length > 200) fail('Title must be text (max 200 characters)', 400, 'bad-request');
    if (!title.trim()) fail('Give the purchase order a title, e.g. “October ’26 Order”');
    const instruction = input.instruction ?? cur?.instruction ?? INSTRUCTION;
    if (typeof instruction !== 'string' || instruction.length > 1000) fail('Instruction must be text (max 1000 characters)', 400, 'bad-request');
    const requiredBy = input.requiredBy ?? cur?.requiredBy ?? iso(Date.now() + 10 * 864e5).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(requiredBy)) fail('Required-by must be a date (YYYY-MM-DD)', 400, 'bad-request');
    const currency = (input.currency ?? cur?.currency ?? 'USD') as Plan['currency'];
    if (!['USD', 'KES', 'UGX', 'TZS', 'RWF'].includes(currency)) fail('Unknown currency', 400, 'bad-request');
    return { title: title.trim(), instruction: instruction.trim() || INSTRUCTION, requiredBy, currency };
  }

  // ---- Create ------------------------------------------------------------------------------------------------------
  /** "Create purchase order": issued at once (approved automatically) — or awaiting a director when approvals are on. */
  async createPo(p: Principal, input: PoInput) {
    if (!has(p, ...PO_EDITORS) || !this.seesPlans(p)) forbidden('Only planners and directors create purchase orders');
    if (!input || typeof input !== 'object') fail('Send the purchase order', 400, 'bad-request');
    const entityId = writeEntity(p, typeof input.entityId === 'string' ? input.entityId : undefined);
    const { bundle } = await this.ref.get();
    const e = bundle.entities.find((x) => x.id === entityId) ?? notFound('Entity');
    const sup = bundle.suppliers.find((s) => s.id === input.supplierId) ?? notFound('Supplier');
    if (!isDirector(p) && !seesPair(p, entityId, sup.id)) forbidden(`${e.shortName || e.code}–${sup.code} is not one of your buyer–supplier pairs`);
    if ((e as { active?: boolean }).active === false || (sup as { active?: boolean }).active === false) fail(`${(e as { active?: boolean }).active === false ? e.name : sup.name} is deactivated`, 409, 'inactive');
    const head = this.header(input);
    const date = typeof input.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : iso().slice(0, 10);
    const raw = await this.cleanLines(p, sup.id, input.lines);
    const awaiting = appConfig.approvals.purchaseOrders;
    const result = await db.transaction(async (tx) => {
      const refs = (await tx.select({ ref: t.plans.ref }).from(t.plans)).map((r) => r.ref);
      const ref = nextRef(refs, e.poPrefix, Number(date.slice(0, 4)));
      const k = await this.planLinks(entityId, tx);
      const at = iso();
      let plan: Plan = { id: uid('plan'), ref, title: head.title, entityId, supplierId: sup.id, currency: head.currency, date, requiredBy: head.requiredBy,
        status: awaiting ? 'Submitted' : 'Approved', version: 1, lines: raw, createdById: p.id,
        history: [{ at, byUserId: p.id, action: 'created' }, ...(awaiting ? [] : [{ at, byUserId: p.id, action: 'issued' as const, comment: 'Approved automatically' }])] };
      plan = applyPlanLinks(plan, k.periodPlans, k.orders, k.destOf); // PO-06/07 marks (informational)
      const po: PurchaseOrder = { id: uid('po'), ref, planId: plan.id, entityId, supplierId: sup.id, currency: head.currency, date, title: head.title, instruction: head.instruction, version: 1,
        approvedById: awaiting ? '' : p.id, approvedAt: at, approval: 'issued', status: awaiting ? 'Awaiting approval' : 'Issued' };
      plan.poId = po.id;
      await tx.insert(t.plans).values({ ...plan, poId: po.id });
      await tx.insert(t.pos).values({ ...po, sentAt: null, signature: null, status: po.status! });
      await this.snapshot(tx, po, plan, po.id, 0, 'original', [], null, p.id, at);
      const cases = plan.lines.reduce((a, l) => a + l.qty, 0);
      if (awaiting) {
        await this.notify.notify(tx, 'Purchase order awaiting approval', `${ref} · ${plan.title} · ${n(cases)} cases · by ${p.name}`, `#/pos/${po.id}`, ['director'], { email: true, entityId });
      } else {
        await this.syncLoadings(tx, po, plan);
        await this.notify.notify(tx, 'Purchase order created', `${ref} · ${plan.title} · ${n(cases)} cases · approved automatically · by ${p.name}`, `#/pos/${po.id}`, ['planner', 'director'], { email: true, entityId });
        await this.trucksToLoad(tx, plan);
      }
      auditNote({ recordType: 'po', recordId: po.id, entityId, summary: `${ref} created${awaiting ? ' · awaiting approval' : ` · ${approvalText(po, p.name)}`}`, after: { ref, status: po.status, lines: plan.lines.length, cases } });
      return po;
    });
    return { ...result, stage: poStage(result, [], []) };
  }

  /** Approve (signature required) or reject (comment required → soft-deleted) a PO awaiting approval. Approvals on only. */
  async decidePo(p: Principal, id: string, action: 'approved' | 'rejected', comment?: string, signature?: string) {
    if (!has(p, 'director')) forbidden('Only directors approve purchase orders');
    if (!appConfig.approvals.purchaseOrders) fail('Director approval of purchase orders is switched off (config.toml) — POs are approved automatically on create', 409, 'approvals-off');
    if (action !== 'approved' && action !== 'rejected') fail('action must be approved or rejected', 400, 'bad-request');
    const { po } = await this.chain(p, id, 'edit');
    if (po.status !== 'Awaiting approval') fail('Only purchase orders awaiting approval can be decided', 409, 'state');
    if (action === 'approved' && !signature) fail('Signature required to approve');
    if (action === 'approved' && !isUsableImage(signature)) fail('The signature image could not be read — sign again');
    if (action === 'rejected' && !comment?.trim()) fail('Add a comment for the planner');
    if (action === 'rejected') return this.deletePo(p, po.id, `Rejected by ${p.name}: ${comment!.trim()}`, true);
    const out = await db.transaction(async (tx) => this.approveTx(tx, po, p.id, signature, 'director', comment, p.name));
    auditNote({ recordType: 'po', recordId: po.id, entityId: po.entityId, summary: `${po.ref} approved by ${p.name}` });
    return out;
  }
  /** Awaiting approval → Issued: the PO, its loadings and the "New trucks to load" notification (director or automatic). */
  private async approveTx(tx: Tx, po: PurchaseOrder, byUserId: string, signature: string | undefined, approval: 'director' | 'issued', comment?: string, byName = 'system') {
    const [planRow] = await tx.select().from(t.plans).where(eq(t.plans.id, po.planId));
    const plan = map.plan(planRow);
    const at = iso();
    plan.status = 'Approved';
    plan.history.push({ at, byUserId, action: approval === 'director' ? 'approved' : 'issued', ...(approval === 'issued' ? { comment: 'Approved automatically' } : comment ? { comment } : {}), ...(signature ? { signature } : {}) });
    await tx.update(t.plans).set({ status: plan.status, history: plan.history, updatedAt: at }).where(eq(t.plans.id, plan.id));
    const next: PurchaseOrder = { ...po, status: 'Issued', approvedById: byUserId, approvedAt: at, approval, signature };
    await tx.update(t.pos).set({ status: 'Issued', approvedById: byUserId, approvedAt: at, approval, signature: signature ?? null }).where(eq(t.pos.id, po.id));
    await this.syncLoadings(tx, next, plan);
    await this.notify.notify(tx, 'Purchase order approved', `${po.ref} · ${approval === 'director' ? `approved by ${byName}` : 'approved automatically'}`, `#/pos/${po.id}`, ['planner'], { email: true, entityId: po.entityId });
    await this.trucksToLoad(tx, plan);
    return next;
  }

  // ---- Update = next revision ----------------------------------------------------------------------------------------
  /** Office update: the next revision of the PO (never an overwrite). Lines already loaded can't drop below what was loaded;
   *  a fully loaded PO is refused. Loadings and shipments follow the new revision. */
  async updatePo(p: Principal, id: string, input: PoUpdateInput) {
    if (!has(p, ...PO_EDITORS)) forbidden('Only planners and directors update purchase orders');
    if (!input || typeof input !== 'object') fail('Send the changes', 400, 'bad-request');
    const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
    if (!reason) fail('Give a reason for the update — it is kept with the revision');
    if (reason.length > 500) fail('Reason: at most 500 characters', 400, 'bad-request');
    const { po: cur0 } = await this.chain(p, id, 'edit');
    const res = await db.transaction(async (tx) => {
      // serialise with loadings of this order (a loading revision repoints the chain)
      const [cur1] = await tx.select().from(t.pos).where(eq(t.pos.id, cur0.id)).for('update');
      const cur = map.po(cur1);
      if (cur.supersededById) fail('This purchase order changed meanwhile — reload and try again', 409, 'stale');
      const [planRow] = await tx.select().from(t.plans).where(eq(t.plans.id, cur.planId));
      const prev = map.plan(planRow);
      const lines0 = await this.cleanLines(p, cur.supplierId, input.lines, prev.lines);
      const head = this.header(input, { title: prev.title, requiredBy: prev.requiredBy, currency: prev.currency, instruction: cur.instruction });
      const lds = (await tx.select().from(t.loadings).where(eq(t.loadings.poId, cur.id))).map(map.loading);
      const { loadedTrucks, loaded } = loadedOf(lds);
      const truckCount = new Set(prev.lines.map((l) => l.truckNo)).size;
      const block = poUpdateBlock(cur, prev.lines, lines0, loadedTrucks, loaded, Math.max(truckCount, lds.length));
      if (block) fail(block, 409, 'locked');
      const k = await this.planLinks(cur.entityId, tx);
      const lines = applyPlanLinks({ ...prev, lines: lines0 }, k.periodPlans, k.orders, k.destOf).lines;
      const changes = diffPoLines(prev.lines, lines, 'updated');
      const headChanged = head.title !== prev.title || head.requiredBy !== prev.requiredBy || head.currency !== prev.currency || head.instruction !== cur.instruction;
      if (!changes.length && !headChanged) fail('Nothing changed — the purchase order stays as it is', 422, 'unchanged');
      const baseId = cur.revisionOf ?? cur.id;
      const chain = (await tx.select().from(t.pos).where(or(eq(t.pos.id, baseId), eq(t.pos.revisionOf, baseId)))).map(map.po);
      const base = chain.find((x) => x.id === baseId)!;
      const no = nextRevisionNo(chain);
      const ref = revisionRef(base.ref, appConfig.loading.revisionSuffix, no);
      const at = iso();
      const poId = uid('po'), planId = uid('plan');
      const plan: Plan = { ...prev, id: planId, ref, title: head.title, requiredBy: head.requiredBy, currency: head.currency, lines, poId, revisionOf: base.planId, revision: no,
        history: [...prev.history, { at, byUserId: p.id, action: 'updated', comment: reason }] };
      delete plan.supersededById;
      const next: PurchaseOrder = { ...cur, id: poId, ref, planId, title: head.title, instruction: head.instruction, currency: head.currency, version: 1, approvedById: p.id, approvedAt: at,
        signature: undefined, sentAt: undefined, approval: 'update', revisionOf: baseId, revision: no, changes: [], revisionReason: reason, revisionKind: 'updated', lineChanges: changes };
      delete next.supersededById; delete next.createdBy; delete next.onBehalfOfId;
      await tx.insert(t.plans).values({ ...plan, poId, revisionOf: base.planId, revision: no, supersededById: null });
      await tx.insert(t.pos).values({ ...next, sentAt: null, signature: null, status: next.status ?? 'Issued', changes: [], revisionReason: reason, createdBy: null, onBehalfOfId: null, supersededById: null, revisionKind: 'updated', lineChanges: changes, deletedAt: null, deletedById: null, deleteReason: null });
      await tx.update(t.plans).set({ supersededById: planId, updatedAt: at }).where(eq(t.plans.id, prev.id));
      await tx.update(t.pos).set({ supersededById: poId }).where(eq(t.pos.id, cur.id));
      await tx.update(t.loadings).set({ poId }).where(eq(t.loadings.poId, cur.id));
      await tx.update(t.shipments).set({ poId }).where(eq(t.shipments.poId, cur.id));
      await this.snapshot(tx, next, plan, baseId, no, 'updated', changes, reason, p.id, at);
      if (next.status === 'Issued') await this.syncLoadings(tx, next, plan);
      const { bundle } = await this.ref.get();
      const name = (pid: string) => bundle.products.find((x) => x.id === pid)?.brand ?? pid;
      const summary = changes.slice(0, 3).map((c) => lineChangeText(c, name)).join('; ') + (changes.length > 3 ? ` (+${changes.length - 3} more)` : '');
      await this.notify.notify(tx, 'Purchase order updated', `${cur.ref} → ${ref} · ${summary || 'header changed'} · “${reason}” · by ${p.name}`, `#/pos/${poId}`, ['planner', 'director', ...(next.status === 'Issued' ? ['loader', 'operations', 'fleet'] as const : [])], { email: true, entityId: cur.entityId });
      auditNote({ recordType: 'po', recordId: poId, entityId: cur.entityId, summary: `${cur.ref} updated → ${ref}: ${reason}`, before: { ref: cur.ref, lines: prev.lines.length }, after: { ref, changes } });
      return next;
    });
    return res;
  }

  // ---- Delete (soft) ------------------------------------------------------------------------------------------------
  /** Soft delete while nothing is loaded: status Deleted (kept with its ref and reason), pending loadings removed. */
  async deletePo(p: Principal, id: string, reason: string, rejected = false) {
    if (!has(p, ...PO_EDITORS)) forbidden('Only planners and directors delete purchase orders');
    const why = typeof reason === 'string' ? reason.trim() : '';
    if (!why) fail('Give a reason for deleting the purchase order');
    if (why.length > 500) fail('Reason: at most 500 characters', 400, 'bad-request');
    const { po: cur0 } = await this.chain(p, id, 'edit');
    return db.transaction(async (tx) => {
      const [r] = await tx.select().from(t.pos).where(eq(t.pos.id, cur0.id)).for('update');
      const cur = map.po(r);
      const baseId = cur.revisionOf ?? cur.id;
      const ids = (await tx.select({ id: t.pos.id, planId: t.pos.planId }).from(t.pos).where(or(eq(t.pos.id, baseId), eq(t.pos.revisionOf, baseId))));
      const lds = (await tx.select().from(t.loadings).where(inArray(t.loadings.poId, ids.map((x) => x.id)))).map(map.loading);
      const shs = await tx.select({ id: t.shipments.id }).from(t.shipments).where(inArray(t.shipments.poId, ids.map((x) => x.id)));
      const block = poDeleteBlock(cur, lds, shs);
      if (block) fail(block, 409, cur.status === 'Deleted' ? 'state' : 'loaded');
      const at = iso();
      await tx.update(t.pos).set({ status: 'Deleted', deletedAt: at, deletedById: p.id, deleteReason: why }).where(inArray(t.pos.id, ids.map((x) => x.id)));
      const [planRow] = await tx.select().from(t.plans).where(eq(t.plans.id, cur.planId));
      const plan = map.plan(planRow);
      plan.history.push({ at, byUserId: p.id, action: rejected ? 'rejected' : 'deleted', comment: why });
      await tx.update(t.plans).set({ status: 'Deleted', updatedAt: at }).where(inArray(t.plans.id, ids.map((x) => x.planId)));
      await tx.update(t.plans).set({ history: plan.history }).where(eq(t.plans.id, plan.id));
      // its pending loadings go (a queued truck stays in the waiting list for the next order; an assigned one goes back to waiting)
      const trucks = lds.map((l) => l.truckId).filter(Boolean);
      if (lds.length) await tx.delete(t.loadings).where(inArray(t.loadings.id, lds.map((l) => l.id)));
      if (trucks.length) await tx.update(t.waitingEntries).set({ status: 'Waiting' }).where(and(inArray(t.waitingEntries.truckId, trucks), eq(t.waitingEntries.status, 'Assigned')));
      await this.notify.notify(tx, rejected ? 'Purchase order rejected' : 'Purchase order deleted', `${cur.ref} · ${plan.title} · “${why}” · by ${p.name}`, `#/pos/${cur.id}`, ['planner', 'director', ...(lds.length ? ['loader', 'operations', 'fleet'] as const : [])], { email: true, entityId: cur.entityId });
      auditNote({ recordType: 'po', recordId: cur.id, entityId: cur.entityId, summary: `${cur.ref} ${rejected ? 'rejected' : 'deleted'}: ${why}`, before: { status: cur.status }, after: { status: 'Deleted', reason: why, loadingsRemoved: lds.length } });
      return { ...cur, status: 'Deleted' as const, stage: 'Deleted' as const, deletedAt: at, deletedById: p.id, deleteReason: why };
    });
  }

  private async snapshot(tx: Tx, po: PurchaseOrder, plan: Plan, basePoId: string, revision: number, kind: PoVersion['kind'], lineChanges: PoVersion['lineChanges'], reason: string | null, byUserId: string, at: string) {
    await tx.insert(t.poVersions).values({ poId: po.id, basePoId, planId: plan.id, entityId: po.entityId, ref: po.ref, revision, kind, title: plan.title, instruction: po.instruction, requiredBy: plan.requiredBy,
      currency: plan.currency, lines: plan.lines, lineChanges, reason, byUserId, at }).onConflictDoNothing();
  }
  private async trucksToLoad(tx: Tx, plan: Plan) {
    const lp = (await this.ref.get()).bundle.suppliers.find((s) => s.id === plan.supplierId);
    await this.notify.notify(tx, 'New trucks to load', `${plan.ref} · ${new Set(plan.lines.map((l) => l.truckNo)).size} trucks at ${lp?.code} ${lp?.city}`, '#/trucks?tab=queues', ['loader', 'operations', 'fleet'], { entityId: plan.entityId });
  }
  /** One loading per truck number: new trucks get a loading, pending ones the new quantities, trucks no longer on the PO
   *  lose their pending loading. Loaded trucks are never touched. */
  private async syncLoadings(tx: Tx, po: PurchaseOrder, plan: Plan) {
    const existing = (await tx.select().from(t.loadings).where(eq(t.loadings.poId, po.id))).map(map.loading);
    const nos = [...new Set(plan.lines.map((l) => l.truckNo))];
    for (const no of nos) {
      const lines = plan.lines.filter((l) => l.truckNo === no).map((l) => ({ planLineId: l.id, productId: l.productId, orderedQty: l.qty, loadedQty: l.qty }));
      const cur = existing.find((x) => x.truckNo === no);
      if (!cur) await tx.insert(t.loadings).values({ id: uid('ld'), entityId: po.entityId, poId: po.id, truckNo: no, truckId: '', driverId: '', loadingPointId: po.supplierId, status: 'Pending', lines, agreedTransport: 0, transportCurrency: 'USD', documents: [], loadedAt: null });
      else if (cur.status === 'Pending') await tx.update(t.loadings).set({ lines }).where(eq(t.loadings.id, cur.id));
    }
    const gone = existing.filter((x) => x.status === 'Pending' && !nos.includes(x.truckNo));
    if (gone.length) await tx.delete(t.loadings).where(inArray(t.loadings.id, gone.map((x) => x.id)));
  }

  // ---- Read -----------------------------------------------------------------------------------------------------------
  /** The PO chain a reader may see: the base, every revision, the effective (latest) PO. */
  private async chain(p: Principal, id: string, need: 'view' | 'edit' = 'view') {
    const [r] = await db.select().from(t.pos).where(eq(t.pos.id, id));
    if (!r) return notFound('Purchase order');
    assertEntity(p, r.entityId);
    const baseId = r.revisionOf ?? r.id;
    const chain = (await db.select().from(t.pos).where(or(eq(t.pos.id, baseId), eq(t.pos.revisionOf, baseId)))).map(map.po).sort((a, b) => (a.revision ?? 0) - (b.revision ?? 0));
    const effective = chain.find((x) => !x.supersededById) ?? chain.at(-1)!;
    const plan = await this.load(p, effective.planId, need);
    return { asked: map.po(r), chain, effective, po: effective, plan };
  }
  /** Purchase orders: the effective (latest) version of each order with its stage; deleted ones only with `all`. */
  async listPos(p: Principal, all = false) {
    if (!this.seesPlans(p)) return [];
    const rows = (await db.select().from(t.pos).orderBy(desc(t.pos.approvedAt))).map(map.po).filter((x) => canSeeEntity(p, x.entityId));
    const live = rows.filter((x) => !x.supersededById && (all || x.status !== 'Deleted'));
    if (!live.length) return [];
    const plans = new Map((await db.select().from(t.plans).where(inArray(t.plans.id, live.map((x) => x.planId)))).map((r) => [r.id, map.plan(r)]));
    const lds = (await db.select().from(t.loadings).where(inArray(t.loadings.poId, live.map((x) => x.id)))).map(map.loading);
    const shs = await loadShipments(db, (await db.select({ id: t.shipments.id }).from(t.shipments).where(inArray(t.shipments.poId, live.map((x) => x.id)))).map((x) => x.id));
    const baseRef = new Map(rows.map((x) => [x.id, x.ref]));
    const rc = await this.myRc(p), money = seesPrices(p);
    return live.flatMap((x) => {
      const plan = plans.get(x.planId) ?? { entityId: x.entityId, supplierId: x.supplierId, lines: [] as PlanLine[] };
      if (!orderAccess(p, plan, rc)) return [];
      const lines = orderFor(p, { ...plan, lines: plan.lines } as Plan, rc).lines;
      const stage = poStage(x, lds.filter((l) => l.poId === x.id), shs.filter((s) => s.poId === x.id));
      const out: PurchaseOrder = { ...x, stage, baseRef: x.revisionOf ? baseRef.get(x.revisionOf) ?? x.ref : x.ref, cases: lines.reduce((a, l) => a + l.qty, 0), trucks: new Set(lines.map((l) => l.truckNo)).size,
        ...(money ? { amount: Math.round(lines.reduce((a, l) => a + l.qty * (l.price ?? 0), 0) * 100) / 100 } : { pricesHidden: true }) };
      if (!money) delete out.signature;
      return [out];
    });
  }
  /** The PO (as asked), its order lines, the whole chain, every version snapshot, what was loaded and what the reader may do. */
  async getPo(p: Principal, id: string): Promise<PoDetail> {
    const c = await this.chain(p, id);
    const [planRow] = await db.select().from(t.plans).where(eq(t.plans.id, c.asked.planId));
    const plan = map.plan(planRow);
    const ids = c.chain.map((x) => x.id);
    const lds = (await db.select().from(t.loadings).where(inArray(t.loadings.poId, ids))).map(map.loading);
    const shs = await loadShipments(db, (await db.select({ id: t.shipments.id }).from(t.shipments).where(inArray(t.shipments.poId, ids))).map((x) => x.id));
    const vRows = (await db.select().from(t.poVersions).where(eq(t.poVersions.basePoId, ids[0]))).map(map.poVersion).sort((a, b) => a.revision - b.revision);
    const rc = await this.myRc(p), money = seesPrices(p);
    const versions = withChanges(vRows).map((v) => money ? v : { ...withoutPrices(v), lineChanges: v.lineChanges.map((x) => ({ ...x, before: x.before && { ...x.before, price: undefined }, after: x.after && { ...x.after, price: undefined } })) });
    const visibleVersions = versions.map((v) => ({ ...v, lines: orderFor(p, { entityId: c.effective.entityId, supplierId: c.effective.supplierId, lines: v.lines }, rc).lines }));
    const stage = poStage(c.effective, lds, shs);
    const editor = (await this.access(p, c.plan)) === 'edit' && has(p, ...PO_EDITORS);
    const { loadedTrucks, loaded } = loadedOf(lds);
    const trucks = Math.max(new Set(c.plan.lines.map((l) => l.truckNo)).size, lds.length);
    const delBlock = poDeleteBlock(c.effective, lds, shs);
    const updBlock = c.effective.status === 'Deleted' ? 'A deleted purchase order cannot be updated' : trucks > 0 && loadedTrucks.length >= trucks ? 'Every truck of this purchase order is loaded — it can no longer be updated' : null;
    const actions: PoActions = { update: editor && !updBlock, delete: editor && !delBlock, approve: has(p, 'director') && appConfig.approvals.purchaseOrders && c.effective.status === 'Awaiting approval',
      ...(delBlock ? { deleteBlocked: delBlock } : {}), ...(updBlock ? { updateBlocked: updBlock } : {}) };
    const strip = (x: PurchaseOrder): PurchaseOrder => (money ? x : (({ signature: _s, ...rest }) => ({ ...rest, pricesHidden: true }))(x));
    return {
      po: { ...strip(c.asked), stage },
      plan: await this.out(p, plan), revisions: c.chain.length > 1 ? c.chain.map(strip) : [], versions: visibleVersions, effectiveId: c.effective.id,
      loaded, actions,
    };
  }
  async markSent(p: Principal, id: string) {
    const { asked } = await this.chain(p, id, 'edit');
    if (asked.status === 'Deleted') fail('A deleted purchase order is not sent', 409, 'state');
    if (asked.status === 'Awaiting approval') fail('Approve the purchase order before sending it', 409, 'state');
    const at = iso();
    await db.update(t.pos).set({ sentAt: at }).where(eq(t.pos.id, id));
    return { ...asked, sentAt: at };
  }

  /** Data handed to the PDF port's 'po-letter' template (§7.1/§7.2 layout). Any version of the chain has its own letter. */
  async poLetterData(p: Principal, id: string): Promise<PoLetterData> {
    if (!seesPrices(p)) forbidden('The PO letter shows prices — loaders and receivers see the quantities on screen');
    const { asked: po, chain } = await this.chain(p, id);
    const [planRow] = await db.select().from(t.plans).where(eq(t.plans.id, po.planId));
    const plan = map.plan(planRow);
    const { bundle } = await this.ref.get();
    const product = (pid: string) => bundle.products.find((x) => x.id === pid);
    const e = (await entityById(db, po.entityId)) ?? notFound('Company');
    const s = bundle.suppliers.find((x) => x.id === po.supplierId)!;
    const approver = bundle.users.find((u) => u.id === po.approvedById);
    const preparer = bundle.users.find((u) => u.id === plan.createdById);
    const base = chain[0];
    const name = (pid: string) => { const x = product(pid); return x ? `${x.brand} ${x.pack}` : pid; };
    const changeText = (c: NonNullable<PurchaseOrder['changes']>[number]) => c.kind === 'alternative'
      ? `Truck ${c.truckNo}: ${name(c.productId)} +${n(c.loaded)} cases (alternative${c.replacesPlanLineId ? ` for ${name(plan.lines.find((l) => l.id === c.replacesPlanLineId)?.productId ?? '') || 'a missing item'}` : ''})`
      : `Truck ${c.truckNo}: ${name(c.productId)} ordered ${n(c.ordered)} → loaded ${n(c.loaded)}${c.kind === 'missing' ? ' (missing)' : ''}`;
    const auto = po.approval === 'issued';
    const who = approver?.name ?? (po.approvedById === SYSTEM ? 'System' : '');
    const changes = po.revisionKind === 'updated' ? (po.lineChanges ?? []).map((c) => lineChangeText(c, name)) : (po.changes ?? []).map(changeText);
    const awaiting = po.status === 'Awaiting approval';
    return {
      mode: po.approval === 'director' || !po.approval ? 'approved' : 'issued',
      ...(auto ? { issuedLabel: 'Approved automatically', stampText: `APPROVED AUTOMATICALLY ${po.approvedAt.slice(0, 10)} · ${who}` } : {}),
      ...(po.approval === 'update' ? { issuedLabel: 'Updated by', stampText: `REVISION ${po.revision} · UPDATED ${po.approvedAt.slice(0, 10)} by ${who}` } : {}),
      ...(po.revisionOf ? { revision: { n: po.revision ?? 1, of: base.ref, changes, kind: po.revisionKind ?? 'revised at loading', at: po.approvedAt, ...(po.revisionKind === 'updated' && po.revisionReason ? { reason: po.revisionReason } : {}) } } : {}),
      entity: pdfEntity(e), date: po.date, ref: po.ref, title: po.title, version: po.version,
      addressedTo: { section: 'The Export Section', name: s.code, city: s.city, country: s.country }, instruction: po.instruction, currency: po.currency,
      lines: [...plan.lines].sort((a, b) => a.truckNo - b.truckNo).map((l) => ({ truckNo: l.truckNo, brand: product(l.productId)?.brand ?? '', pack: product(l.productId)?.pack ?? '', qty: l.qty, price: l.price })),
      preparedBy: { name: preparer?.name ?? '', title: 'Operations officer' },
      ...(awaiting ? {} : { approvedBy: { name: po.approval === 'revision' ? `${who || 'Loader'} (at loading)` : who, title: po.approval === 'director' || !po.approval ? 'Director' : po.approval === 'revision' ? 'System revision' : undefined, at: po.approvedAt, signature: po.signature && (po.signature.startsWith('data:') || /^[a-f0-9]{40}\./.test(po.signature)) ? po.signature : undefined } }),
    };
  }
  async poPdf(p: Principal, id: string) { return this.pdf.render('po-letter', await this.poLetterData(p, id)); }

  /** PO-03: email the PO letter (or the revised letter) to the supplier export section and record when it was sent. */
  async sendPo(p: Principal, id: string) {
    const data = await this.poLetterData(p, id);
    const { asked: po } = await this.chain(p, id, 'edit');
    if (po.status !== 'Issued') fail(po.status === 'Deleted' ? 'A deleted purchase order is not sent' : 'Approve the purchase order before sending it', 409, 'state');
    const pdf = await this.pdf.render('po-letter', data);
    const supplier = (await this.ref.get()).bundle.suppliers.find((x) => x.id === po.supplierId)!;
    const rev = data.revision ? `Revision ${data.revision.n} of ${data.revision.of} — ` : '';
    await this.mail.send({ to: supplier.email, subject: `${data.entity.name} — ${rev}${data.title} / ${data.ref}`,
      text: `Dear ${supplier.name},\n\n${data.revision ? `Please note our ${data.revision.kind === 'updated' ? 'updated' : 'revised'} order ${data.ref} (revision ${data.revision.n} of ${data.revision.of}); it replaces the earlier version.\n${data.revision.changes.map((c) => `• ${c}`).join('\n')}\n\n` : ''}${data.instruction}\n\nPlease find our order ${data.ref} attached.\n\n${data.entity.name}`,
      attachments: [{ filename: `${data.ref}.pdf`, content: pdf, contentType: 'application/pdf' }] });
    return this.markSent(p, id);
  }
}

/** Trucks already loaded and cases loaded per order line. */
function loadedOf(lds: Loading[]) {
  const loaded: Record<string, number> = {};
  const loadedTrucks: number[] = [];
  for (const l of lds) if (l.status === 'Loaded') { loadedTrucks.push(l.truckNo); for (const x of l.lines) loaded[x.planLineId] = (loaded[x.planLineId] ?? 0) + x.loadedQty; }
  return { loaded, loadedTrucks };
}
/** Versions stored before line-change records existed (migration 0011 backfill) get them from the previous snapshot. */
function withChanges(vs: PoVersion[]): PoVersion[] {
  return vs.map((v, i) => (v.revision > 0 && !v.lineChanges.length && vs[i - 1] ? { ...v, lineChanges: diffPoLines(vs[i - 1].lines, v.lines, v.kind === 'updated' ? 'updated' : 'revised at loading') } : v));
}
