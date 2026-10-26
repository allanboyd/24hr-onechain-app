// docs/09 §4 — purchase orders are created, updated (= a revision) or deleted, never drafted. Pure rules + the mock flows.
// Run: tsx packages/api/test/pos.test.ts
import * as api from '../src/index';
import * as R from '../src/rules';
import type { PlanLine } from '../src/types';

let fails = 0;
const ok = (c: unknown, m: string, extra?: unknown) => { if (!c) { fails++; console.log('FAIL', m, extra ?? ''); } else console.log('ok  ', m); };
const rejects = async (f: () => Promise<unknown>, status: number, m: string, re?: RegExp) => {
  try { await f(); ok(false, `${m} (expected ${status})`); } catch (e) { const x = e as { status?: number; message: string }; ok(x.status === status && (!re || re.test(x.message)), `${m} → ${x.message} ${x.status}`); }
};

// ---- pure rules ---------------------------------------------------------------------------------------------------------
const L = (id: string, truckNo: number, productId: string, qty: number, price = 10): PlanLine => ({ id, truckNo, productId, qty, price, routeId: 'r1', deliveredToId: 'rc' });
const ch = R.diffPoLines([L('a', 1, 'p1', 100), L('b', 2, 'p1', 50)], [L('a', 1, 'p1', 80), L('c', 3, 'p2', 40)], 'updated');
ok(ch.map((c) => `${c.lineId}:${c.kind}`).join() === 'a:updated,b:removed,c:added' && ch[0].before?.qty === 100 && ch[0].after?.qty === 80 && !ch[1].after && !ch[2].before, 'diffPoLines: updated / removed / added with before → after');
ok(R.lineChangeText(ch[0], () => 'Tusker') === 'Truck 1: Tusker 100 → 80 cases', 'change text', R.lineChangeText(ch[0], () => 'Tusker'));
ok(R.nextRevisionNo([{}, { revision: 1 }, { revision: 2 }]) === 3 && R.nextRevisionNo([{}]) === 1, 'one revision counter for the whole chain');
ok(R.poStage({ status: 'Issued' }, [], []) === 'Created' && R.poStage({ status: 'Issued', sentAt: 'x' }, [{ status: 'Pending' }], []) === 'Sent'
  && R.poStage({ status: 'Issued' }, [{ status: 'Loaded' }, { status: 'Pending' }], [{ status: 'Loaded', legs: [] }]) === 'Loading'
  && R.poStage({ status: 'Issued' }, [{ status: 'Loaded' }], [{ status: 'In transit', legs: [] }]) === 'On the road'
  && R.poStage({ status: 'Issued' }, [{ status: 'Loaded' }], [{ status: 'Acknowledged', legs: [] }]) === 'Delivered'
  && R.poStage({ status: 'Awaiting approval' }, [], []) === 'Awaiting approval' && R.poStage({ status: 'Deleted' }, [], []) === 'Deleted', 'poStage: Created → Sent → Loading → On the road → Delivered (+ Awaiting approval, Deleted)');
