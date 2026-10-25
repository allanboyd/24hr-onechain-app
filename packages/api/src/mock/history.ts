// ~15 months of completed operations behind the live demo, so reports have real trends to show:
// plans → POs → loadings → shipments (1–2 legs, real checkpoint times, border dwell, issues) → acknowledgements
// → stock receipts, plus trip costs and payments. Built by simulating stock per warehouse × SKU against the seeded
// sales: a truck is ordered whenever projected cover drops below the lane's lead time + 16 days.
// Deterministic (seeded PRNG), relative to `now`: the browser mock and the server seed build the same history.
// A few deliberate capture gaps are planted (see CAPTURE GAPS) so the period "capture check" has something to find.
import * as seed from './seed';
import * as R from '../rules';
import type {
  AckLine, Acknowledgement, Leg, Loading, Plan, PlanLine, PurchaseOrder, Route, Sale, Shipment, TripCost, TripPayment, TruckIssue,
} from '../types';

const H = 36e5, DAY = 864e5;
const iso = (t: number) => new Date(t).toISOString();

/** Supply lane (route chain) per warehouse × SKU. Goma gets UBL/SBL goods via a Gisenyi transfer leg. */
export const LANES: Record<string, Record<string, string[]>> = {
  'w-kgl': { 'p-a300': ['r-nbo-kgl'], 'p-b500': ['r-nbo-kgl'], 'p-c200': ['r-kla-kgl'], 'p-d300': ['r-kla-kgl'], 'p-e330': ['r-mwz-kgl'] },
  'w-goma': { 'p-a300': ['r-nbo-goma'], 'p-b500': ['r-nbo-goma'], 'p-c200': ['r-kla-kgl', 'r-kgl-goma'], 'p-e330': ['r-mwz-kgl', 'r-kgl-goma'] },
  'w-juba': { 'p-a300': ['r-nbo-juba'], 'p-b500': ['r-nbo-juba'], 'p-f330': ['r-msa-juba'] }, // p-d300 in Juba: opening stock only (dead stock)
};
/** Agreed transport per truck by route (USD). */
export const TRANSPORT_RATE: Record<string, number> = {
  'r-nbo-kgl': 1650, 'r-nbo-goma': 1900, 'r-nbo-juba': 1900, 'r-kla-kgl': 900, 'r-msa-kgl': 2300, 'r-msa-juba': 2300, 'r-mwz-kgl': 1100, 'r-kgl-juba': 1400, 'r-kgl-goma': 450,
};
const ENTITY_OF = seed.ENTITY_OF_SUPPLIER;
/** Local currency of handling charges at the loading country / destination (non-USD costs carry fx_rate + amount_usd). */
const LOADING_CCY: Record<string, 'KES' | 'UGX' | 'TZS'> = { 's-kbl': 'KES', 's-gbi': 'KES', 's-ubl': 'UGX', 's-sbl': 'TZS' };
const TRUCKS_OF: Record<string, [string, string][]> = { // [truck, driver] pools per loading point
  's-kbl': [['t1', 'd1'], ['t2', 'd3'], ['t4', 'd4'], ['t7', 'd7']], 's-ubl': [['t3', 'd2'], ['t5', 'd5']],
  's-sbl': [['t6', 'd6'], ['t5', 'd5']], 's-gbi': [['t7', 'd7'], ['t4', 'd4']],
};
const TRANSFER: [string, string] = ['t8', 'd5'];
const RECEIVER: Record<string, string> = { 'w-kgl': 'Asie Gisenyi – J. Uwase', 'w-goma': 'Asie Goma – P. Bahati', 'w-juba': 'Yonas Juba – M. Deng' };
const ISSUE_REASONS = ['Breakdown — gearbox', 'Clearing documents pending (C&F agent)', 'Weighbridge queue', 'Police check', 'Road closure after heavy rain', 'Tyre burst'];

interface Order { idx: number; wh: string; pid: string; supplierId: string; chain: string[]; truck: [string, string]; capacity: number }

