// Period plans (PL-06..12, suggestions: no approval, never overlapping), orders against the plan (PO-06..08,
// informational), PO issue vs director approval (config), loading allowance + automatic PO revisions, planned vs actual
// (PV-01..07) and the role × feature matrix: pure rules with known answers, then the same flows through the mock client
// (the server mirrors it).
import * as api from '../src/index';
import * as R from '../src/rules';
import type { PeriodPlan, Plan } from '../src/types';

let fails = 0;
const ok = (c: unknown, m: string) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const rejects = async (f: () => Promise<unknown>, status: number, m: string) => {
  try { await f(); ok(false, `${m} (expected ${status}, resolved)`); } catch (e) { const s = (e as { status?: number }).status; ok(s === status, `${m} → ${s ?? (e as Error).message}`); }
};

// ---- rules -------------------------------------------------------------------------------------------
ok(JSON.stringify(R.periodRange('quarter', '2026-11-14')) === '{"from":"2026-10-01","to":"2026-12-31"}', 'quarter of 14 Nov = Oct–Dec');
ok(R.periodRange('half', '2026-03-02').to === '2026-06-30' && R.periodRange('year', '2026-03-02').from === '2026-01-01', 'half year / year ranges');
ok(R.periodRange('month', '2026-02-10').to === '2026-02-28', 'month range ends on the last day');
ok(R.monthsIn('2026-11-15', '2027-02-01').join() === '2026-11,2026-12,2027-01,2027-02', 'months across a year end');
const split = R.evenSplit(1000, ['2026-10', '2026-11', '2026-12']);
ok(split['2026-10'] === 334 && split['2026-12'] === 333 && Object.values(split).reduce((a, b) => a + b, 0) === 1000, 'even split keeps the total (remainder first)');

const products = [{ id: 'p1', supplierId: 's1' }, { id: 'p2', supplierId: 's1' }, { id: 'p3', supplierId: 's2' }];
const line = (id: string, productId: string, cases: number, extra: Partial<PeriodPlan['lines'][number]> = {}) => ({ id, supplierId: products.find((p) => p.id === productId)!.supplierId, productId, cases, price: 10, destinationId: 'w1', ...extra });
const pp = (over: Partial<PeriodPlan> = {}): PeriodPlan => ({ id: 'pp1', ref: 'X-PP-2026-0001', entityId: 'e1', title: 'Q4', periodKind: 'quarter', from: '2026-10-01', to: '2026-12-31', status: 'Active', version: 1, lines: [line('L1', 'p1', 3000), line('L2', 'p2', 1000)], history: [], createdById: 'u', ...over });
ok(R.validatePeriodPlan(pp(), products).length === 0, 'valid plan has no errors');
const bad = R.validatePeriodPlan(pp({ lines: [line('a', 'p3', 100, { supplierId: 's1' }), line('b', 'p1', 0), line('c', 'p1', 90, { months: { '2026-10': 50, '2026-11': 30 } }), line('d', 'p1', 10, { months: { '2027-01': 10 } })] }), products);
ok(bad.some((e) => e.includes('not supplied')) && bad.some((e) => e.includes('whole number')) && bad.some((e) => e.includes('adds up to 80')) && bad.some((e) => e.includes('outside the period')), 'validation: wrong supplier, zero cases, split total, split month');
ok(R.validatePeriodPlan(pp({ from: '2026-12-01', to: '2026-10-01' }), products).some((e) => e.includes('ends before')), 'validation: period ends before it starts');

const all = [pp(), pp({ id: 'pp2', from: '2026-12-01', to: '2027-02-28' }), pp({ id: 'pp3', from: '2027-01-01', to: '2027-03-31' }), pp({ id: 'pp4', entityId: 'e2' }), pp({ id: 'pp5', status: 'Replaced' }), pp({ id: 'pp6', lines: [line('x', 'p3', 5)] })];
ok(R.overlapsOf(all[0], all).map((p) => p.id).join() === 'pp2,pp6', 'overlap: any Active plan of the same company whose dates overlap (not other company, replaced, later)');
ok(/X-PP-2026-0001 already covers 2026-10-01 – 2026-12-31\. Replace it\?/.test(R.overlapMessage([pp()])), 'overlap message names the plan and its period');

