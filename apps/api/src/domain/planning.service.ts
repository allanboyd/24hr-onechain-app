import { Inject, Injectable } from '@nestjs/common';
import { desc, eq, or } from 'drizzle-orm';
import { db, schema as t, type Tx } from '../db/client';
import { applyPlanLinks, hasFeature, nextRef, planContext, PO_EDITORS } from '@btw/api/rules';
import type { PeriodPlan, Plan, PlanLine, PurchaseOrder } from '@btw/api/types';
import { fail, forbidden, notFound } from '../common/errors';
import { isUsableImage } from '../common/images';
import { iso, uid } from '../common/ids';
import { assertEntity, canSeeEntity, has, writeEntity, type Principal } from '../auth/principal';
import { isDirector, orderAccess, orderFor, seesPair, seesPrices } from '@btw/api/access';
import { auditNote } from '../common/audit-context';
import { entityById, pdfEntity } from './companies';
import { MAIL, PDF, type MailPort, type PdfPort, type PoLetterData } from '../integrations/ports';
import { NotifyService } from './notify.service';
import { appConfig } from '../config/app-config';
import { RefService } from './ref.service';
import { map } from './store';

const INSTRUCTION = 'Kindly process and avail stock for loading.';

@Injectable()
export class PlanningService {
  constructor(private ref: RefService, private notify: NotifyService, @Inject(PDF) private pdf: PdfPort, @Inject(MAIL) private mail: MailPort) {}

  /** Roles document §7: directors all orders; Kabonge his buyer–supplier pairs (edit); loaders and Testfie the orders
   *  loading at their points (view, loaders without prices); receivers the orders delivering to them (their lines, no prices). */
  private seesPlans = (p: Principal) => hasFeature(p.roles, 'purchase-orders');
  /** Receiving companies of the user's warehouses. */
  private async myRc(p: Principal) { const { bundle } = await this.ref.get(); return [...new Set(bundle.warehouses.filter((w) => p.warehouseIds.includes(w.id)).map((w) => w.receivingCompanyId))]; }
  private async access(p: Principal, plan: Pick<Plan, 'entityId' | 'supplierId' | 'lines'>) { return this.seesPlans(p) && canSeeEntity(p, plan.entityId) ? orderAccess(p, plan, await this.myRc(p)) : null; }
  /** The order as this reader may see it (404 outside scope). */
  private async load(p: Principal, id: string, need: 'view' | 'edit' = 'view') {
    const [r] = await db.select().from(t.plans).where(eq(t.plans.id, id));
    if (!r) return notFound('Plan');
    assertEntity(p, r.entityId);
    const plan = map.plan(r);
    const a = await this.access(p, plan);
    if (!a) forbidden();
    if (need === 'edit' && a !== 'edit') forbidden('This order is not one of your buyer–supplier pairs');
    return plan;
  }
  private async out(p: Principal, plan: Plan) { return orderFor(p, plan, await this.myRc(p)); }

  /** Approved/other period plans and orders of a company, and a line → destination warehouse lookup (PO-06). */
  private async planLinks(entityId: string) {
    const [pps, orders, { bundle }] = await Promise.all([
      db.select().from(t.periodPlans).where(eq(t.periodPlans.entityId, entityId)), db.select().from(t.plans).where(eq(t.plans.entityId, entityId)), this.ref.get(),
    ]);
    const destOf = (l: PlanLine) => { const cp = bundle.routes.find((r) => r.id === l.routeId)?.stops.at(-1)?.checkpointId; return bundle.warehouses.find((w) => w.checkpointId === cp)?.id; };
    return { periodPlans: pps.map(map.periodPlan) as PeriodPlan[], orders: orders.map(map.plan), destOf };
  }
  /** PO-06: each order line against the approved period plan — planned, ordered before, this PO, remaining, over/unplanned. */
  async planContext(p: Principal, id: string) {
    const plan = await this.load(p, id);
    const k = await this.planLinks(plan.entityId);
    return planContext(plan, k.periodPlans, k.orders, k.destOf);
  }