export interface HistoryTarget {
  routes: Route[]; trucks: { id: string; capacityCases: number }[];
  plans: Plan[]; pos: PurchaseOrder[]; loadings: Loading[]; shipments: Shipment[]; acks: Acknowledgement[];
  costs: TripCost[]; payments: TripPayment[]; sales: Sale[];
  stockMoves: R.StockMove[];
}

export function buildHistory(d: HistoryTarget, now = Date.now()) {
  const r = seed.rng(4242);
  const today = Math.floor(now / DAY) * DAY;
  const start = today - seed.HISTORY_DAYS * DAY;
  const stops = (id: string) => d.routes.find((x) => x.id === id)!.stops;
  const cp = (id: string) => seed.checkpoints.find((c) => c.id === id)!;
  const product = (id: string) => seed.products.find((p) => p.id === id)!;
  const listPrice = (pid: string) => seed.priceList.find((x) => x.productId === pid)?.price ?? 10;
  const capacity = (t: string) => d.trucks.find((x) => x.id === t)?.capacityCases ?? 2200;
  const chainHours = (chain: string[]) => chain.reduce((a, id) => { const s = stops(id); const last = s.at(-1)!; return a + last.plannedHours + s.reduce((b, x) => b + x.plannedDwellHours, 0) * 0.3; }, 0) + (chain.length - 1) * 24;

  // Daily sales per warehouse × SKU (index 0 = start day)
  const N = seed.HISTORY_DAYS;
  const sold = new Map<string, number[]>();
  for (const s of d.sales) {
    const i = Math.floor((Date.parse(s.at) - start) / DAY);
    if (i < 0 || i >= N) continue;
    for (const l of s.lines) { const k = `${s.warehouseId}|${l.productId}`; if (!sold.has(k)) sold.set(k, new Array(N).fill(0)); sold.get(k)![i] += l.qty; }
  }

  // ---- 1. Simulate stock and decide orders ---------------------------------------------------------
  const orders: Order[] = [];
  const opening: { wh: string; pid: string; qty: number }[] = [];
  const pick: Record<string, number> = {};
  for (const [wh, prods] of Object.entries(seed.salesPattern)) {
    for (const pid of Object.keys(prods)) {
      const k = `${wh}|${pid}`; const daily = sold.get(k) ?? new Array(N).fill(0);
      const chain = LANES[wh]?.[pid];
      const avg0 = daily.slice(0, 30).reduce((a, x) => a + x, 0) / 30;
      let stock = Math.max(400, Math.round(avg0 * (chain ? 55 : 0) / 10) * 10 || 2100);
      opening.push({ wh, pid, qty: stock });
      if (!chain) continue;
      const supplierId = product(pid).supplierId;
      const leadDays = 4 + chainHours(chain) / 24;
      const pipe: { day: number; qty: number }[] = [];
      for (let i = 0; i < N; i++) {
        for (const p of pipe.filter((x) => x.day === i)) stock += p.qty;
        stock -= daily[i];
        const recent = daily.slice(Math.max(0, i - 21), i + 1);
        const avg = recent.reduce((a, x) => a + x, 0) / recent.length || avg0;
        const pending = pipe.filter((x) => x.day > i).reduce((a, x) => a + x.qty, 0);
        const projected = stock + pending;
        if (avg > 0 && projected / avg < leadDays + 16) {
          const deficit = (leadDays + 30) * avg - projected;
          const n = Math.max(1, Math.min(3, Math.ceil(deficit / 2200)));
          for (let j = 0; j < n; j++) {
            const pool = TRUCKS_OF[supplierId];
            pick[supplierId] = ((pick[supplierId] ?? -1) + 1) % pool.length;
            const truck = pool[pick[supplierId]];
            const arriveDay = i + Math.ceil(leadDays) + 4; // loading wait + border dwell variance
            const cap = capacity(truck[0]);
            pipe.push({ day: arriveDay, qty: cap - 8 });
            if (start + arriveDay * DAY >= now - 2 * DAY) continue; // still on the road today: that part belongs to the live demo
            orders.push({ idx: i, wh, pid, supplierId, chain, truck, capacity: cap });
          }
        }
      }
    }
  }
  for (const o of opening) d.stockMoves.push({ entityId: seed.entityOfProduct(o.pid), warehouseId: o.wh, productId: o.pid, kind: 'adjustment', qty: o.qty, at: iso(start - DAY), ref: 'Opening balance' });
  const fx = seed.seedFxRates(now);

  // ---- 2. Plans + POs: one per supplier per month ------------------------------------------------------
  orders.sort((a, b) => a.idx - b.idx);
  const groups = new Map<string, Order[]>();
  for (const o of orders) { const key = `${o.supplierId}|${new Date(start + o.idx * DAY).toISOString().slice(0, 7)}`; if (!groups.has(key)) groups.set(key, []); groups.get(key)!.push(o); }
  const usedRefs = new Set(d.plans.map((p) => p.ref));
  const counters: Record<string, number> = {};
  const nextRef = (entityId: string, year: number) => {
    const prefix = seed.entities.find((e) => e.id === entityId)!.poPrefix;
    let ref = '';
    do { const c = (counters[`${prefix}${year}`] = (counters[`${prefix}${year}`] ?? 0) + 1); ref = `${prefix}-${year}-${String(c).padStart(4, '0')}`; } while (usedRefs.has(ref));
    usedRefs.add(ref); return ref;
  };
  let nPlan = 0, nShip = 0, nLeg = 0, nAck = 0, nCost = 0, nPay = 0, nIss = 0;
  const shipRefs: Record<number, number> = {};
  const lines: { o: Order; plan: Plan; po: PurchaseOrder; line: PlanLine }[] = [];
  const histPlans: Plan[] = [], histPos: PurchaseOrder[] = [];
  for (const [, os] of groups) {
    const o0 = os[0]; nPlan++;
    const dateT = start + o0.idx * DAY + 8 * H;
    const year = new Date(dateT).getUTCFullYear();
    const entityId = ENTITY_OF[o0.supplierId];
    const ref = nextRef(entityId, year);
    const month = new Date(dateT).toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' });
    // Kabonge raises BTW–KBL, Nihna–UBL and Kivu–SBL; Nihna–GBI is not his (to confirm, Q2) — a director raised those.
    const raiser = o0.supplierId === 's-gbi' ? seed.DIRECTOR_ID : seed.PLANNER_ID;
    const approver = nPlan % 2 ? 'u-daniel' : 'u-michael';
    const plan: Plan = {
      id: `h-plan-${nPlan}`, ref, title: `${month} ’${String(year).slice(2)} Order`, entityId, supplierId: o0.supplierId, currency: 'USD',
      date: iso(dateT).slice(0, 10), requiredBy: iso(dateT + 10 * DAY).slice(0, 10), status: 'Approved', version: 1, createdById: raiser,
      lines: [], history: [{ at: iso(dateT), byUserId: raiser, action: 'submitted' }, { at: iso(dateT + 5 * H), byUserId: approver, action: 'approved', signature: 'sig:director' }],
      poId: `h-po-${nPlan}`,
    };
    const progress = o0.idx / N;
    os.forEach((o, i) => {
      const line: PlanLine = { id: `h-pl-${nPlan}-${i + 1}`, truckNo: i + 1, productId: o.pid, qty: o.capacity, price: Math.round(listPrice(o.pid) * (0.96 + 0.04 * progress) * 100) / 100, deliveredToId: seed.warehouses.find((w) => w.id === o.wh)!.receivingCompanyId, routeId: o.chain[0] };
      plan.lines.push(line);
    });
    const po: PurchaseOrder = {
      id: plan.poId!, ref, planId: plan.id, entityId, supplierId: o0.supplierId, currency: 'USD', date: plan.date, title: plan.title,
      instruction: 'Kindly process and avail stock for loading.', version: 1, sentAt: iso(dateT + 7 * H), approvedById: approver, approvedAt: iso(dateT + 5 * H), signature: 'sig:director',
    };
    histPlans.push(plan); histPos.push(po);
    os.forEach((o, i) => lines.push({ o, plan, po, line: plan.lines[i] }));
  }

  // ---- 3. Loadings, shipments, legs, acknowledgements, stock, costs, payments ---------------------------
  const histLoadings: Loading[] = [], histShipments: Shipment[] = [], histAcks: Acknowledgement[] = [];
  const onward: Shipment[] = []; // doc 08 §2: each next leg is a NEW shipment from the warehouse where the goods were received
  for (const { o, po, line } of lines) {
    const loadT = start + (o.idx + 2 + Math.floor(r() * 2)) * DAY + (7 + r() * 4) * H;
    const ordered = line.qty;
    const loadedQty = r() < 0.12 ? ordered - Math.round(r() * 5 + 1) * 10 : ordered; // occasional short loading (explained on the delivery note)
    nShip++;
    const year = new Date(loadT).getUTCFullYear();
    shipRefs[year] = (shipRefs[year] ?? 1000) + 1;
    const ld: Loading = {
      id: `h-ld-${nShip}`, entityId: po.entityId, poId: po.id, truckNo: line.truckNo, truckId: o.truck[0], driverId: o.truck[1], loadingPointId: o.supplierId, loadedAt: iso(loadT),
      lines: [{ planLineId: line.id, productId: o.pid, orderedQty: ordered, loadedQty }], agreedTransport: TRANSPORT_RATE[o.chain[0]] ?? 1500, transportCurrency: 'USD',
      documents: [{ id: `h-doc-${nShip}`, kind: 'delivery-note', name: `DN-${po.ref}-${line.truckNo}.jpg` }], status: 'Loaded',
    };
    histLoadings.push(ld);
    const wh = seed.warehouses.find((w) => w.id === o.wh)!;
    const sh: Shipment = { id: `h-shp-${nShip}`, entityId: po.entityId, ref: `SHP-${year}-${shipRefs[year]}`, poId: po.id, truckNo: line.truckNo, receivingCompanyId: wh.receivingCompanyId, warehouseId: wh.id, legs: [], status: 'Acknowledged' };
    let depart = loadT + (3 + r() * 3) * H;
    let carried = [{ productId: o.pid, loadedQty }];
    const goods = loadedQty * line.price;
    let cur = sh;
    o.chain.forEach((routeId, li) => {
      const st = stops(routeId);
      const [truckId, driverId] = li === 0 ? o.truck : TRANSFER;
      const endWh = seed.warehouses.find((w) => w.checkpointId === st.at(-1)!.checkpointId) ?? wh;
      if (li === 0 && endWh.id !== wh.id) { sh.plannedWarehouseId = wh.id; sh.warehouseId = endWh.id; }
      if (li > 0) {
        const fromWh = seed.warehouses.find((w) => w.id === cur.warehouseId)!;
        shipRefs[year]++;
        cur = { id: `${sh.id}-${li + 1}`, entityId: sh.entityId, ref: `SHP-${year}-${shipRefs[year]}`, poId: po.id, truckNo: line.truckNo, receivingCompanyId: endWh.receivingCompanyId, warehouseId: endWh.id, legs: [], status: 'Acknowledged',
          parentShipmentId: cur.id, originShipmentId: sh.id, fromWarehouseId: fromWh.id };
        onward.push(cur);
        for (const c of carried) d.stockMoves.push({ entityId: sh.entityId, warehouseId: fromWh.id, productId: c.productId, kind: 'transferOut', qty: c.loadedQty, at: iso(depart), ref: cur.ref });
      }
      nLeg++;
      const leg: Leg = {
        id: `h-leg-${nLeg}`, seq: 1, routeId, fromId: st[0].checkpointId, toId: st.at(-1)!.checkpointId, truckId, driverId, status: 'Acknowledged',
        departedAt: iso(depart), plannedArrival: iso(depart + st.at(-1)!.plannedHours * H), passes: R.makePasses(st, depart), lines: carried, issues: [],
      };
      leg.passes[0].arrivedAt = iso(depart - 3 * H); leg.passes[0].departedAt = iso(depart); leg.passes[0].source = 'office';
      let t = depart;
      const issueAt = r() < 0.14 ? 1 + Math.floor(r() * (st.length - 2)) : -1;
      for (let k = 1; k < st.length; k++) {
        const seg = (st[k].plannedHours - st[k - 1].plannedHours - st[k - 1].plannedDwellHours) * H * (0.9 + r() * 0.2);
        const arrived = t + Math.max(H, seg);
        const p = leg.passes[k]; const kind = cp(st[k].checkpointId).kind;
        p.arrivedAt = iso(arrived);
        const sr = r(); p.source = sr < 0.68 ? 'geofence' : sr < 0.9 ? 'driver' : 'sms';
        if (k === st.length - 1) { t = arrived; break; }
        let dwell = st[k].plannedDwellHours * H * (kind === 'border' ? 0.5 + r() * 1.15 : 0.55 + r() * 0.9);
        if (k === issueAt) {
          const extra = (6 + r() * 34) * H;
          nIss++;
          const issue: TruckIssue = { id: `h-iss-${nIss}`, at: iso(arrived + H), checkpointId: st[k].checkpointId, place: cp(st[k].checkpointId).name, reason: ISSUE_REASONS[Math.floor(r() * ISSUE_REASONS.length)], fixedAt: iso(arrived + H + extra), newDueDate: iso(Date.parse(leg.plannedArrival) + extra) };
          leg.issues.push(issue); dwell += extra;
        }
        p.departedAt = iso(arrived + dwell);
        t = arrived + dwell;
      }
      // acknowledgement at the end of the leg
      const ackT = t + (2 + r() * 8) * H;
      const ackWh = endWh;
      const ackLines: AckLine[] = carried.map((c) => {
        const damaged = r() < 0.55 ? Math.round(c.loadedQty * r() * 0.006) : 0;
        const short = r() < 0.15 ? Math.round(r() * 12) : 0;
        const remarks = damaged || short ? [damaged ? `${damaged} cases damaged` : '', short ? `${short} cases short` : ''].filter(Boolean).join(', ') + ' (photo)' : undefined;
        return { productId: c.productId, expected: c.loadedQty, received: c.loadedQty - short, damaged, remarks };
      });
      nAck++;
      const ack: Acknowledgement = { id: `h-ack-${nAck}`, entityId: sh.entityId, legId: leg.id, shipmentId: cur.id, warehouseId: ackWh.id, receiverName: RECEIVER[ackWh.id] ?? 'Receiver', at: iso(ackT), lines: ackLines, signature: 'sig:receiver', photos: [], hasDiscrepancy: ackLines.some((l) => l.received !== l.expected || l.damaged > 0) };
      histAcks.push(ack); leg.ackId = ack.id;
      for (const l of ackLines) {
        d.stockMoves.push({ entityId: sh.entityId, warehouseId: ackWh.id, productId: l.productId, kind: li > 0 ? 'transferIn' : 'received', qty: l.received, at: ack.at, ref: cur.ref });
        if (l.damaged) d.stockMoves.push({ entityId: sh.entityId, warehouseId: ackWh.id, productId: l.productId, kind: 'damaged', qty: l.damaged, at: ack.at, ref: cur.ref });
      }
      cur.legs.push(leg);
      // transport cost per leg + payments
      nCost++;
      const rate = (li === 0 ? ld.agreedTransport : null) ?? TRANSPORT_RATE[routeId] ?? 500;
      const cost: TripCost = { id: `h-cost-${nCost}`, entityId: sh.entityId, shipmentId: cur.id, legId: leg.id, kind: 'Transport', amount: rate, currency: 'USD', docRef: `Agreed at loading ${iso(depart).slice(0, 10)}`, fxRate: 1, amountUsd: rate };
      d.costs.push(cost);
      const age = (now - ackT) / DAY;
      const pay = (amount: number, at: number, ref: string) => { nPay++; d.payments.push({ id: `h-pay-${nPay}`, entityId: sh.entityId, shipmentId: cur.id, costId: cost.id, amount, at: iso(at), reference: ref, status: 'Paid', approvedById: amount > 500 ? 'u-daniel' : undefined, fxRate: 1, amountUsd: amount }); };
      const adv = Math.round(rate * 0.5 / 10) * 10;
      pay(adv, depart + 2 * H, `MPESA ${(nPay * 7919 % 1e6).toString(36).toUpperCase()}`);
      if (age > 35) pay(rate - adv, ackT + (5 + r() * 20) * DAY, `BANK TT-${50000 + nPay}`);
      carried = ackLines.map((l) => ({ productId: l.productId, loadedQty: l.received - l.damaged }));
      depart = ackT + (18 + r() * 12) * H;
    });
    // shipment-level landing costs (§17.6)
    const add = (kind: TripCost['kind'], usd: number, docRef?: string, ccy: TripCost['currency'] = 'USD', on: Shipment = cur) => {
      nCost++;
      const rate = R.fxFor(fx, ccy, loadT, 'avg');
      const amount = ccy === 'USD' ? Math.round(usd) : Math.round(usd * rate);
      d.costs.push({ id: `h-cost-${nCost}`, entityId: sh.entityId, shipmentId: on.id, kind, amount, currency: ccy, docRef, fxRate: rate, amountUsd: Math.round((amount / rate) * 100) / 100 });
    };
    add('Taxes & duties', goods * (0.08 + r() * 0.04), `${wh.id === 'w-juba' ? 'NRA' : wh.id === 'w-goma' ? 'DGDA' : 'RRA'}-${year}-${80000 + nShip}`);
    add('Clearing & forwarding', 300 + r() * 300, `CF-${1000 + nShip}`);
    add('Loading & offloading', 150 + r() * 100, undefined, LOADING_CCY[o.supplierId] ?? 'USD', sh); // paid in local currency at the loading point
    if (r() < 0.3) add('Storage', 60 + r() * 90, undefined, wh.id === 'w-kgl' ? 'RWF' : 'USD');
    histShipments.push(sh);
  }

  // ---- 4. CAPTURE GAPS (deliberate, for the period capture check) ---------------------------------------
  const recent = (days: number) => histShipments.filter((s) => !onward.some((x) => x.originShipmentId === s.id)).filter((s) => { const a = histAcks.find((x) => x.id === s.legs.at(-1)!.ackId)!; return now - Date.parse(a.at) < days * DAY; });
  const rec = recent(80);
  if (rec.length >= 8) {
    // a) a leg with missing check-ins at expected checkpoints
    for (const s of [rec[0], rec[3]]) { const l = s.legs[0]; const mid = Math.floor(l.passes.length / 2); l.passes[mid] = { checkpointId: l.passes[mid].checkpointId, plannedAt: l.passes[mid].plannedAt }; }
    // b) truck arrived but never acknowledged
    { const s = rec[1]; const l = s.legs.at(-1)!; const a = histAcks.findIndex((x) => x.id === l.ackId);
      histAcks.splice(a, 1); l.ackId = undefined; l.status = 'Arrived'; s.status = 'Arrived';
      for (let i = d.stockMoves.length - 1; i >= 0; i--) if (d.stockMoves[i].ref === s.ref) d.stockMoves.splice(i, 1); }
    // c) discrepancies without any explanation
    for (const s of [rec[2], rec[5]]) { const a = histAcks.find((x) => x.id === s.legs.at(-1)!.ackId); if (a) { a.lines[0].received = a.lines[0].expected - 18; a.lines[0].remarks = undefined; a.hasDiscrepancy = true; } }
    // d) loadings without document photos / without agreed transport price
    for (const s of [rec[4], rec[6], rec[7]]) { const ld = histLoadings.find((x) => x.poId === s.poId && x.truckNo === s.truckNo); if (ld) ld.documents = []; }
    { const ld = histLoadings.find((x) => x.poId === rec[6].poId && x.truckNo === rec[6].truckNo); if (ld) ld.agreedTransport = 0; }
    // e) loaded quantity differs from the PO line with no note
    for (const s of [rec[4], rec[7]]) { const ld = histLoadings.find((x) => x.poId === s.poId && x.truckNo === s.truckNo); if (ld) ld.lines[0].loadedQty = Math.round(ld.lines[0].orderedQty * 0.94); }
    // f) a payment with no reference
    { const p = d.payments.find((x) => x.shipmentId === rec[5].id); if (p) p.reference = ''; }
  }
  // g) two POs approved but never sent to the supplier
  const lastPos = histPos.slice(-6);
  for (const po of [lastPos[1], lastPos[3]]) if (po) po.sentAt = undefined;
  // h) sales captured without a customer / with an inconsistent payment status; a ledger row without reference
  const rs = d.sales.filter((s) => now - Date.parse(s.at) < 40 * DAY && now - Date.parse(s.at) > 5 * DAY);
  if (rs.length > 30) { rs[3].customer = ''; rs[17].customer = ''; rs[25].status = 'Paid'; rs[25].paid = Math.round(rs[25].lines[0].qty * rs[25].lines[0].price * 0.3); }
  d.stockMoves.push({ entityId: 'e-nud', warehouseId: 'w-kgl', productId: 'p-c200', kind: 'adjustment', qty: -40, at: iso(now - 22 * DAY), ref: '' });

  // INTERCOMPANY (deliberate example): NUD sells 300 cases of Brand C Lager to its sibling BTW at Asie Gisenyi.
  // NUD books revenue (counterparty BTW); BTW's stock grows by a transfer-in. Group totals eliminate both.
  {
    const at = iso(today - 12 * DAY + 11 * H);
    const ref = 'SAL-IC-0001';
    d.sales.push({ id: 'sale-ic-1', entityId: 'e-nud', ref, at, warehouseId: 'w-kgl', customer: 'BTW Global Distributors Ltd (intercompany)', salespersonId: 'u-asie', kind: 'Credit', lines: [{ productId: 'p-c200', qty: 300, price: 11.2 }], currency: 'USD', paid: 3360, status: 'Paid', counterpartyEntityId: 'e-btw' });
    d.stockMoves.push({ entityId: 'e-btw', warehouseId: 'w-kgl', productId: 'p-c200', kind: 'transferIn', qty: 300, at, ref });
  }

  // Real arrivals run later than the simulation's estimate (border dwell, breakdowns): lift each opening balance just
  // enough that the ledger (receipts − damages − sales) never drops below a 300-case floor.
  {
    const ev = new Map<string, { at: number; q: number }[]>();
    const push = (k: string, at: number, q: number) => { if (!ev.has(k)) ev.set(k, []); ev.get(k)!.push({ at, q }); };
    for (const m of d.stockMoves) push(`${m.entityId}|${m.warehouseId}|${m.productId}`, Date.parse(m.at), (m.kind === 'received' || m.kind === 'adjustment' || m.kind === 'transferIn' ? 1 : -1) * m.qty);
    for (const sl of d.sales) for (const l of sl.lines) push(`${sl.entityId}|${sl.warehouseId}|${l.productId}`, Date.parse(sl.at), -l.qty);
    for (const [k, xs] of ev) {
      xs.sort((a, b) => a.at - b.at);
      let run = 0, min = Infinity; for (const x of xs) { run += x.q; min = Math.min(min, run); }
      if (min < 300) { const o = d.stockMoves.find((m) => m.ref === 'Opening balance' && `${m.entityId}|${m.warehouseId}|${m.productId}` === k); if (o) o.qty += Math.ceil((300 - min) / 10) * 10; }
    }
  }

  // Oldest first, then the live demo (which is already in the arrays)
  d.plans.unshift(...histPlans); d.pos.unshift(...histPos); d.loadings.unshift(...histLoadings);
  d.shipments.unshift(...[...histShipments, ...onward].sort((a, b) => Date.parse(a.legs[0].departedAt!) - Date.parse(b.legs[0].departedAt!))); d.acks.unshift(...histAcks);
  return { orders: orders.length, shipments: histShipments.length + onward.length };
}