const cp = R.copyPeriodPlan(pp({ lines: [line('L1', 'p1', 900, { months: { '2026-10': 300, '2026-11': 300, '2026-12': 300 } })] }), { from: '2027-01-01', to: '2027-03-31' }, { id: 'n', ref: 'X-PP-2027-0001', lineId: () => 'nl' }, 'u2');
ok(cp.status === 'Active' && cp.copiedFromId === 'pp1' && cp.version === 1 && cp.lines[0].id === 'nl', 'copy: new active plan linked to its source');
ok(JSON.stringify(cp.lines[0].months) === '{"2027-01":300,"2027-02":300,"2027-03":300}', 'copy: monthly split moves with the period');
const cp2 = R.copyPeriodPlan(pp({ lines: [line('L1', 'p1', 900, { months: { '2026-10': 300, '2026-11': 300, '2026-12': 300 } })] }), { from: '2027-01-01', to: '2027-01-31' }, { id: 'n', ref: 'r', lineId: () => 'nl' }, 'u2');
ok(JSON.stringify(cp2.lines[0].months) === '{"2027-01":900}', 'copy into a shorter period re-spreads the split');

const order = (id: string, date: string, lines: [string, number][], status: Plan['status'] = 'Approved', extra: Partial<Plan> = {}): Plan => ({
  id, ref: id, title: '', entityId: 'e1', supplierId: 's1', currency: 'USD', date, requiredBy: date, status, version: 1, history: [], createdById: 'u',
  lines: lines.map(([productId, qty], i) => ({ id: `${id}-${i}`, truckNo: 1, productId, qty, price: 10, deliveredToId: 'rc', routeId: 'r' })), ...extra,
});
const o1 = order('o1', '2026-10-05', [['p1', 2000]]);
const o2 = order('o2', '2026-11-02', [['p1', 800], ['p1', 500], ['p3', 100]], 'Draft');
const o0 = order('o0', '2026-09-20', [['p1', 9999]]); // before the period: not counted
const oDraft = order('od', '2026-10-09', [['p1', 9999]], 'Draft'); // drafts don't count as ordered
const ctx = R.planContext(o2, [pp()], [o0, o1, o2, oDraft]);
ok(ctx[0].planned === 3000 && ctx[0].orderedBefore === 2000 && ctx[0].remaining === 200 && !ctx[0].exception, 'PO line: planned 3000, ordered before 2000, remaining 200');
ok(ctx[1].remaining === -300 && ctx[1].exception === 'over', 'second line of the same SKU runs over the plan');
ok(ctx[2].exception === 'unplanned' && ctx[2].planned === 0, 'SKU not in the plan is unplanned');
ok(R.missingReasons(ctx).length === 2, 'over + unplanned lines are marked (informational — nothing is refused for it)');
const withReasons = { ...o2, lines: o2.lines.map((l, i) => (i ? { ...l, exceptionReason: 'Customer asked' } : l)) };
const linked = R.applyPlanLinks(withReasons, [pp()], [o1]);
ok(linked.lines[0].periodLineId === 'L1' && !linked.lines[0].exception && !linked.lines[0].exceptionReason, 'apply links: on-plan line linked, no mark');
ok(linked.lines[1].exception === 'over' && linked.lines[2].exception === 'unplanned' && linked.lines[2].exceptionReason === 'Customer asked', 'apply links: marks + reasons kept');
ok(R.missingReasons(R.planContext(withReasons, [pp()], [o1])).length === 0, 'reasons given → nothing missing');
ok(R.planContext(order('late', '2027-01-04', [['p1', 1]]), [pp()], []).every((c) => c.exception === 'unplanned'), 'no approved plan covering the date → unplanned');
ok(R.planContext(o1, [pp({ status: 'Replaced' })], []).every((c) => c.exception === 'unplanned'), 'a replaced period plan does not cover orders');
// a PO revised at loading counts once: the superseded original is not "ordered before"
const oRev = order('o1r', '2026-10-05', [['p1', 1800]], 'Approved', { revisionOf: 'o1', revision: 1 });
ok(R.planContext(o2, [pp()], [{ ...o1, supersededById: 'o1r' }, oRev])[0].orderedBefore === 1800, 'superseded order not counted twice (latest revision counts)');
ok(R.ORDER_COUNTS('Approved') && !R.ORDER_COUNTS({ status: 'Approved', supersededById: 'x' }) && !R.ORDER_COUNTS('Draft'), 'ORDER_COUNTS: status or order; superseded never counts');