  /** Orders (PO drafts). Revision copies made at loading are not listed: they are reached from their PO. */
  async list(p: Principal) {
    if (!this.seesPlans(p)) return [];
    const rows = await db.select().from(t.plans).orderBy(desc(t.plans.date));
    const rc = await this.myRc(p);
    return rows.map(map.plan).filter((x) => !x.revisionOf && canSeeEntity(p, x.entityId) && orderAccess(p, x, rc)).map((x) => orderFor(p, x, rc));
  }
  async get(p: Principal, id: string) { return this.out(p, await this.load(p, id)); }

  async create(p: Principal, entityId: string, supplierId: string) {
    if (!has(p, ...PO_EDITORS)) forbidden('Only planners create plans');
    entityId = writeEntity(p, typeof entityId === 'string' ? entityId : undefined);
    const { bundle } = await this.ref.get();
    const e = bundle.entities.find((x) => x.id === entityId) ?? notFound('Entity');
    const sup = bundle.suppliers.find((s) => s.id === supplierId) ?? notFound('Supplier');
    if (!isDirector(p) && !seesPair(p, entityId, supplierId)) forbidden(`${e.shortName || e.code}–${sup.code} is not one of your buyer–supplier pairs`);
    if ((e as { active?: boolean }).active === false || (sup as { active?: boolean }).active === false) fail(`${(e as { active?: boolean }).active === false ? e.name : sup.name} is deactivated`, 409, 'inactive');
    return db.transaction(async (tx) => {
      const refs = (await tx.select({ ref: t.plans.ref }).from(t.plans)).map((r) => r.ref);
      const plan: Plan = {
        id: uid('plan'), ref: nextRef(refs, e.poPrefix, new Date().getFullYear()), title: '', entityId, supplierId, currency: 'USD',
        date: iso().slice(0, 10), requiredBy: iso(Date.now() + 10 * 864e5).slice(0, 10), status: 'Draft', version: 1, lines: [], history: [], createdById: p.id,
      };
      await tx.insert(t.plans).values({ ...plan, poId: null });
      auditNote({ recordType: 'plan', recordId: plan.id, summary: `${plan.ref} created`, entityId });
      return plan;
    });
  }

  /** PL-01: save a draft/returned plan. Locked once approved (PL-03); prices come from the price list unless a director overrides. */
  async save(p: Principal, id: string, input: Partial<Plan>) {
    const cur = await this.load(p, id, 'edit');
    if (cur.status === 'Approved') fail('Approved plans are locked — create an amendment (PL-04)', 409, 'locked');
    if ((cur.status === 'Submitted' && appConfig.approvals.purchaseOrders) || cur.status === 'Rejected') fail(`A ${cur.status.toLowerCase()} plan cannot be edited`, 409, 'locked');
    if (!has(p, ...PO_EDITORS)) forbidden('Only planners edit plans');
    const priceOf = await this.ref.priceOf();
    const director = has(p, 'director');
    if (input.lines !== undefined && !Array.isArray(input.lines)) fail('lines must be a list', 400, 'bad-request');
    if (input.title !== undefined && (typeof input.title !== 'string' || input.title.length > 200)) fail('Title must be text (max 200 characters)', 400, 'bad-request');
    const { bundle } = await this.ref.get();
    for (const l of input.lines ?? []) {
      if (!l || typeof l !== 'object') fail('Each line must be an object', 400, 'bad-request');
      if (!Number.isFinite(Number(l.qty)) || Number(l.qty) < 0) fail('Quantities cannot be negative');
      if (!Number.isFinite(Number(l.truckNo)) || Number(l.truckNo) < 1) fail('Truck numbers start at 1');
      const product = bundle.products.find((x) => x.id === l.productId);
      if (!product) fail(`Unknown product ${l.productId}`);
      if (product!.supplierId !== cur.supplierId) fail(`${product!.brand} ${product!.pack} is not supplied by this export section`);
      if (!bundle.routes.some((r) => r.id === l.routeId)) fail(`Unknown route ${l.routeId}`);
      if (!bundle.receivingCompanies.some((r) => r.id === l.deliveredToId)) fail(`Unknown receiving company ${l.deliveredToId}`);
      if (director && (!Number.isFinite(Number(l.price)) || Number(l.price) < 0)) fail('Price must be a number ≥ 0');
    }
    for (const l of input.lines ?? []) if (l.exceptionReason !== undefined && (typeof l.exceptionReason !== 'string' || l.exceptionReason.length > 500)) fail('A reason must be text (max 500 characters)', 400, 'bad-request');
    const raw: PlanLine[] = (input.lines ?? cur.lines).map((l) => ({
      id: l.id || uid('pl'), truckNo: Math.max(1, Math.round(l.truckNo)), productId: l.productId, qty: Math.max(0, Math.round(l.qty)),
      price: director ? Number(l.price) : priceOf(l.productId) || Number(l.price), deliveredToId: l.deliveredToId, routeId: l.routeId,
      ...(typeof l.periodLineId === 'string' && l.periodLineId ? { periodLineId: l.periodLineId } : {}),
      ...(typeof l.exceptionReason === 'string' && l.exceptionReason.trim() ? { exceptionReason: l.exceptionReason.trim() } : {}),
    }));
    const date = input.date ?? cur.date;
    const k = await this.planLinks(cur.entityId);
    // PO-06/07: link each line to the approved period plan covering the date; mark over-plan / unplanned lines.
    const lines = applyPlanLinks({ ...cur, date, lines: raw }, k.periodPlans, k.orders, k.destOf).lines;
    const next = { title: input.title ?? cur.title, date, requiredBy: input.requiredBy ?? cur.requiredBy, currency: (input.currency ?? cur.currency) as Plan['currency'], lines, updatedAt: iso() };
    await db.update(t.plans).set(next).where(eq(t.plans.id, id));
    return { ...cur, ...next };
  }

