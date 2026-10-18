// The client's three rules over HTTP, with the DEFAULT config (no config.toml → approvals.purchase_orders = false,
// ±10 % loading allowance, alternatives on, "-rev" suffix):
//  1) period plans are standalone suggestions — no approval; Active plans never overlap (409 + conflicts, or replace);
//  2) the planner issues a PO directly (no director approval), the letter says ISSUED;
//  3) loading uses the PO with an allowance; any deviation writes a PO revision (…-rev001, -rev002) that downstream follows.
import { client, expectStatus, ok, section, type Env } from './harness';

export async function revisionsSuite(env: Env) {
  const c = client(env.base);
  const T = { dir: (await c.login('dir')).accessToken, plan: (await c.login('kabonge')).accessToken, joel: (await c.login('joel')).accessToken, acc: (await c.login('acc')).accessToken };
  const btw = { 'x-entity-id': 'e-btw' };
  const ref = (await c.req('GET', '/ref', { token: T.dir })).body;

  section('Config · config.toml defaults in GET /ref');
  ok(ref.config?.approvals?.purchaseOrders === false && ref.config.loading.allowancePct === 10 && ref.config.loading.allowAlternatives === true && ref.config.loading.revisionSuffix === '-rev',
    'missing config.toml → defaults (no PO approval, ±10 %, alternatives, -rev)', ref.config);

  section('Rule 1 · period plans: suggestions, never overlapping');
  const all0 = (await c.req('GET', '/period-plans?all=1', { token: T.dir })).body as any[];
  ok(all0.length > 0 && all0.every((p) => ['Active', 'Replaced'].includes(p.status)), 'statuses are Active / Replaced only', all0.map((p) => p.status));
  const act0 = all0.filter((p) => p.status === 'Active');
  ok(act0.every((a) => act0.every((b) => a === b || a.entityId !== b.entityId || a.to < b.from || b.to < a.from)), 'seed: no overlapping Active plans per company');
  let r = await c.req('POST', '/period-plans', { token: T.plan, body: { entityId: 'e-btw', periodKind: 'quarter', from: '2031-01-01', to: '2031-03-31', title: 'QA Q1 2031' } });
  ok(r.status === 201 && r.body.status === 'Active' && r.body.history?.[0]?.action === 'created', 'planner creates a plan — Active at once (no approval)', r.body);
  const q1 = r.body;
  r = await c.req('PUT', `/period-plans/${q1.id}`, { token: T.plan, body: { ...q1, lines: [{ supplierId: 's-kbl', productId: 'p-a300', cases: 3000, price: 10, destinationId: 'w-kgl' }] } });
  ok(r.status === 200 && r.body.version === 2 && r.body.history.at(-1).action === 'edited', 'save → version 2 with an edit-history entry', r.body);
  r = await c.req('POST', '/period-plans', { token: T.plan, body: { entityId: 'e-btw', periodKind: 'custom', from: '2031-03-01', to: '2031-04-30', title: 'QA overlap' } });
  ok(r.status === 409 && r.body.code === 'overlap' && r.body.conflicts?.[0]?.ref === q1.ref && r.body.title.includes(`${q1.ref} already covers 2031-01-01 – 2031-03-31`), 'overlapping new plan → 409 with the conflicting ref', r.body);
  r = await c.req('POST', '/period-plans', { token: T.plan, body: { entityId: 'e-btw', periodKind: 'custom', from: '2031-03-01', to: '2031-04-30', title: 'QA overlap', replace: true } });
  ok(r.status === 201 && r.body.status === 'Active', 'replace: true → saved', r.body);
  const mar = r.body;
  const old = (await c.req('GET', `/period-plans/${q1.id}`, { token: T.plan })).body;
  ok(old.status === 'Replaced' && old.replacedById === mar.id && old.history.at(-1).action === 'replaced', 'the overlapped plan is Replaced (kept, linked to its replacement)', old);
  const listed = (await c.req('GET', '/period-plans', { token: T.plan })).body as any[];
  const listedAll = (await c.req('GET', '/period-plans?all=1', { token: T.plan })).body as any[];
  ok(!listed.some((p) => p.id === q1.id) && listedAll.some((p) => p.id === q1.id), 'replaced plans hidden from the default list, shown with ?all=1');
  expectStatus(await c.req('PUT', `/period-plans/${q1.id}`, { token: T.plan, body: { title: 'x' } }), 409, 'a replaced plan cannot be edited');
  const jun = (await c.req('POST', '/period-plans', { token: T.plan, body: { entityId: 'e-btw', periodKind: 'month', from: '2031-06-01', to: '2031-06-30', title: 'QA June' } })).body;
  r = await c.req('PUT', `/period-plans/${jun.id}`, { token: T.plan, body: { from: '2031-04-01', to: '2031-04-30' } });
  ok(r.status === 409 && r.body.conflicts?.[0]?.id === mar.id, 'moving dates onto another plan → 409', r.body);
  r = await c.req('PUT', `/period-plans/${jun.id}`, { token: T.plan, body: { from: '2031-04-01', to: '2031-04-30', replace: true } });
  ok(r.status === 200 && (await c.req('GET', `/period-plans/${mar.id}`, { token: T.plan })).body.status === 'Replaced', 'moving dates with replace: true replaces the other plan', r.body);
  const other = await c.req('POST', '/period-plans', { token: T.plan, body: { entityId: 'e-nud', periodKind: 'month', from: '2031-04-01', to: '2031-04-30', title: 'QA NUD April' } });
  expectStatus(other, 201, 'another company may plan the same period');
  const vers = (await c.req('GET', `/period-plans/${q1.id}/versions`, { token: T.plan })).body as any[];
  ok(Array.isArray(vers) && vers.some((v) => v.version === 1) && vers.some((v) => v.version === 2), 'every saved version kept (edit history)', vers.map((v) => v.version));
  for (const [path, body] of [['submit', {}], ['decision', { action: 'approved', signature: 'x' }], ['amendments', { reason: 'x' }]] as const)
    expectStatus(await c.req('POST', `/period-plans/${jun.id}/${path}`, { token: T.dir, body }), 404, `no period-plan ${path} endpoint any more`);
  expectStatus(await c.req('POST', '/period-plans', { token: T.acc, body: { entityId: 'e-btw', periodKind: 'month', from: '2032-01-01', to: '2032-01-31', title: 'x' } }), 403, 'accounts cannot save period plans');
  r = await c.req('POST', `/period-plans/${jun.id}/copy`, { token: T.plan, body: { from: '2031-04-15', to: '2031-05-15' } });
  ok(r.status === 409 && r.body.conflicts?.[0]?.id === jun.id, 'copy onto a covered period → 409 too', r.body);

  section('Rule 2 · PO issued without director approval (approvals.purchase_orders = false)');
  let o = (await c.req('POST', '/plans', { token: T.plan, body: { entityId: 'e-btw', supplierId: 's-kbl' } })).body;
  const L = (truckNo: number, productId: string, qty: number) => ({ truckNo, productId, qty, price: 1, routeId: 'r-nbo-kgl', deliveredToId: 'rc-asie' });
  o = (await c.req('PUT', `/plans/${o.id}`, { token: T.plan, body: { title: 'QA revisions', date: '2035-05-05', lines: [L(1, 'p-a300', 1000), L(1, 'p-b500', 1000), L(2, 'p-a300', 2000), L(3, 'p-b500', 1000)] } })).body;
  ok(o.lines.every((l: any) => l.exception === 'unplanned' && !l.exceptionReason), 'no period plan covers 2035: lines marked unplanned, no reason given');
  r = await c.req('POST', `/plans/${o.id}/submit`, { token: T.plan });
  ok(r.status === 200 && r.body.status === 'Approved' && r.body.poId && r.body.history.at(-1).action === 'issued', '"Issue purchase order": PO created at once, no reason needed, no covering plan needed', r.body);
  const poId = r.body.poId as string;
  const po = (await c.req('GET', `/pos/${poId}`, { token: T.plan })).body;
  ok(po.po.approval === 'issued' && po.po.approvedById === 'u-kabonge' && po.po.ref === o.ref && po.revisions.length === 0, 'PO: approval "issued", approvedBy = the planner', po.po);
  const letter = (await c.req('GET', `/pos/${poId}/letter`, { token: T.plan })).body;
  ok(letter.mode === 'issued' && letter.approvedBy.name === 'Kabonge' && !letter.revision, 'PO letter: "ISSUED <date> by <name>" instead of the APPROVED stamp', letter);
  const pdf = await c.req('GET', `/pos/${poId}/pdf`, { token: T.plan });
  ok(pdf.status === 200 && String(pdf.body).startsWith('%PDF'), 'issued PO PDF renders', pdf.status);
  expectStatus(await c.req('POST', `/plans/${o.id}/decision`, { token: T.dir, body: { action: 'approved', signature: 'x' } }), 409, 'director decision refused while approvals are off');
  const notes = (await c.req('GET', '/notifications', { token: T.dir, headers: btw })).body as any[];
  ok(notes.some((n) => n.title === 'Purchase order issued' && n.body.includes(o.ref)) && notes.some((n) => n.title === 'New trucks to load' && n.body.includes(o.ref)), 'issue notifies (PO issued, trucks to load)');
  const summary = (await c.req('GET', '/analytics/summary', { token: T.dir, headers: btw })).body;
  ok(summary.plansPending === 0, 'no "waiting for approval" count while approvals are off', summary.plansPending);

  section('Rule 3 · loading allowance, alternatives and automatic PO revisions');
  const lds = ((await c.req('GET', '/loadings?loadingPointId=s-kbl', { token: T.joel })).body as any[]).filter((l) => l.poId === poId).sort((a, b) => a.truckNo - b.truckNo);
  ok(lds.length === 3 && lds.every((l) => l.nextRevisionRef === `${o.ref}-rev001`), 'loadings exactly as on approval; each says which revision a change would create', lds.map((l) => l.nextRevisionRef));
  const truck = ref.trucks.find((x: any) => x.capacityCases >= 2400) ?? ref.trucks[0];
  const altProduct = ref.products.find((x: any) => x.supplierId === 's-kbl' && !['p-a300', 'p-b500'].includes(x.id)) ?? ref.products.find((x: any) => x.id === 'p-b500');
  const foreign = ref.products.find((x: any) => x.supplierId !== 's-kbl');
  const [t1, t2, t3] = lds;
  const a300 = t1.lines.find((l: any) => l.productId === 'p-a300').planLineId;
  const confirm = (ld: any, loadedQty: Record<string, number>, alternatives?: unknown[]) => c.req('POST', `/loadings/${ld.id}/confirm`, { token: T.joel, body: { truckId: truck.id, driverId: 'd3', loadedQty, agreedTransport: 700, documents: ['dn.jpg'], ...(alternatives ? { alternatives } : {}) } });
  r = await confirm(t1, { [a300]: 1300 });
  ok(r.status === 422 && /Over the 10% loading allowance — ask the planner to change the PO/.test(r.body.title), 'over the ±10 % allowance refused with a clear message', r.body);
  r = await confirm(t1, { [a300]: 0, [t1.lines[1].planLineId]: 700 });
  ok(r.status === 422 && /Below the 10% loading allowance/.test(r.body.title), 'too far under the order refused too', r.body);
  r = await confirm(t3, {}, [{ productId: foreign.id, qty: 50 }]);
  ok(r.status === 422 && /not on this supplier/.test(r.body.title), "alternative from another supplier's list refused", r.body);
  ok(((await c.req('GET', '/pos', { token: T.plan })).body as any[]).filter((p) => p.ref.startsWith(o.ref)).length === 1, 'refused loadings wrote nothing (no revision)');
  r = await confirm(t1, { [a300]: 800 }, [{ productId: altProduct.id, qty: 150, replacesPlanLineId: a300 }]);
  ok(r.status === 201, 'within the allowance (1,950 of 2,000) with an alternative → loaded', r.body);
  const sh1 = r.body;
  const rev1 = (await c.req('GET', `/pos/${sh1.poId}`, { token: T.plan })).body;
  ok(rev1.po.ref === `${o.ref}-rev001` && rev1.po.revision === 1 && rev1.po.revisionOf === poId && rev1.po.approval === 'revision' && rev1.po.createdBy === 'system' && rev1.po.onBehalfOfId === 'u-joel',
    'deviation → PO revision rev001 in the same transaction (system, on behalf of the loader), shipment linked to it', rev1.po);
  ok(rev1.po.changes.length === 2 && rev1.po.changes.some((x: any) => x.kind === 'qty' && x.ordered === 1000 && x.loaded === 800) && rev1.po.changes.some((x: any) => x.kind === 'alternative' && x.loaded === 150 && x.replacesPlanLineId === a300), 'revision records the changes per line (ordered → loaded, alternative)', rev1.po.changes);
  ok(rev1.plan.lines.filter((l: any) => l.truckNo === 1).reduce((s: number, l: any) => s + l.qty, 0) === 1950 && rev1.plan.lines.filter((l: any) => l.truckNo !== 1).reduce((s: number, l: any) => s + l.qty, 0) === 3000, 'revision order: truck 1 as loaded, other trucks unchanged');
  ok(rev1.revisions.map((x: any) => x.ref).join() === `${o.ref},${o.ref}-rev001` && rev1.revisions[0].supersededById === rev1.po.id, 'original kept (superseded) and linked to the revision');
  ok(sh1.legs[0].lines.some((l: any) => l.productId === altProduct.id && l.loadedQty === 150) || altProduct.id === 'p-b500', 'the truck carries the alternative');
  const revLetter = (await c.req('GET', `/pos/${rev1.po.id}/letter`, { token: T.plan })).body;
  ok(revLetter.mode === 'issued' && revLetter.revision?.n === 1 && revLetter.revision.of === o.ref && revLetter.revision.changes.length === 2, 'revision letter: "Revision 1 of <PO>" with the changes, issued (no approval)', revLetter.revision);
  expectStatus(await c.req('GET', `/pos/${rev1.po.id}/pdf`, { token: T.plan }), 200, 'revision PDF renders');
  const notes2 = (await c.req('GET', '/notifications', { token: T.plan, headers: btw })).body as any[];
  ok(notes2.some((n) => n.title === 'PO revised at loading' && n.body.includes(`PO ${o.ref} revised → ${o.ref}-rev001 at loading (`)), 'planner notified: "PO … revised → …-rev001 at loading (…)"', notes2.slice(0, 3));
  const lds2 = ((await c.req('GET', '/loadings?loadingPointId=s-kbl', { token: T.joel })).body as any[]).filter((l) => [t2.id, t3.id].includes(l.id));
  ok(lds2.every((l) => l.poId === rev1.po.id && l.nextRevisionRef === `${o.ref}-rev002`), 'other trucks now follow rev001; the next change would be rev002');
  r = await confirm(t2, {});
  ok(r.status === 201 && r.body.poId === rev1.po.id, 'loaded exactly as ordered → no new revision', r.body.poId);
  r = await confirm(t3, { [t3.lines[0].planLineId]: 950 });
  ok(r.status === 201, 'truck 3 loads 950 of 1,000 (within allowance)', r.body);
  const rev2 = (await c.req('GET', `/pos/${r.body.poId}`, { token: T.plan })).body;
  ok(rev2.po.ref === `${o.ref}-rev002` && rev2.po.revisionOf === poId && rev2.revisions.length === 3, 'next deviation → rev002, numbered from the ORIGINAL ref', rev2.po.ref);
  const byTruck = (n: number) => rev2.plan.lines.filter((l: any) => l.truckNo === n).reduce((s: number, l: any) => s + l.qty, 0);
  ok(byTruck(1) === 1950 && byTruck(2) === 2000 && byTruck(3) === 950, 'rev002 cloned from rev001: reflects everything loaded so far', [byTruck(1), byTruck(2), byTruck(3)]);
  ok((await c.req('GET', `/pos/${rev1.po.id}`, { token: T.plan })).body.po.supersededById === rev2.po.id, 'rev001 superseded by rev002, still viewable');
  const s1 = (await c.req('GET', `/shipments/${sh1.id}`, { token: T.plan })).body;
  ok(s1.poId === rev2.po.id && s1.poRef === `${o.ref}-rev002`, 'earlier shipments follow the effective (latest) revision', s1.poRef);
  expectStatus(await c.req('POST', `/plans/${o.id}/amendments`, { token: T.plan, body: { reason: 'x' } }), 409, 'a PO revised at loading is not amended');
  ok(!((await c.req('GET', '/plans', { token: T.plan })).body as any[]).some((p) => p.ref.startsWith(`${o.ref}-rev`)), 'revision copies are not listed as separate orders');

  section('Rule 3 · downstream uses the latest revision (no double counting)');
  const pv = (await c.req('GET', '/reports/planned-vs-actual?from=2035-01-01&to=2035-12-31', { token: T.plan, headers: btw })).body;
  const mine = pv.lines.flatMap((l: any) => l.pos).filter((x: any) => x.ref.startsWith(o.ref));
  ok(mine.length > 0 && mine.every((x: any) => x.ref === `${o.ref}-rev002`) && mine.reduce((s: number, x: any) => s + x.cases, 0) === 4900, 'planned vs actual "ordered" = the latest revision only (4,900 cases, not 4,900 + 5,000 + …)', mine);
  const trips = ((await c.req('GET', '/finance/trips', { token: T.dir, headers: btw })).body as any[]).filter((x) => [rev1.po.id, rev2.po.id, poId].includes(x.shipment.poId));
  ok(trips.length === 3 && trips.every((x) => x.shipment.poId === rev2.po.id && x.goods > 0), 'finance: one trip per truck, priced from the latest revision', trips.map((x) => [x.shipment.poId, x.goods]));
  const posList = ((await c.req('GET', '/pos', { token: T.plan })).body as any[]).filter((p) => p.ref.startsWith(o.ref));
  ok(posList.length === 3 && posList.filter((p) => !p.supersededById).length === 1, 'PO list: original + 2 revisions, one effective');
  const dq = (await c.req('GET', '/reports/capture-check', { token: T.dir, headers: btw })).body;
  ok(dq && !JSON.stringify(dq).includes(`${o.ref}-rev001 was`), 'data-quality report ignores superseded POs');
  const stock = (await c.req('GET', '/stock', { token: T.dir, headers: btw })).body as any[];
  ok(stock.some((x) => x.productId === 'p-a300' && x.inTransit >= 2800), 'in-transit stock = what was actually loaded', stock.filter((x) => x.productId === 'p-a300').map((x) => x.inTransit));
}