// loading allowance + revisions (rule 3)
const ldl = [{ planLineId: 'a', productId: 'p1', orderedQty: 1000 }, { planLineId: 'b', productId: 'p2', orderedQty: 1000 }];
const cfg = R.defaultConfig.loading;
ok(R.defaultConfig.approvals.purchaseOrders === false && cfg.allowancePct === 10 && cfg.allowAlternatives && cfg.revisionSuffix === '-rev', 'config defaults: no PO approval, ±10 %, alternatives, -rev');
const same = R.loadingCheck(ldl, {}, [], 2400, cfg);
ok(!same.error && !same.deviates && same.loaded === 2000 && same.min === 1800 && same.max === 2200, 'as ordered: no deviation, band 1,800–2,200');
const alt = R.loadingCheck(ldl, { a: 800 }, [{ productId: 'p2', qty: 200, replacesPlanLineId: 'a' }], 2400, cfg, { supplierId: 's1', products: products as never });
ok(!alt.error && alt.deviates && alt.loaded === 2000 && alt.changes.map((c) => c.kind).join() === 'qty,alternative', 'qty change + alternative: deviation within allowance');
ok(/Over the 10% loading allowance — ask the planner to change the PO/.test(R.loadingCheck(ldl, { a: 1300 }, [], 3000, cfg).error ?? ''), 'over the allowance refused');
ok(/Below the 10% loading allowance/.test(R.loadingCheck(ldl, { a: 0, b: 500 }, [], 3000, cfg).error ?? ''), 'under the allowance refused');
ok(/capacity/.test(R.loadingCheck(ldl, { a: 1100 }, [], 2000, cfg).error ?? ''), 'capacity still caps the truck');
ok(/not on this supplier/.test(R.loadingCheck(ldl, {}, [{ productId: 'p3', qty: 10 }], 3000, cfg, { supplierId: 's1', products: products as never }).error ?? ''), 'alternative from another supplier refused');
ok(/switched off/.test(R.loadingCheck(ldl, { a: 990 }, [{ productId: 'p2', qty: 10 }], 3000, { ...cfg, allowAlternatives: false }).error ?? ''), 'alternatives can be switched off');
ok(R.revisionRef('BTW-PO-2026-0002', '-rev', 1) === 'BTW-PO-2026-0002-rev001' && R.revisionRef('X', '-r', 12) === 'X-r012', 'revision refs from the base ref');
ok(R.revisionSummary([{ productId: 'p1', ordered: 1000, loaded: 800 }, { productId: 'p2', ordered: 0, loaded: 200 }], (id) => id === 'p1' ? 'Tusker' : 'Tusker Lite') === 'Tusker −200, Tusker Lite +200', 'revision summary per product');
const base = { ...order('ob', '2026-10-05', [['p1', 1000], ['p2', 1000]]), lines: [{ id: 'a', truckNo: 1, productId: 'p1', qty: 1000, price: 10, deliveredToId: 'rc', routeId: 'r' }, { id: 'b', truckNo: 1, productId: 'p2', qty: 1000, price: 10, deliveredToId: 'rc', routeId: 'r' }, { id: 'c', truckNo: 2, productId: 'p1', qty: 500, price: 10, deliveredToId: 'rc', routeId: 'r2' }] };
const rv = R.revisePlan(base, 1, ldl, { a: 0 }, [{ productId: 'p2', qty: 900, replacesPlanLineId: 'a' }], { id: 'r1', ref: 'ob-rev001', poId: 'po-r1', lineId: () => 'n1', basePlanId: 'ob', revision: 1 }, () => 12, 'u', '2026-10-06T00:00:00Z');
ok(rv.plan.lines.map((l) => `${l.id}:${l.qty}`).join() === 'b:1000,c:500,n1:900' && rv.plan.lines[2].routeId === 'r' && rv.plan.lines[2].price === 12 && rv.plan.revision === 1 && rv.plan.revisionOf === 'ob', 'revision copy: missing line dropped, alternative added on the truck, other trucks unchanged');