  /** With approvals.purchase_orders = true: send for director approval. With false (the default): "Issue purchase order" —
   *  the PO is created at once (approvedBy = the issuer), loadings exactly as on approval. Period plans gate nothing. */
  async submit(p: Principal, id: string) {
    if (!has(p, ...PO_EDITORS)) forbidden('Only planners submit plans');
    const plan = await this.load(p, id, 'edit');
    auditNote({ recordType: 'plan', recordId: id, summary: `${plan.ref} ${appConfig.approvals.purchaseOrders ? 'submitted' : 'issued'}`, entityId: plan.entityId });
    const issue = !appConfig.approvals.purchaseOrders;
    const from = issue ? ['Draft', 'Returned', 'Submitted'] : ['Draft', 'Returned'];
    if (!from.includes(plan.status)) fail(`Only draft or returned plans can be ${issue ? 'issued' : 'submitted'} (now ${plan.status})`, 409, 'state');
    if (!plan.lines.length) fail('Add at least one line');
    if (plan.lines.some((l) => l.qty <= 0)) fail('Every line needs a quantity above zero');
    const k = await this.planLinks(plan.entityId);
    plan.lines = applyPlanLinks(plan, k.periodPlans, k.orders, k.destOf).lines; // informational marks only (PO-06/07)
    if (issue) {
      plan.status = 'Approved'; plan.history.push({ at: iso(), byUserId: p.id, action: 'issued' });
      await db.transaction(async (tx) => {
        await this.createPo(tx, plan, p.id, undefined, 'issued');
        await tx.update(t.plans).set({ status: plan.status, lines: plan.lines, history: plan.history, poId: plan.poId ?? null, updatedAt: iso() }).where(eq(t.plans.id, id));
        const cases = plan.lines.reduce((a, l) => a + l.qty, 0);
        await this.notify.notify(tx, 'Purchase order issued', `${plan.ref} · ${plan.title} · ${cases.toLocaleString('en-US')} cases · by ${p.name}`, `#/pos/${plan.poId}`, ['planner', 'director'], { email: true, entityId: plan.entityId });
        await this.trucksToLoad(tx, plan);
      });
      return plan;
    }
    plan.status = 'Submitted'; plan.history.push({ at: iso(), byUserId: p.id, action: 'submitted' });
    await db.transaction(async (tx) => {
      await tx.update(t.plans).set({ status: plan.status, lines: plan.lines, history: plan.history, updatedAt: iso() }).where(eq(t.plans.id, id));
      const cases = plan.lines.reduce((a, l) => a + l.qty, 0);
      await this.notify.notify(tx, 'Plan awaiting approval', `${plan.ref} · ${plan.title} · ${cases.toLocaleString('en-US')} cases`, `#/plans/${plan.id}`, ['director'], { email: true, entityId: plan.entityId });
    });
    return plan;
  }

