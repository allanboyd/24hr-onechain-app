import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { db, schema as t, type Tx } from '../db/client';
import { nextRef } from '@btw/api/rules';
import type { Plan, PlanLine, PurchaseOrder } from '@btw/api/types';
import { fail, forbidden, notFound } from '../common/errors';
import { isUsableImage } from '../common/images';
import { iso, uid } from '../common/ids';
import { canSeeEntity, has, isGlobal, type Principal } from '../auth/principal';
import { MAIL, PDF, type MailPort, type PdfPort, type PoLetterData } from '../integrations/ports';
import { NotifyService } from './notify.service';
import { RefService } from './ref.service';
import { map } from './store';

const INSTRUCTION = 'Kindly process and avail stock for loading.';

@Injectable()
export class PlanningService {
  constructor(private ref: RefService, private notify: NotifyService, @Inject(PDF) private pdf: PdfPort, @Inject(MAIL) private mail: MailPort) {}

  private assertSee(p: Principal, entityId: string) { if (!canSeeEntity(p, entityId)) forbidden(); }

  async list(p: Principal) {
    const rows = await db.select().from(t.plans).orderBy(desc(t.plans.date));
    return rows.map(map.plan).filter((x) => canSeeEntity(p, x.entityId));
  }
  async get(p: Principal, id: string) {
    const [r] = await db.select().from(t.plans).where(eq(t.plans.id, id));
    if (!r) return notFound('Plan');
    this.assertSee(p, r.entityId);
    return map.plan(r);
  }

  async create(p: Principal, entityId: string, supplierId: string) {
    if (!has(p, 'planner', 'admin') && !isGlobal(p)) forbidden('Only planners create plans');
    this.assertSee(p, entityId);
    const { bundle } = await this.ref.get();
    const e = bundle.entities.find((x) => x.id === entityId) ?? notFound('Entity');
    if (!bundle.suppliers.some((s) => s.id === supplierId)) notFound('Supplier');
    return db.transaction(async (tx) => {
      const refs = (await tx.select({ ref: t.plans.ref }).from(t.plans)).map((r) => r.ref);
      const plan: Plan = {
        id: uid('plan'), ref: nextRef(refs, e.poPrefix, new Date().getFullYear()), title: '', entityId, supplierId, currency: 'USD',
        date: iso().slice(0, 10), requiredBy: iso(Date.now() + 10 * 864e5).slice(0, 10), status: 'Draft', version: 1, lines: [], history: [], createdById: p.id,
      };
      await tx.insert(t.plans).values({ ...plan, poId: null });
      return plan;
    });
  }

  /** PL-01: save a draft/returned plan. Locked once approved (PL-03); prices come from the price list unless a director overrides. */
  async save(p: Principal, id: string, input: Partial<Plan>) {
    const cur = await this.get(p, id);
    if (cur.status === 'Approved') fail('Approved plans are locked — create an amendment (PL-04)', 409, 'locked');
    if (cur.status === 'Submitted' || cur.status === 'Rejected') fail(`A ${cur.status.toLowerCase()} plan cannot be edited`, 409, 'locked');
    if (!has(p, 'planner', 'admin') && !isGlobal(p)) forbidden('Only planners edit plans');
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
    const lines: PlanLine[] = (input.lines ?? cur.lines).map((l) => ({
      id: l.id || uid('pl'), truckNo: Math.max(1, Math.round(l.truckNo)), productId: l.productId, qty: Math.max(0, Math.round(l.qty)),
      price: director ? Number(l.price) : priceOf(l.productId) || Number(l.price), deliveredToId: l.deliveredToId, routeId: l.routeId,
    }));
    const next = { title: input.title ?? cur.title, date: input.date ?? cur.date, requiredBy: input.requiredBy ?? cur.requiredBy, currency: (input.currency ?? cur.currency) as Plan['currency'], lines, updatedAt: iso() };
    await db.update(t.plans).set(next).where(eq(t.plans.id, id));
    return { ...cur, ...next };
  }

  async submit(p: Principal, id: string) {
    const plan = await this.get(p, id);
    if (!['Draft', 'Returned'].includes(plan.status)) fail(`Only draft or returned plans can be submitted (now ${plan.status})`, 409, 'state');
    if (!plan.lines.length) fail('Add at least one line');
    if (plan.lines.some((l) => l.qty <= 0)) fail('Every line needs a quantity above zero');
    plan.status = 'Submitted'; plan.history.push({ at: iso(), byUserId: p.id, action: 'submitted' });
    await db.transaction(async (tx) => {
      await tx.update(t.plans).set({ status: plan.status, history: plan.history, updatedAt: iso() }).where(eq(t.plans.id, id));
      const cases = plan.lines.reduce((a, l) => a + l.qty, 0);
      await this.notify.notify(tx, 'Plan awaiting approval', `${plan.ref} · ${plan.title} · ${cases.toLocaleString('en-US')} cases`, `#/plans/${plan.id}`, ['director'], { email: true });
    });
    return plan;
  }

