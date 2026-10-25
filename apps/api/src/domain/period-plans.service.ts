// §8.3 PL-06..PL-12: period plans (a month, quarter, half, year or custom range) per company, with an optional
// monthly split per line. Plans are suggestions: no approval — planners (and directors/admins) save them, each save is a
// new version (edit history). Active plans of a company never overlap: an overlapping save is refused (409) unless the
// request says `replace: true`, which marks the overlapped plans Replaced (kept for history). Plans gate nothing.
import { Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { copyPeriodPlan, hasFeature, monthsIn, nextRef, overlapMessage, overlapsOf, PERIOD_PLAN_EDITORS } from '@btw/api/rules';
import type { PeriodKind, PeriodPlan, PeriodPlanLine } from '@btw/api/types';
import { db, schema as t, type Tx } from '../db/client';
import { fail, forbidden, notFound } from '../common/errors';
import { iso, uid } from '../common/ids';
import { assertEntity, has, writeEntity, type Principal } from '../auth/principal';
import { periodLineVisible } from '@btw/api/access';
import { auditNote } from '../common/audit-context';
import { RefService } from './ref.service';
import { map } from './store';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const KINDS: PeriodKind[] = ['month', 'quarter', 'half', 'year', 'custom'];

@Injectable()
export class PeriodPlansService {
  constructor(private ref: RefService) {}

  private see(p: Principal) { if (!hasFeature(p.roles, 'period-plans')) forbidden('Period plans are not available for your role'); }
  private edit(p: Principal) { this.see(p); if (!has(p, ...PERIOD_PLAN_EDITORS)) forbidden('Only planners, directors and admins edit period plans'); }
  /** docs/12: a pair-scoped planner (Kabonge) sees and edits only the lines of their buyer–supplier pairs. */
  private mine = (p: Principal, entityId: string) => (l: PeriodPlanLine) => periodLineVisible(p, entityId, l.supplierId);
  private out = (p: Principal, plan: PeriodPlan): PeriodPlan => ({ ...plan, lines: plan.lines.filter(this.mine(p, plan.entityId)) });
  /** Lines sent must be the user's pairs; lines they cannot see are kept as they were. */
  private merge(p: Principal, entityId: string, incoming: PeriodPlanLine[], cur: PeriodPlanLine[], codeOf: (id: string) => string) {
    const mine = this.mine(p, entityId);
    const bad = incoming.find((l) => !mine(l));
    if (bad) forbidden(`${codeOf(bad.supplierId)} lines are not one of your buyer–supplier pairs`);
    return [...cur.filter((l) => !mine(l)), ...incoming];
  }
  private async prefix(entityId: string) {
    const e = (await this.ref.get()).bundle.entities.find((x) => x.id === entityId) ?? notFound('Company');
    return e.poPrefix.replace(/-PO$/, '-PP');
  }
  private dates(from: unknown, to: unknown) {
    if (typeof from !== 'string' || typeof to !== 'string' || !DATE.test(from) || !DATE.test(to) || Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) fail('Give the period as dates (YYYY-MM-DD)', 400, 'bad-request');
    if ((from as string) > (to as string)) fail('The period ends before it starts');
    if (monthsIn(from as string, to as string).length > 24) fail('A period plan covers at most 24 months');
  }

  async list(p: Principal, all = false) {
    this.see(p);
    const rows = await db.select().from(t.periodPlans).where(all ? inArray(t.periodPlans.entityId, p.scope) : and(inArray(t.periodPlans.entityId, p.scope), eq(t.periodPlans.status, 'Active'))).orderBy(desc(t.periodPlans.from));
    return rows.map(map.periodPlan).map((x) => this.out(p, x));
  }
  async get(p: Principal, id: string) { return this.out(p, await this.load(p, id)); }
  private async load(p: Principal, id: string) {
    this.see(p);
    const [r] = await db.select().from(t.periodPlans).where(eq(t.periodPlans.id, id));
    if (!r) return notFound('Period plan');
    assertEntity(p, r.entityId);
    return map.periodPlan(r);
  }

  /** Plans never overlap per company: refuse (409 + the conflicting refs) unless `replace`, which marks them Replaced. */
  private async claimPeriod(tx: Tx, p: Principal, plan: Pick<PeriodPlan, 'id' | 'entityId' | 'from' | 'to' | 'ref'>, replace: unknown) {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'period-plans:' + plan.entityId}))`);
    const rows = (await tx.select().from(t.periodPlans).where(and(eq(t.periodPlans.entityId, plan.entityId), eq(t.periodPlans.status, 'Active')))).map(map.periodPlan);
    const hits = overlapsOf(plan, rows);
    if (!hits.length) return [];
    if (replace !== true) fail(overlapMessage(hits), 409, 'overlap', { conflicts: hits.map((h) => ({ id: h.id, ref: h.ref, from: h.from, to: h.to, title: h.title })) });
    for (const h of hits) {
      h.history.push({ at: iso(), byUserId: p.id, action: 'replaced', comment: `replaced by ${plan.ref}` });
      await tx.update(t.periodPlans).set({ status: 'Replaced', replacedById: plan.id, history: h.history, updatedAt: iso() }).where(eq(t.periodPlans.id, h.id));
    }
    return hits;
  }
  private async snapshot(tx: Tx, p: Principal, plan: PeriodPlan, reason: string) {
    await tx.insert(t.periodPlanVersions).values({ planId: plan.id, version: plan.version, snapshot: plan, reason, byUserId: p.id }).onConflictDoNothing();
  }
  private lines(b: Partial<PeriodPlan> | undefined, cur: PeriodPlanLine[], bundle: Awaited<ReturnType<RefService['get']>>['bundle']): PeriodPlanLine[] {
    if (b?.lines !== undefined && !Array.isArray(b.lines)) fail('lines must be a list', 400, 'bad-request');
    if ((b?.lines?.length ?? 0) > 500) fail('At most 500 lines per plan', 400, 'bad-request');
    return (b?.lines ?? cur).map((l, i) => {
      if (!l || typeof l !== 'object') fail(`Line ${i + 1} must be an object`, 400, 'bad-request');
      const cases = Number(l.cases), price = Number(l.price);
      if (!Number.isFinite(cases) || cases < 0) fail(`Line ${i + 1}: cases must be a number ≥ 0`, 400, 'bad-request');
      if (!Number.isFinite(price) || price < 0) fail(`Line ${i + 1}: price must be a number ≥ 0`, 400, 'bad-request');
      if (!bundle.suppliers.some((s) => s.id === l.supplierId)) fail(`Line ${i + 1}: unknown supplier`, 400, 'bad-request');
      if (!bundle.products.some((x) => x.id === l.productId)) fail(`Line ${i + 1}: unknown brand/package`, 400, 'bad-request');
      if (l.destinationId && !bundle.warehouses.some((w) => w.id === l.destinationId)) fail(`Line ${i + 1}: unknown destination`, 400, 'bad-request');
      let months: Record<string, number> | undefined;
      if (l.months !== undefined && l.months !== null) {
        if (typeof l.months !== 'object' || Array.isArray(l.months)) fail(`Line ${i + 1}: monthly split must be { "YYYY-MM": cases }`, 400, 'bad-request');
        months = {};
        for (const [k, v] of Object.entries(l.months)) {
          if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(k) || !Number.isFinite(Number(v)) || Number(v) < 0) fail(`Line ${i + 1}: monthly split must be { "YYYY-MM": cases ≥ 0 }`, 400, 'bad-request');
          months[k] = Math.round(Number(v));
        }
      }
      return { id: typeof l.id === 'string' && l.id ? l.id.slice(0, 64) : uid('ppl'), supplierId: l.supplierId, productId: l.productId, cases: Math.round(cases), price: Math.round(price * 100) / 100, destinationId: l.destinationId ?? '', ...(months ? { months } : {}) };
    });
  }

  /** A new plan is Active at once (plans are suggestions — no approval). `replace: true` overwrites overlapping plans. */
  async create(p: Principal, b: { entityId?: string; periodKind?: PeriodKind; from?: string; to?: string; title?: string; lines?: PeriodPlanLine[]; replace?: boolean }) {
    this.edit(p);
    const entityId = writeEntity(p, typeof b?.entityId === 'string' ? b.entityId : undefined);
    this.dates(b?.from, b?.to);
    const kind = KINDS.includes(b?.periodKind as PeriodKind) ? (b.periodKind as PeriodKind) : 'custom';
    if (b?.title !== undefined && (typeof b.title !== 'string' || b.title.length > 200)) fail('Title must be text (max 200 characters)', 400, 'bad-request');
    const prefix = await this.prefix(entityId);
    const { bundle } = await this.ref.get();
    const code = (id: string) => bundle.suppliers.find((x) => x.id === id)?.code ?? id;
    const lines = this.merge(p, entityId, this.lines(b, [], bundle), [], code);
    return db.transaction(async (tx) => {
      const refs = (await tx.select({ ref: t.periodPlans.ref }).from(t.periodPlans)).map((r) => r.ref);
      const plan: PeriodPlan = { id: uid('pp'), ref: nextRef(refs, prefix, Number(b.from!.slice(0, 4))), entityId, title: b.title ?? '', periodKind: kind, from: b.from!, to: b.to!, status: 'Active', version: 1, lines, history: [{ at: iso(), byUserId: p.id, action: 'created' }], createdById: p.id };
      const replaced = await this.claimPeriod(tx, p, plan, b?.replace);
      if (replaced.length) plan.history[0].comment = `replaces ${replaced.map((x) => x.ref).join(', ')}`;
      await tx.insert(t.periodPlans).values({ ...plan, copiedFromId: null, amendReason: null, replacedById: null });
      await this.snapshot(tx, p, plan, 'created');
      auditNote({ recordType: 'period-plan', recordId: plan.id, summary: `${plan.ref} created`, entityId });
      return this.out(p, plan);
    });
  }

  /** Save an Active plan: period, title and lines (supplier, SKU, cases, price, destination, optional monthly split).
   *  Changing the dates onto another Active plan's period is refused (409) unless `replace: true`. */
  async save(p: Principal, id: string, b: Partial<PeriodPlan> & { replace?: boolean }) {
    this.edit(p);
    const cur = await this.load(p, id);
    if (cur.status === 'Replaced') fail('This plan was replaced by a newer one and is kept for history', 409, 'locked');
    if (b?.entityId && b.entityId !== cur.entityId) fail('A plan cannot move to another company', 403, 'forbidden');
    const from = b?.from ?? cur.from, to = b?.to ?? cur.to;
    this.dates(from, to);
    const { bundle } = await this.ref.get();
    const code = (sid: string) => bundle.suppliers.find((x) => x.id === sid)?.code ?? sid;
    const lines = b?.lines === undefined ? cur.lines : this.merge(p, cur.entityId, this.lines(b, [], bundle), cur.lines, code);
    const title = b?.title ?? cur.title;
    if (typeof title !== 'string' || title.length > 200) fail('Title must be text (max 200 characters)', 400, 'bad-request');
    const periodKind = KINDS.includes(b?.periodKind as PeriodKind) ? (b!.periodKind as PeriodKind) : cur.periodKind;
    return db.transaction(async (tx) => {
      const next: PeriodPlan = { ...cur, title, periodKind, from, to, lines, version: cur.version + 1, history: [...cur.history] };
      const replaced = (from !== cur.from || to !== cur.to) ? await this.claimPeriod(tx, p, next, b?.replace) : [];
      next.history.push({ at: iso(), byUserId: p.id, action: 'edited', ...(replaced.length ? { comment: `replaces ${replaced.map((x) => x.ref).join(', ')}` } : {}) });
      await tx.update(t.periodPlans).set({ title, periodKind, from, to, lines, version: next.version, history: next.history, updatedAt: iso() }).where(and(eq(t.periodPlans.id, id), eq(t.periodPlans.status, 'Active')));
      await this.snapshot(tx, p, next, 'edited');
      auditNote({ recordType: 'period-plan', recordId: id, summary: `${cur.ref} v${next.version}`, entityId: cur.entityId, before: { version: cur.version, from: cur.from, to: cur.to, lines: cur.lines.length }, after: { version: next.version, from, to, lines: lines.length } });
      return this.out(p, next);
    });
  }

  /** PL-11: copy an earlier plan as the start of the next one (dates and monthly split shift with the period). */
  async copy(p: Principal, fromId: string, b: { from?: string; to?: string; title?: string; replace?: boolean }) {
    this.edit(p);
    const src = await this.get(p, fromId); // only the lines this user may see are copied
    writeEntity(p, src.entityId);
    this.dates(b?.from, b?.to);
    if (b?.title !== undefined && (typeof b.title !== 'string' || b.title.length > 200)) fail('Title must be text (max 200 characters)', 400, 'bad-request');
    const prefix = await this.prefix(src.entityId);
    return db.transaction(async (tx) => {
      const refs = (await tx.select({ ref: t.periodPlans.ref }).from(t.periodPlans)).map((r) => r.ref);
      const plan = copyPeriodPlan(src, { from: b.from!, to: b.to!, title: b.title }, { id: uid('pp'), ref: nextRef(refs, prefix, Number(b.from!.slice(0, 4))), lineId: () => uid('ppl') }, p.id);
      await this.claimPeriod(tx, p, plan, b?.replace);
      await tx.insert(t.periodPlans).values({ ...plan, copiedFromId: plan.copiedFromId ?? null, amendReason: null, replacedById: null });
      await this.snapshot(tx, p, plan, 'created');
      return this.out(p, plan);
    });
  }

  /** Active plans of the same company whose period overlaps (a preview of the 409 a save would get). */
  async overlaps(p: Principal, b: Partial<PeriodPlan>) {
    this.see(p);
    if (!b?.entityId || typeof b.from !== 'string' || typeof b.to !== 'string') fail('Send entityId, from, to', 400, 'bad-request');
    assertEntity(p, b.entityId);
    const rows = (await db.select().from(t.periodPlans).where(and(eq(t.periodPlans.entityId, b.entityId!), eq(t.periodPlans.status, 'Active')))).map(map.periodPlan);
    return overlapsOf({ id: b.id ?? '', entityId: b.entityId!, from: b.from!, to: b.to! }, rows);
  }

  async versions(p: Principal, id: string) {
    await this.get(p, id);
    const rows = await db.select().from(t.periodPlanVersions).where(eq(t.periodPlanVersions.planId, id)).orderBy(desc(t.periodPlanVersions.version));
    // snapshots hold every pair's lines: a pair-scoped planner sees only theirs
    return rows.map((r) => ({ ...r, snapshot: this.out(p, r.snapshot as PeriodPlan) }));
  }
}