  /** The PO for an approved/issued order (new, or the next version of an amended one) and its loadings. Same path for approval and issue. */
  private async createPo(tx: Tx, plan: Plan, byUserId: string, signature: string | undefined, approval: 'director' | 'issued') {
    await tx.insert(t.planVersions).values({ planId: plan.id, version: plan.version, snapshot: plan, byUserId }).onConflictDoNothing();
    if (plan.poId) { // re-approval of an amendment: same PO, new version (PL-04)
      await tx.update(t.pos).set({ version: plan.version, title: plan.title, approvedById: byUserId, approvedAt: iso(), signature: signature ?? null, approval }).where(eq(t.pos.id, plan.poId));
      const [po] = await tx.select().from(t.pos).where(eq(t.pos.id, plan.poId));
      await this.syncLoadings(tx, map.po(po), plan);
    } else {
      const po: PurchaseOrder = { id: uid('po'), ref: plan.ref, planId: plan.id, entityId: plan.entityId, supplierId: plan.supplierId, currency: plan.currency, date: plan.date, title: plan.title, instruction: INSTRUCTION, version: plan.version, approvedById: byUserId, approvedAt: iso(), signature, approval };
      await tx.insert(t.pos).values({ ...po, sentAt: null, signature: signature ?? null });
      plan.poId = po.id;
      await this.syncLoadings(tx, po, plan);
    }
  }
  private async trucksToLoad(tx: Tx, plan: Plan) {
    const lp = (await this.ref.get()).bundle.suppliers.find((s) => s.id === plan.supplierId);
    await this.notify.notify(tx, 'New trucks to load', `${plan.ref} · ${new Set(plan.lines.map((l) => l.truckNo)).size} trucks at ${lp?.code} ${lp?.city}`, '#/loading', ['loader', 'operations', 'fleet'], { entityId: plan.entityId });
  }

  /** PL-02/03: approve (signature required → PO + loadings), return or reject (comment required). Only when approvals are on. */
  async decide(p: Principal, id: string, action: 'approved' | 'returned' | 'rejected', comment?: string, signature?: string) {
    if (!has(p, 'director')) forbidden('Only directors decide plans');
    if (!appConfig.approvals.purchaseOrders) fail('Director approval of purchase orders is switched off (config.toml) — the planner issues the PO', 409, 'approvals-off');
    const plan = await this.load(p, id, 'edit');
    if (plan.status !== 'Submitted') fail('Only submitted plans can be decided', 409, 'state');
    if (action === 'approved' && !signature) fail('Signature required to approve (PL-03)');
    if (action === 'approved' && !isUsableImage(signature)) fail('The signature image could not be read — sign again');
    if (action !== 'approved' && !comment?.trim()) fail('Add a comment for the planner');
    plan.status = action === 'approved' ? 'Approved' : action === 'returned' ? 'Returned' : 'Rejected';
    plan.history.push({ at: iso(), byUserId: p.id, action, comment, signature });
    await db.transaction(async (tx) => {
      if (action === 'approved') await this.createPo(tx, plan, p.id, signature, 'director');
      await tx.update(t.plans).set({ status: plan.status, history: plan.history, poId: plan.poId ?? null, updatedAt: iso() }).where(eq(t.plans.id, id));
      await this.notify.notify(tx, `Plan ${plan.status.toLowerCase()}`, `${plan.ref}${comment ? ' — ' + comment : ''}`, `#/plans/${plan.id}`, ['planner'], { email: true, entityId: plan.entityId });
      if (action === 'approved') await this.trucksToLoad(tx, plan);
    });
    return plan;
  }