  /** PL-02/03: approve (signature required → PO + loadings), return or reject (comment required). */
  async decide(p: Principal, id: string, action: 'approved' | 'returned' | 'rejected', comment?: string, signature?: string) {
    if (!has(p, 'director')) forbidden('Only directors decide plans');
    const plan = await this.get(p, id);
    if (plan.status !== 'Submitted') fail('Only submitted plans can be decided', 409, 'state');
    if (action === 'approved' && !signature) fail('Signature required to approve (PL-03)');
    if (action === 'approved' && !isUsableImage(signature)) fail('The signature image could not be read — sign again');
    if (action !== 'approved' && !comment?.trim()) fail('Add a comment for the planner');
    plan.status = action === 'approved' ? 'Approved' : action === 'returned' ? 'Returned' : 'Rejected';
    plan.history.push({ at: iso(), byUserId: p.id, action, comment, signature });
    await db.transaction(async (tx) => {
      if (action === 'approved') {
        await tx.insert(t.planVersions).values({ planId: plan.id, version: plan.version, snapshot: plan, byUserId: p.id }).onConflictDoNothing();
        if (plan.poId) { // re-approval of an amendment: same PO, new version (PL-04)
          await tx.update(t.pos).set({ version: plan.version, title: plan.title, approvedById: p.id, approvedAt: iso(), signature: signature ?? null }).where(eq(t.pos.id, plan.poId));
          const [po] = await tx.select().from(t.pos).where(eq(t.pos.id, plan.poId));
          await this.syncLoadings(tx, map.po(po), plan);
        } else {
          const po: PurchaseOrder = { id: uid('po'), ref: plan.ref, planId: plan.id, entityId: plan.entityId, supplierId: plan.supplierId, currency: plan.currency, date: plan.date, title: plan.title, instruction: INSTRUCTION, version: plan.version, approvedById: p.id, approvedAt: iso(), signature };
          await tx.insert(t.pos).values({ ...po, sentAt: null, signature: signature ?? null });
          plan.poId = po.id;
          await this.syncLoadings(tx, po, plan);
        }
      }
      await tx.update(t.plans).set({ status: plan.status, history: plan.history, poId: plan.poId ?? null, updatedAt: iso() }).where(eq(t.plans.id, id));
      await this.notify.notify(tx, `Plan ${plan.status.toLowerCase()}`, `${plan.ref}${comment ? ' — ' + comment : ''}`, `#/plans/${plan.id}`, ['planner'], { email: true });
      if (action === 'approved') {
        const lp = (await this.ref.get()).bundle.suppliers.find((s) => s.id === plan.supplierId);
        await this.notify.notify(tx, 'New trucks to load', `${plan.ref} · ${new Set(plan.lines.map((l) => l.truckNo)).size} trucks at ${lp?.code} ${lp?.city}`, '#/loading', ['loader', 'operations', 'fleet']);
      }
    });
    return plan;
  }

  /** PL-04: reopen an approved plan as the next version, with a reason. The PO keeps the approved version until re-approval. */
  async amend(p: Principal, id: string, reason: string) {
    if (!has(p, 'planner', 'director', 'admin')) forbidden();
    if (typeof reason !== 'string' || !reason.trim()) fail('Give a reason for the amendment');
    const plan = await this.get(p, id);
    if (plan.status !== 'Approved') fail('Only approved plans are amended; edit drafts directly', 409, 'state');
    plan.version += 1; plan.status = 'Draft'; plan.history.push({ at: iso(), byUserId: p.id, action: 'amended', comment: reason });
    await db.update(t.plans).set({ version: plan.version, status: plan.status, history: plan.history, updatedAt: iso() }).where(eq(t.plans.id, id));
    return plan;
  }

  async versions(p: Principal, id: string) {
    await this.get(p, id);
    return db.select().from(t.planVersions).where(eq(t.planVersions.planId, id)).orderBy(desc(t.planVersions.version));
  }