// role × feature matrix
ok(!R.featuresFor(['director']).includes('period-plans.approve' as never) && R.PERIOD_PLAN_EDITORS.join() === 'planner,director,admin' && R.PO_EDITORS.includes('admin'), 'no period-plan approval feature; planners, directors and admins edit plans and issue POs');
ok(R.hasFeature(['accounts'], 'finance') && !R.hasFeature(['planner'], 'finance') && !R.hasFeature(['admin'], 'finance'), 'finance: accounts yes, planner/admin no');
ok(!R.hasFeature(['driver'], 'dashboard') && !R.hasFeature(['loader'], 'reports') && R.hasFeature(['loader'], 'logistics'), 'field roles: no dashboard/reports');
ok(R.canOpenReport(['sales'], 'sales') && !R.canOpenReport(['sales'], 'finance') && !R.canOpenReport(['driver'], 'sales'), 'reports gated by feature');
ok(R.canOpenReport(['planner'], 'planned-vs-actual') && !R.canOpenReport(['fleet'], 'planned-vs-actual'), 'planned vs actual: planner yes, fleet no');

// ---- mock client: the demo cycle and the flows ------------------------------------------------------------
await api.auth.login('u-dir', '');
ok(api.ref().config.approvals.purchaseOrders === false && api.ref().config.loading.allowancePct === 10, 'ref().config: defaults (PO approval off, ±10 %)');
api.entities.setActive('e-btw');
const list = await api.periodPlans.list();
const live = list.find((p) => p.status === 'Active' && !p.copiedFromId)!;
ok(live && live.lines.every((l) => l.months && Object.values(l.months).reduce((a, b) => a + b, 0) === l.cases), 'demo: active BTW plan with a monthly split');
ok(list.some((p) => p.status === 'Active' && p.copiedFromId === live.id), 'demo: next period started as a copy');
ok(list.every((a) => list.every((b) => a === b || a.entityId !== b.entityId || a.to < b.from || b.to < a.from)), 'demo: no overlapping plans per company');
const pv = await api.reports.plannedVsActual({});
const flags = new Set(pv.lines.map((l) => l.flag));
ok(flags.has('Behind plan') && flags.has('On track') && flags.has('Over plan'), 'demo PV (BTW): behind, on track and over');
ok(pv.measures.planned === pv.lines.reduce((a, l) => a + l.planned, 0) && pv.measures.variance === pv.measures.ordered - pv.measures.planned, 'PV measures add up');
ok(pv.months.at(-1)!.cumPlanned === pv.measures.planned && pv.today >= pv.range.from && pv.today <= pv.range.to, 'PV running totals end at the plan; today inside the range');
ok(pv.lines.every((l) => l.pos.reduce((a, p) => a + p.cases, 0) === l.ordered), 'PV drill-down: POs add up to ordered');
api.entities.setActive('e-nud');
ok((await api.reports.plannedVsActual({})).lines.some((l) => l.flag === 'Unplanned' && l.destinationId === 'w-juba'), 'demo PV (NUD): unplanned GBI malt to Juba');
const pending = (await api.plans.list()).find((p) => p.id === 'plan-2')!;
ok(pending.status === 'Submitted' && pending.lines.some((l) => l.exception === 'over' && l.exceptionReason), 'demo: NUD order shows its over-plan mark and note');
ok(R.planStatusLabel(pending, api.ref().config) === 'Ready to issue', 'approvals off: a submitted order reads "Ready to issue"');