  /** PL-04: reopen an approved plan as the next version, with a reason. The PO keeps the approved version until re-approval. */
  async amend(p: Principal, id: string, reason: string) {
    if (!has(p, ...PO_EDITORS)) forbidden();
    if (typeof reason !== 'string' || !reason.trim()) fail('Give a reason for the amendment');
    const plan = await this.load(p, id, 'edit');
    if (plan.status !== 'Approved') fail('Only approved plans are amended; edit drafts directly', 409, 'state');
    if (plan.supersededById || plan.revisionOf) fail('This PO was revised at loading — its trucks are being loaded; raise a new order for further changes', 409, 'revised');
    plan.version += 1; plan.status = 'Draft'; plan.history.push({ at: iso(), byUserId: p.id, action: 'amended', comment: reason });
    await db.update(t.plans).set({ version: plan.version, status: plan.status, history: plan.history, updatedAt: iso() }).where(eq(t.plans.id, id));
    return plan;
  }

  async versions(p: Principal, id: string) {
    await this.load(p, id);
    if (!seesPrices(p)) return []; // snapshots carry prices
    return db.select().from(t.planVersions).where(eq(t.planVersions.planId, id)).orderBy(desc(t.planVersions.version));
  }

  /** One loading per truck number; new trucks in an amendment get a loading, pending ones get the new quantities. */
  private async syncLoadings(tx: Tx, po: PurchaseOrder, plan: Plan) {
    const existing = (await tx.select().from(t.loadings).where(eq(t.loadings.poId, po.id))).map(map.loading);
    for (const no of [...new Set(plan.lines.map((l) => l.truckNo))]) {
      const lines = plan.lines.filter((l) => l.truckNo === no).map((l) => ({ planLineId: l.id, productId: l.productId, orderedQty: l.qty, loadedQty: l.qty }));
      const cur = existing.find((x) => x.truckNo === no);
      if (!cur) await tx.insert(t.loadings).values({ id: uid('ld'), entityId: po.entityId, poId: po.id, truckNo: no, truckId: '', driverId: '', loadingPointId: po.supplierId, status: 'Pending', lines, agreedTransport: 0, transportCurrency: 'USD', documents: [], loadedAt: null });
      else if (cur.status === 'Pending') await tx.update(t.loadings).set({ lines }).where(eq(t.loadings.id, cur.id));
    }
  }

  // ---- Purchase orders ----------------------------------------------------------
  async listPos(p: Principal) {
    if (!this.seesPlans(p)) return [];
    const rows = (await db.select().from(t.pos).orderBy(desc(t.pos.approvedAt))).map(map.po).filter((x) => canSeeEntity(p, x.entityId));
    const plans = new Map((await db.select().from(t.plans)).map((r) => [r.id, map.plan(r)]));
    const rc = await this.myRc(p), hide = !seesPrices(p);
    return rows.filter((x) => orderAccess(p, plans.get(x.planId) ?? { entityId: x.entityId, supplierId: x.supplierId, lines: [] }, rc)).map((x) => (hide ? { ...x, pricesHidden: true } : x));
  }
  /** The PO, its order lines and — for a PO revised at loading — the whole chain (original first, latest last). */
  async getPo(p: Principal, id: string) {
    const [r] = await db.select().from(t.pos).where(eq(t.pos.id, id));
    if (!r) return notFound('Purchase order');
    assertEntity(p, r.entityId);
    const [planRow] = await db.select().from(t.plans).where(eq(t.plans.id, r.planId));
    const plan = map.plan(planRow);
    if (!(await this.access(p, plan))) forbidden();
    const base = r.revisionOf ?? r.id;
    const chain = (await db.select().from(t.pos).where(or(eq(t.pos.id, base), eq(t.pos.revisionOf, base)))).map(map.po).sort((a, b) => (a.revision ?? 0) - (b.revision ?? 0));
    const hide = !seesPrices(p);
    return { po: hide ? { ...map.po(r), pricesHidden: true } : map.po(r), plan: await this.out(p, plan), revisions: chain.length > 1 ? chain : [] };
  }
  async markSent(p: Principal, id: string) {
    const { po } = await this.getPo(p, id);
    await this.load(p, po.planId, 'edit');
    await db.update(t.pos).set({ sentAt: iso() }).where(eq(t.pos.id, id));
    return { ...po, sentAt: iso() };
  }