  /** One loading per truck number; new trucks in an amendment get a loading, pending ones get the new quantities. */
  private async syncLoadings(tx: Tx, po: PurchaseOrder, plan: Plan) {
    const existing = (await tx.select().from(t.loadings).where(eq(t.loadings.poId, po.id))).map(map.loading);
    for (const no of [...new Set(plan.lines.map((l) => l.truckNo))]) {
      const lines = plan.lines.filter((l) => l.truckNo === no).map((l) => ({ planLineId: l.id, productId: l.productId, orderedQty: l.qty, loadedQty: l.qty }));
      const cur = existing.find((x) => x.truckNo === no);
      if (!cur) await tx.insert(t.loadings).values({ id: uid('ld'), poId: po.id, truckNo: no, truckId: '', driverId: '', loadingPointId: po.supplierId, status: 'Pending', lines, agreedTransport: 0, transportCurrency: 'USD', documents: [], loadedAt: null });
      else if (cur.status === 'Pending') await tx.update(t.loadings).set({ lines }).where(eq(t.loadings.id, cur.id));
    }
  }

  // ---- Purchase orders ----------------------------------------------------------
  async listPos(p: Principal) {
    const rows = (await db.select().from(t.pos).orderBy(desc(t.pos.approvedAt))).map(map.po);
    return rows.filter((x) => canSeeEntity(p, x.entityId) || p.loadingPointIds.includes(x.supplierId));
  }
  async getPo(p: Principal, id: string) {
    const [r] = await db.select().from(t.pos).where(eq(t.pos.id, id));
    if (!r) return notFound('Purchase order');
    if (!canSeeEntity(p, r.entityId) && !p.loadingPointIds.includes(r.supplierId)) forbidden();
    const [plan] = await db.select().from(t.plans).where(eq(t.plans.id, r.planId));
    return { po: map.po(r), plan: map.plan(plan) };
  }
  async markSent(p: Principal, id: string) {
    const { po } = await this.getPo(p, id);
    await db.update(t.pos).set({ sentAt: iso() }).where(eq(t.pos.id, id));
    return { ...po, sentAt: iso() };
  }

  /** Data handed to the PDF port's 'po-letter' template (§7.1/§7.2 layout). */
  async poLetterData(p: Principal, id: string): Promise<PoLetterData> {
    const { po, plan } = await this.getPo(p, id);
    const { bundle } = await this.ref.get();
    const product = (pid: string) => bundle.products.find((x) => x.id === pid);
    const e = bundle.entities.find((x) => x.id === po.entityId)!;
    const s = bundle.suppliers.find((x) => x.id === po.supplierId)!;
    const approver = bundle.users.find((u) => u.id === po.approvedById);
    const preparer = bundle.users.find((u) => u.id === plan.createdById);
    return {
      entity: { name: e.name, code: e.code, address: e.address }, date: po.date, ref: po.ref, title: po.title, version: po.version,
      addressedTo: { section: 'The Export Section', name: s.code, city: s.city, country: s.country }, instruction: po.instruction, currency: po.currency,
      lines: [...plan.lines].sort((a, b) => a.truckNo - b.truckNo).map((l) => ({ truckNo: l.truckNo, brand: product(l.productId)?.brand ?? '', pack: product(l.productId)?.pack ?? '', qty: l.qty, price: l.price })),
      preparedBy: { name: preparer?.name ?? '', title: 'Operations officer' },
      approvedBy: { name: approver?.name ?? '', title: 'Director', at: po.approvedAt, signature: po.signature && (po.signature.startsWith('data:') || /^[a-f0-9]{40}\./.test(po.signature)) ? po.signature : undefined },
    };
  }
  async poPdf(p: Principal, id: string) { return this.pdf.render('po-letter', await this.poLetterData(p, id)); }

  /** PO-03: email the PO letter to the supplier export section and record when it was sent. */
  async sendPo(p: Principal, id: string) {
    const data = await this.poLetterData(p, id);
    const pdf = await this.pdf.render('po-letter', data);
    const { po } = await this.getPo(p, id);
    const supplier = (await this.ref.get()).bundle.suppliers.find((x) => x.id === po.supplierId)!;
    await this.mail.send({ to: supplier.email, subject: `${data.entity.name} — ${data.title} / ${data.ref}`, text: `Dear ${supplier.name},\n\n${data.instruction}\n\nPlease find our order ${data.ref} attached.\n\n${data.entity.name}`, attachments: [{ filename: `${data.ref}.pdf`, content: pdf, contentType: 'application/pdf' }] });
    return this.markSent(p, id);
  }
}