// Planner: period plans are suggestions — saved directly, Active at once; overlaps → 409 unless replace
await api.auth.login('u-kabonge', '');
api.entities.setActive('e-kivu');
const nextQ = R.periodRange('quarter', `${R.shiftMonth(live.to.slice(0, 7), 4)}-01`);
let p = await api.periodPlans.create({ periodKind: 'quarter', ...nextQ, title: 'Test quarter' } as never);
ok(p.ref.startsWith('KVD-PP-') && p.status === 'Active' && p.history[0]?.action === 'created', 'planner creates a period plan, Active at once ' + p.ref);
p.lines = [{ id: '', supplierId: 's-sbl', productId: 'p-e330', cases: 1200, price: 13.1, destinationId: 'w-kgl' }];
p = await api.periodPlans.save(p);
ok(p.version === 2 && p.history.at(-1)?.action === 'edited' && p.lines.length === 1, 'save = next version with an edit-history entry');
ok((await api.periodPlans.overlaps({ id: '', entityId: 'e-kivu', from: nextQ.from, to: nextQ.from })).map((x) => x.id).join() === p.id, 'overlaps preview names the plan');
let conflict: { status?: number; conflicts?: { ref: string }[] } = {};
try { await api.periodPlans.create({ periodKind: 'month', ...R.periodRange('month', nextQ.to), title: 'Overlapping month' } as never); } catch (e) { conflict = e as never; }
ok(conflict.status === 409 && conflict.conflicts?.[0]?.ref === p.ref, 'an overlapping new plan is refused (409) with the conflicting ref');
const repl = await api.periodPlans.create({ periodKind: 'month', ...R.periodRange('month', nextQ.to), title: 'Overlapping month', replace: true } as never);
const after = await api.periodPlans.list();
const old = (await api.periodPlans.list({ all: true })).find((x) => x.id === p.id)!;
ok(repl.status === 'Active' && !after.some((x) => x.id === p.id) && old.status === 'Replaced' && old.replacedById === repl.id, 'replace: true → the old plan is Replaced (hidden by default, kept for history)');
await rejects(() => api.periodPlans.save(old), 409, 'a replaced plan cannot be edited');
await rejects(() => api.periodPlans.save({ ...repl, from: live.from, to: live.to }), 409, 'moving a plan onto another plan\'s period is refused');
await api.auth.login('u-dir', ''); api.entities.setActive('e-kivu');
ok((await api.periodPlans.save({ ...repl, title: 'Edited by the director' })).title === 'Edited by the director', 'directors edit plans directly (no approval)');

// Orders against the plan: over the remaining needs a reason (PO-07)
await api.auth.login('u-kabonge', ''); api.entities.setActive('e-kivu');
let o = await api.plans.create('e-kivu', 's-sbl');
o.lines = [{ ...api.plans.newLine(o, 1), qty: 2000, routeId: 'r-mwz-kgl' }, { ...api.plans.newLine(o, 2), qty: 2000, routeId: 'r-mwz-kgl' }, { ...api.plans.newLine(o, 3), qty: 2000, routeId: 'r-mwz-kgl' }];
o = await api.plans.save(o);
const c = await api.plans.planContext(o.id);
ok(c[0].periodPlanRef === live.ref.replace('BTW', 'KVD') && c[0].planned > 0 && c.at(-1)!.exception === 'over', 'plan context: linked to the Kivu plan; the third truck goes over');
o = await api.plans.submit(o.id);
ok(o.status === 'Approved' && o.poId && o.history.at(-1)?.action === 'issued' && o.lines.some((l) => l.exception === 'over'), 'approvals off: an over-plan order without a note is issued at once (plans gate nothing)');
const issued = (await api.pos.get(o.poId!))!;
ok(issued.po.approval === 'issued' && issued.po.approvedById === 'u-kabonge' && R.planStatusLabel(o) === 'Issued', 'issued PO: approvedBy = the planner, label "Issued"');
await rejects(() => api.plans.decide(o.id, 'approved', '', 'sig'), 403, 'planner cannot decide');
// a PO without any covering period plan is issued too
let free = await api.plans.create('e-kivu', 's-sbl');
free = await api.plans.save({ ...free, date: '2030-01-05', lines: [{ ...api.plans.newLine(free, 1), qty: 1000, routeId: 'r-mwz-kgl' }] });
free = await api.plans.submit(free.id);
ok(free.status === 'Approved' && free.poId && free.lines.every((l) => l.exception === 'unplanned'), 'no period plan covering the date: issued anyway');