ok(R.poDeleteBlock({ status: 'Issued' }, [{ status: 'Pending' }], []) === null && /can no longer be deleted/.test(R.poDeleteBlock({ status: 'Issued' }, [{ status: 'Loaded' }], [{}]) ?? ''), 'delete only while nothing is loaded');
const prev = [L('a', 1, 'p1', 100), L('b', 2, 'p1', 50)];
ok(R.poUpdateBlock({ status: 'Issued' }, prev, [L('a', 1, 'p1', 90), L('b', 2, 'p1', 10)], [1], { a: 90 }, 2) === null, 'update: a loaded line may stay at its loaded quantity; unloaded trucks change freely');
ok(/can't go below/.test(R.poUpdateBlock({ status: 'Issued' }, prev, [L('a', 1, 'p1', 80), L('b', 2, 'p1', 50)], [1], { a: 90 }, 2) ?? ''), 'update: below the loaded quantity refused');
ok(/can't be removed/.test(R.poUpdateBlock({ status: 'Issued' }, prev, [L('b', 2, 'p1', 50)], [1], { a: 90 }, 2) ?? ''), 'update: a loaded line cannot be removed');
ok(/add the goods on another truck/.test(R.poUpdateBlock({ status: 'Issued' }, prev, [...prev, L('x', 1, 'p2', 5)], [1], { a: 100 }, 2) ?? ''), 'update: no new lines on a loaded truck');
ok(/no longer be updated/.test(R.poUpdateBlock({ status: 'Issued' }, prev, prev, [1, 2], { a: 100, b: 50 }, 2) ?? ''), 'update: fully loaded refused');
ok(R.nextRef(['BTW-PO-2026-0002', 'BTW-PO-2026-0002-rev001', 'BTW-PO-2026-0007'], 'BTW-PO', 2026) === 'BTW-PO-2026-0008', 'nextRef skips revision refs');

// ---- mock flows (same rules as the API) ----------------------------------------------------------------------------------
api.demo.reset(); await api.ready();
await api.auth.login('u-kabonge', ''); api.entities.setActive('e-btw');
// seeded content: no drafts; versions panel has content
const all = await api.pos.list({ all: true });
ok(!all.some((p) => p.supersededById) && all.some((p) => p.status === 'Deleted') === false, 'Kabonge (BTW): effective POs only');
const seeded = (await api.pos.get('po-1'))!;
ok(seeded.versions.length === 2 && seeded.versions[0].kind === 'original' && seeded.versions[1].kind === 'updated' && seeded.versions[1].reason && seeded.po.supersededById, 'seed: BTW-PO-2026-0002 original + office update rev001 (reason kept)');
ok(!seeded.versions[0].lines.some((l) => l.truckNo === 5) && seeded.versions[1].lines.find((l) => l.truckNo === 5)?.qty === 1500 && seeded.versions[1].lineChanges[0]?.kind === 'added' && seeded.versions[0].lines.length === seeded.versions[1].lines.length - 1, 'original lines stored alongside the revised lines (not overwritten)');
api.entities.setActive('e-nud');
const nud = (await api.pos.list()).find((p) => p.baseRef === 'NUD-PO-2026-0009')!;
const nudD = (await api.pos.get(nud.id))!;
ok(nud.ref === 'NUD-PO-2026-0009-rev002' && nudD.versions.map((v) => v.kind).join() === 'original,updated,revised at loading', 'seed: office update rev001 then loading revision rev002 — one counter', nudD.versions.map((v) => [v.ref, v.kind]));
api.entities.setActive('e-kivu');
ok(!(await api.pos.list()).some((p) => p.ref === 'KVD-PO-2026-0011') && (await api.pos.list({ all: true })).some((p) => p.ref === 'KVD-PO-2026-0011' && p.status === 'Deleted' && p.deleteReason), 'seed: deleted PO hidden by default, kept with its reason');

// create → issued (approvals off)
api.entities.setActive('e-btw');
const ln = (no: number, qty: number) => ({ ...api.pos.newLine('s-kbl', no), qty, routeId: 'r-nbo-kgl' });
let po = await api.pos.create({ supplierId: 's-kbl', title: 'PO test', lines: [ln(1, 1000), ln(2, 1200)] });
const ref0 = po.ref;
ok(/^BTW-PO-\d{4}-\d{4}$/.test(ref0) && po.status === 'Issued' && po.approval === 'issued' && po.stage === 'Created', 'create: issued at once with a new ref, stage Created', po);
let d = (await api.pos.get(po.id))!;
ok(d.versions.length === 1 && d.versions[0].revision === 0 && d.actions.update && d.actions.delete, 'create: original snapshot; may update and delete');
ok((await api.loading.list('s-kbl')).filter((l) => l.poId === po.id).length === 2, 'create: one loading per truck');
const n0 = await api.notifications.list();
ok(n0.some((x) => x.title === 'Purchase order created' && x.body.includes(ref0) && x.body.includes('approved automatically')) && !n0.some((x) => /ready to issue|awaiting approval/i.test(x.title) && x.body.includes(ref0)), 'notification: created, approved automatically (no "ready to issue")');
await rejects(() => api.pos.create({ supplierId: 's-kbl', title: 'x', lines: [] }), 422, 'create without lines refused');

// update → rev001 (original + revised stored), rev002 next
const lines1 = d.plan.lines.map((l) => (l.truckNo === 2 ? { ...l, qty: 1100 } : l));
await rejects(() => api.pos.update(po.id, { title: 'PO test', lines: lines1, reason: ' ' }), 422, 'update without a reason refused');
await rejects(() => api.pos.update(po.id, { title: 'PO test', lines: d.plan.lines, reason: 'no change' }), 422, 'update without a change refused');
const r1 = await api.pos.update(po.id, { title: 'PO test', lines: lines1, reason: 'Supplier short on truck 2' });
ok(r1.ref === `${ref0}-rev001` && r1.revisionKind === 'updated' && r1.lineChanges?.length === 1 && r1.lineChanges[0].before?.qty === 1200 && r1.lineChanges[0].after?.qty === 1100, 'update → rev001 with per-line before → after', r1);
d = (await api.pos.get(po.id))!;
ok(d.effectiveId === r1.id && d.versions.length === 2 && d.versions[0].lines.find((l) => l.truckNo === 2)!.qty === 1200 && d.versions[1].lines.find((l) => l.truckNo === 2)!.qty === 1100, 'original kept beside rev001; effective = rev001');
ok((await api.loading.list('s-kbl')).filter((l) => l.poId === r1.id).find((l) => l.truckNo === 2)!.lines[0].orderedQty === 1100, 'pending loadings follow the effective version');
const lines2 = [...(await api.pos.get(r1.id))!.plan.lines, ln(3, 900)];
const r2 = await api.pos.update(r1.id, { title: 'PO test', lines: lines2, reason: 'Third truck' });
ok(r2.ref === `${ref0}-rev002` && r2.lineChanges?.[0]?.kind === 'added', 'next update → rev002 (truck added)');
// loading revision interleaves in the same counter
await api.auth.login('u-joel', ''); api.entities.setActive('e-btw');
const lds = (await api.loading.list('s-kbl')).filter((l) => l.poId === r2.id).sort((a, b) => a.truckNo - b.truckNo);
ok(lds.length === 3 && lds[0].nextRevisionRef === `${ref0}-rev003`, 'pending truck: a deviation would make rev003');
const sh = await api.loading.confirm(lds[0].id, { truckId: 't2', driverId: 'd3', loadedQty: { [lds[0].lines[0].planLineId]: 950 }, documents: [] });
await api.auth.login('u-kabonge', ''); api.entities.setActive('e-btw');
d = (await api.pos.get(sh.poId))!;
ok(d.po.ref === `${ref0}-rev003` && d.versions.map((v) => v.kind).join() === 'original,updated,updated,revised at loading' && d.versions[3].lineChanges[0]?.kind === 'revised at loading', 'loading revision → rev003 after two office updates (one counter)');
ok(d.loaded[lds[0].lines[0].planLineId] === 950, 'loaded cases per line');
// reduce below loaded refused; other trucks still update → rev004
const eff = d.plan.lines;
await rejects(() => api.pos.update(d.po.id, { title: 'PO test', lines: eff.map((l) => (l.truckNo === 1 ? { ...l, qty: 900 } : l)), reason: 'cut' }), 409, 'reduce a loaded line below what was loaded → refused', /below/);
await rejects(() => api.pos.remove(d.po.id, 'not needed'), 409, 'delete after loading → refused (update instead)', /Update it instead/);
ok(!d.actions.delete && d.actions.deleteBlocked && d.actions.update, 'view: delete blocked with the reason; update still allowed');
const r4 = await api.pos.update(d.po.id, { title: 'PO test', lines: eff.map((l) => (l.truckNo === 3 ? { ...l, qty: 800 } : l)), reason: 'Truck 3 smaller' });
ok(r4.ref === `${ref0}-rev004`, 'office update after the loading revision → rev004');
// reports use the effective version only (no double counting)
const pv = await api.reports.plannedVsActual({});
const refs = pv.lines.flatMap((l) => l.pos.map((x) => x.ref)).filter((x) => x.startsWith(ref0));
ok(refs.length > 0 && refs.every((x) => x === r4.ref), 'planned vs actual counts the effective revision only', refs);

// delete before loading: soft, hidden, loadings removed, ref not reused
const del = await api.pos.create({ supplierId: 's-kbl', title: 'To delete', lines: [ln(1, 500)] });
await rejects(() => api.pos.remove(del.id, ''), 422, 'delete without a reason refused');
const gone = await api.pos.remove(del.id, 'Raised by mistake');
ok(gone.status === 'Deleted' && gone.deleteReason === 'Raised by mistake' && !(await api.pos.list()).some((p) => p.id === del.id) && (await api.pos.list({ all: true })).some((p) => p.id === del.id), 'soft delete: status Deleted with reason, hidden from the default list');
ok(!(await api.loading.list('s-kbl')).some((l) => l.poId === del.id), 'delete: its pending loadings are removed');
await rejects(() => api.pos.update(del.id, { title: 'x', lines: [ln(1, 1)], reason: 'x' }), 409, 'a deleted PO cannot be updated');
const nxt = await api.pos.create({ supplierId: 's-kbl', title: 'After delete', lines: [ln(1, 500)] });
ok(nxt.ref !== del.ref && nxt.ref > del.ref, 'a deleted ref is never reused');
await api.auth.login('u-daniel', ''); api.entities.setActive('e-btw');
ok((await api.audit.list({ q: 'Raised by mistake' })).rows.some((a) => a.summary?.includes(del.ref) && a.summary.includes('deleted')), 'audit: delete logged with its reason');
await api.auth.login('u-kabonge', ''); api.entities.setActive('e-btw');

// approvals on: created awaiting approval, director approves; off again → auto-approved
api.demo.setConfig({ approvals: { purchaseOrders: true } });
const aw = await api.pos.create({ supplierId: 's-kbl', title: 'Awaiting', lines: [ln(1, 700)] });
ok(aw.status === 'Awaiting approval' && aw.stage === 'Awaiting approval' && !(await api.loading.list('s-kbl')).some((l) => l.poId === aw.id), 'approvals on: awaiting approval, nothing to load yet');
await rejects(() => api.pos.markSent(aw.id), 409, 'awaiting approval: not sent to the supplier');
await api.auth.login('u-daniel', ''); api.entities.setActive('e-btw');
ok((await api.pos.get(aw.id))!.actions.approve, 'director may approve');
const ap = await api.pos.decide(aw.id, 'approved', '', 'sig:director');
ok(ap.status === 'Issued' && ap.approval === 'director' && (await api.loading.list('s-kbl')).some((l) => l.poId === aw.id), 'director approves → issued, trucks to load');
await api.auth.login('u-kabonge', ''); api.entities.setActive('e-btw');
const aw2 = await api.pos.create({ supplierId: 's-kbl', title: 'Awaiting 2', lines: [ln(1, 700)] });
api.demo.setConfig({ approvals: { purchaseOrders: false } });
ok((await api.pos.get(aw2.id))!.po.status === 'Issued', 'switch turned off → POs awaiting approval are approved automatically');

// access: Kabonge his pairs; directors all; loaders / receivers no prices; no editing for them
await rejects(() => api.pos.create({ entityId: 'e-nud', supplierId: 's-gbi', title: 'x', lines: [{ ...api.pos.newLine('s-gbi', 1), qty: 10 }] }), 403, 'Kabonge: not his pair (Nihna–GBI)');
await api.auth.login('u-joel', ''); api.entities.setActive('e-btw');
const jd = (await api.pos.get(r4.id))!;
ok(jd.po.pricesHidden && jd.versions.every((v) => v.lines.every((l) => l.price === undefined) && v.lineChanges.every((c) => c.before?.price === undefined && c.after?.price === undefined)) && !jd.actions.update && !jd.actions.delete, 'loader: versions without prices; cannot update or delete');
await rejects(() => api.pos.update(r4.id, { title: 'x', lines: jd.plan.lines as never, reason: 'x' }), 403, 'loader cannot update');
await api.auth.login('u-daniel', ''); api.entities.setActive('e-nud');
const dn = await api.pos.create({ supplierId: 's-gbi', title: 'Director order', lines: [{ ...api.pos.newLine('s-gbi', 1), qty: 900 }] });
ok(dn.status === 'Issued', 'director creates for any pair');

if (fails) { console.log(`${fails} PO check(s) failed`); process.exit(1); } else console.log('all PO checks passed');