  /** Data handed to the PDF port's 'po-letter' template (§7.1/§7.2 layout). */
  async poLetterData(p: Principal, id: string): Promise<PoLetterData> {
    if (!seesPrices(p)) forbidden('The PO letter shows prices — loaders and receivers see the quantities on screen');
    const { po, plan } = await this.getPo(p, id);
    const { bundle } = await this.ref.get();
    const product = (pid: string) => bundle.products.find((x) => x.id === pid);
    const e = (await entityById(db, po.entityId)) ?? notFound('Company');
    const s = bundle.suppliers.find((x) => x.id === po.supplierId)!;
    const approver = bundle.users.find((u) => u.id === po.approvedById);
    const preparer = bundle.users.find((u) => u.id === plan.createdById);
    const issued = po.approval === 'issued' || po.approval === 'revision';
    const base = po.revisionOf ? (await db.select({ ref: t.pos.ref }).from(t.pos).where(eq(t.pos.id, po.revisionOf)))[0]?.ref ?? po.ref : null;
    const name = (pid: string) => { const x = product(pid); return x ? `${x.brand} ${x.pack}` : pid; };
    const changeText = (c: NonNullable<PurchaseOrder['changes']>[number]) => c.kind === 'alternative'
      ? `Truck ${c.truckNo}: ${name(c.productId)} +${c.loaded.toLocaleString('en-US')} cases (alternative${c.replacesPlanLineId ? ` for ${name(plan.lines.find((l) => l.id === c.replacesPlanLineId)?.productId ?? '') || 'a missing item'}` : ''})`
      : `Truck ${c.truckNo}: ${name(c.productId)} ordered ${c.ordered.toLocaleString('en-US')} → loaded ${c.loaded.toLocaleString('en-US')}${c.kind === 'missing' ? ' (missing)' : ''}`;
    return {
      mode: issued ? 'issued' : 'approved',
      ...(po.revisionOf ? { revision: { n: po.revision ?? 1, of: base!, changes: (po.changes ?? []).map(changeText) } } : {}),
      entity: pdfEntity(e), date: po.date, ref: po.ref, title: po.title, version: po.version,
      addressedTo: { section: 'The Export Section', name: s.code, city: s.city, country: s.country }, instruction: po.instruction, currency: po.currency,
      lines: [...plan.lines].sort((a, b) => a.truckNo - b.truckNo).map((l) => ({ truckNo: l.truckNo, brand: product(l.productId)?.brand ?? '', pack: product(l.productId)?.pack ?? '', qty: l.qty, price: l.price })),
      preparedBy: { name: preparer?.name ?? '', title: 'Operations officer' },
      approvedBy: { name: po.approval === 'revision' ? `${approver?.name ?? 'Loader'} (at loading)` : approver?.name ?? '', title: po.approval === 'director' || !po.approval ? 'Director' : po.approval === 'revision' ? 'System revision' : undefined, at: po.approvedAt, signature: po.signature && (po.signature.startsWith('data:') || /^[a-f0-9]{40}\./.test(po.signature)) ? po.signature : undefined },
    };
  }
  async poPdf(p: Principal, id: string) { return this.pdf.render('po-letter', await this.poLetterData(p, id)); }

  /** PO-03: email the PO letter to the supplier export section and record when it was sent. */
  async sendPo(p: Principal, id: string) {
    const data = await this.poLetterData(p, id);
    const { po } = await this.getPo(p, id);
    await this.load(p, po.planId, 'edit');
    const pdf = await this.pdf.render('po-letter', data);
    const supplier = (await this.ref.get()).bundle.suppliers.find((x) => x.id === po.supplierId)!;
    await this.mail.send({ to: supplier.email, subject: `${data.entity.name} — ${data.title} / ${data.ref}`, text: `Dear ${supplier.name},\n\n${data.instruction}\n\nPlease find our order ${data.ref} attached.\n\n${data.entity.name}`, attachments: [{ filename: `${data.ref}.pdf`, content: pdf, contentType: 'application/pdf' }] });
    return this.markSent(p, id);
  }
}