// approvals on (config.toml approvals.purchase_orders = true): today's director flow
api.demo.setConfig({ approvals: { purchaseOrders: true } });
let d = await api.plans.create('e-kivu', 's-sbl');
d = await api.plans.save({ ...d, lines: [{ ...api.plans.newLine(d, 1), qty: 1000, routeId: 'r-mwz-kgl' }] });
d = await api.plans.submit(d.id);
ok(d.status === 'Submitted' && !d.poId && R.planStatusLabel(d, api.ref().config) === 'Submitted', 'approvals on: submit waits for the director');
await api.auth.login('u-dir', ''); api.entities.setActive('e-kivu');
d = await api.plans.decide(d.id, 'approved', '', 'sig:director');
ok(d.status === 'Approved' && d.poId && (await api.pos.get(d.poId!))!.po.approval === 'director' && R.planStatusLabel(d) === 'Approved', 'approvals on: director approves → PO');
api.demo.setConfig({ approvals: { purchaseOrders: false } });
await rejects(() => api.plans.decide(pending.id, 'approved', '', 'sig'), 409, 'approvals off: no director decision');

// Loading against the PO: allowance, alternatives, automatic revisions (rule 3)
await api.auth.login('u-tesfie', ''); api.entities.setActive('e-kivu');
const lds = (await api.loading.list('s-sbl')).filter((l) => l.poId === o.poId).sort((a, b) => a.truckNo - b.truckNo);
const baseRef = issued.po.ref;
ok(lds.length === 3 && lds[0].nextRevisionRef === `${baseRef}-rev001`, 'pending trucks say which revision a change would create');
const l1 = lds[0].lines[0];
await rejects(() => api.loading.confirm(lds[0].id, { truckId: 't5', driverId: 'd5', loadedQty: { [l1.planLineId]: 1500 }, agreedTransport: 900, documents: [] }), 422, 'beyond the ±10 % allowance refused');
const alt2 = seed2Alt();
function seed2Alt() { const prods = api.ref().products.filter((x) => x.supplierId === 's-sbl' && x.id !== l1.productId); return prods[0]; }
const sh1 = await api.loading.confirm(lds[0].id, { truckId: 't5', driverId: 'd5', loadedQty: { [l1.planLineId]: 1700 }, agreedTransport: 900, documents: [], alternatives: [{ productId: alt2.id, qty: 100, replacesPlanLineId: l1.planLineId }] });
const r1 = (await api.pos.get(sh1.poId))!;
ok(r1.po.ref === `${baseRef}-rev001` && r1.po.revision === 1 && r1.po.revisionOf === issued.po.id && r1.po.approval === 'revision' && r1.po.createdBy === 'system' && r1.po.onBehalfOfId === 'u-tesfie', 'deviation at loading → rev001 (system, on behalf of the loader)');
ok(r1.po.changes?.length === 2 && r1.po.changes.some((c) => c.kind === 'qty' && c.ordered === 2000 && c.loaded === 1700) && r1.po.changes.some((c) => c.kind === 'alternative' && c.loaded === 100), 'rev001 lists the changes (qty, alternative)');
ok(sh1.legs[0].lines.reduce((a, l) => a + l.loadedQty, 0) === 1800 && sh1.legs[0].lines.some((l) => l.productId === alt2.id), 'shipment carries the loaded + alternative cases and links to rev001');
const orig = (await api.pos.get(issued.po.id))!;
ok(orig.po.supersededById === r1.po.id && orig.revisions.length === 2, 'original PO superseded but viewable, chain of 2');
const lds2 = (await api.loading.list('s-sbl')).filter((l) => l.poId === r1.po.id && l.status === 'Pending').sort((a, b) => a.truckNo - b.truckNo);
ok(lds2.length === 2 && lds2[0].nextRevisionRef === `${baseRef}-rev002`, 'other trucks follow the latest revision; next change = rev002');
const sameSh = await api.loading.confirm(lds2[1].id, { truckId: 't5', driverId: 'd5', loadedQty: {}, agreedTransport: 900, documents: [] });
ok(sameSh.poId === r1.po.id, 'loaded exactly as ordered: no new revision');
const sh2 = await api.loading.confirm(lds2[0].id, { truckId: 't5', driverId: 'd5', loadedQty: { [lds2[0].lines[0].planLineId]: 1900 }, agreedTransport: 900, documents: [] });
const r2 = (await api.pos.get(sh2.poId))!;
ok(r2.po.ref === `${baseRef}-rev002` && r2.po.revisionOf === issued.po.id && r2.revisions.length === 3, 'next deviation → rev002, numbered from the original ref');
ok(r2.plan.lines.filter((l) => l.truckNo === 1).reduce((a, l) => a + l.qty, 0) === 1800 && r2.plan.lines.filter((l) => l.truckNo === 2).reduce((a, l) => a + l.qty, 0) === 1900, 'rev002 is cloned from rev001 (truck 1 as loaded) + truck 2 as loaded');
ok((await api.shipments.get(sh1.id))!.poId === r2.po.id, 'earlier shipments follow the latest revision');
ok(api.lookup.poRef(sh1.poId) !== '—', 'shipment PO ref resolves');
await api.auth.login('u-kabonge', ''); api.entities.setActive('e-kivu');
const n2 = await api.notifications.list();
ok(n2.some((x) => x.title === 'PO revised at loading' && x.body.includes(`${baseRef} revised → ${baseRef}-rev001`)), 'planner notified of the revision');
const pv2 = await api.reports.plannedVsActual({});
const orderedRefs = pv2.lines.flatMap((l) => l.pos.map((x) => x.ref)).filter((x) => x.startsWith(baseRef));
ok(orderedRefs.length > 0 && orderedRefs.every((x) => x === `${baseRef}-rev002`), 'planned vs actual counts the latest revision only (no double counting)');
ok(pv2.lines.flatMap((l) => l.pos).filter((x) => x.ref.startsWith(baseRef)).reduce((a, x) => a + x.cases, 0) === 1800 + 1900 + 2000, 'ordered = what the latest revision says');
await rejects(() => api.plans.amend(o.id, 'more'), 409, 'a revised order is not amended');

// Feature gating: accounts read plans, can't edit; sales/drivers don't see them; thresholds are directors'
await api.auth.login('u-acc', '');
ok((await api.periodPlans.list()).length > 0, 'accounts can view period plans');
await rejects(() => api.periodPlans.create({ periodKind: 'month', from: '2026-12-01', to: '2026-12-31', title: 'x', entityId: 'e-btw' } as never), 403, 'accounts cannot create period plans');
await rejects(() => api.settings.setPvThresholds({ behind: 0.9 }), 403, 'accounts cannot change PV thresholds');
await api.auth.login('u-asie', '');
await rejects(() => api.periodPlans.list(), 403, 'receiver has no period plans');
await rejects(() => api.reports.plannedVsActual({}), 403, 'receiver has no planned vs actual');
await api.auth.login('u-dir', '');
await rejects(() => api.settings.setPvThresholds({ behind: 1.4 }), 422, 'thresholds validated');
ok((await api.settings.setPvThresholds({ behind: 0.9, over: 1.1 })).over === 1.1, 'director sets PV thresholds');

if (fails) { console.log(`${fails} plan check(s) failed`); process.exit(1); } else console.log('all plan checks passed');
