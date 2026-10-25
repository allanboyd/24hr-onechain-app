// docs/14 (workstream B): three months of warehouse money and data behind the live demo, consistent with the 15-month
// operations history — warehouse expenses (Asie Gisenyi / Goma, Yonas Juba), shortage / damage reasons on every
// acknowledgement with a loss, selling prices set by the directors (with history), stock counts and write-offs by the
// receivers, and re-export orders Asie → Yonas (two delivered, one on the road, one raised and waiting to load).
// Deterministic (seeded PRNG, relative to `now`): the browser mock and the server seed build the same data.
import * as seed from './seed';
import * as R from '../rules';
import { ACK_REASONS, REEXPORT_ROUTE } from '../money';
import type { Acknowledgement, FxRate, Leg, ReexportOrder, Route, Sale, SellingPrice, Shipment, TripCost, TripPayment, WarehouseExpense, WarehouseExpenseCategory } from '../types';

const H = 36e5, DAY = 864e5;
const iso = (t: number) => new Date(t).toISOString();
const ymd = (t: number) => iso(t).slice(0, 10);
const r2 = (x: number) => Math.round(x * 100) / 100;

export interface MoneyTarget {
  routes: Route[]; shipments: Shipment[]; acks: Acknowledgement[]; costs: TripCost[]; payments: TripPayment[]; sales: Sale[]; stockMoves: R.StockMove[];
  trucks: { id: string; providerId: string; reg: string; trailer: string; capacityCases: number; defaultDriverId?: string }[];
  drivers: { id: string; name: string; phone: string; licence: string; providerId: string; hasApp: boolean }[];
  providers: { id: string; name: string; regular: boolean; phone: string; kind?: 'company' | 'sacco' | 'individual' | 'market' }[];
  fxRates?: FxRate[]; expenses?: WarehouseExpense[]; sellingPrices?: SellingPrice[]; reexports?: ReexportOrder[];
}
/** Weighted reasons (most losses are breakage and poor stacking) so a Pareto has a clear head. */
const REASON_WEIGHTS: [typeof ACK_REASONS[number], number][] = [['Breakage in transit', 34], ['Poor stacking', 21], ['Theft/pilferage', 12], ['Short-loaded at supplier', 11], ['Leakage', 10], ['Border inspection', 8], ['Other', 4]];
/** Warehouse running costs per month (USD) and the currency they are paid in. */
const WH: Record<string, { ccy: 'RWF' | 'USD'; rent: number; salary: number; utilities: number; offloadPerCase: number; storage: number; receiver: string; landlord: string }> = {
  'w-kgl': { ccy: 'RWF', rent: 1800, salary: 2600, utilities: 340, offloadPerCase: 0.09, storage: 220, receiver: 'u-asie', landlord: 'Rubavu Properties' },
  'w-goma': { ccy: 'USD', rent: 1400, salary: 1900, utilities: 260, offloadPerCase: 0.11, storage: 160, receiver: 'u-asie', landlord: 'Goma Entrepôts SARL' },
  'w-juba': { ccy: 'USD', rent: 2200, salary: 2400, utilities: 480, offloadPerCase: 0.12, storage: 0, receiver: 'u-yonas', landlord: 'Munuki Stores Ltd' },
};

export function buildMoneyHistory(d: MoneyTarget, now = Date.now()) {
  const r = seed.rng(1410);
  const today = Math.floor(now / DAY) * DAY;
  const fx = d.fxRates ?? seed.seedFxRates(now);
  const pickReason = () => { let x = r() * 100; for (const [k, w] of REASON_WEIGHTS) { if ((x -= w) < 0) return k; } return 'Other'; };

  // ---- B-08: a reason on every acknowledged line with a shortage or damage (two lines stay unexplained: capture gaps) ----
  for (const a of d.acks) for (const l of a.lines) {
    if (l.expected - l.received <= 0 && l.damaged <= 0) continue;
    if (!l.remarks && a.id.startsWith('h-')) continue; // the planted "discrepancy without explanation" gaps stay unexplained
    l.reason = l.expected - l.received > 0 && l.damaged === 0 ? (r() < 0.45 ? 'Short-loaded at supplier' : r() < 0.6 ? 'Theft/pilferage' : pickReason()) : pickReason();
  }

  // ---- B-01: warehouse expenses, last three full months + this month to date --------------------------------------
  const start = Date.UTC(new Date(today).getUTCFullYear(), new Date(today).getUTCMonth() - 3, 1);
  const expenses: WarehouseExpense[] = [];
  let nx = 0;
  const add = (wh: string, t: number, category: WarehouseExpenseCategory, usd: number, reference: string | null, note: string | null, ccy = WH[wh].ccy) => {
    if (t > now) return;
    const rate = R.fxFor(fx, ccy, t);
    const amount = ccy === 'USD' ? Math.round(usd) : Math.round(usd * rate / 100) * 100;
    nx++;
    expenses.push({ id: `wx-${nx}`, warehouseId: wh, receivingCompanyId: seed.warehouses.find((w) => w.id === wh)!.receivingCompanyId, date: ymd(t), category, amount, currency: ccy, fxRate: rate, amountUsd: r2(amount / rate),
      reference, note, receipt: r() < 0.7 ? { id: `doc-wx-${nx}`, kind: 'receipt', name: `receipt-${category.toLowerCase().replace(/\s+/g, '-')}-${ymd(t)}.jpg` } : null, byUserId: WH[wh].receiver, at: iso(t + 15 * H) });
  };
  for (let m = 0; m <= 3; m++) {
    const d0 = new Date(start); const mStart = Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + m, 1);
    const mon = iso(mStart).slice(0, 7);
    for (const [wh, c] of Object.entries(WH)) {
      add(wh, mStart + 2 * DAY + 9 * H, 'Rent', c.rent, `${c.landlord.split(' ')[0].toUpperCase()}-${mon}`, `${c.landlord} — rent ${mon}`);
      add(wh, mStart + 9 * DAY + 11 * H, 'Utilities', c.utilities * (0.85 + r() * 0.3), `UTIL-${mon}-${wh.slice(2).toUpperCase()}`, 'Electricity and water');
      add(wh, mStart + 27 * DAY + 10 * H, 'Salary', c.salary, `PAYROLL-${mon}`, 'Warehouse staff (4 people)');
      if (c.storage && r() < 0.8) add(wh, mStart + 18 * DAY + 10 * H, 'Storage', c.storage * (0.7 + r() * 0.6), null, 'Overflow storage (bonded yard)');
      if (r() < 0.35) add(wh, mStart + 21 * DAY + 14 * H, 'Other', 60 + r() * 140, null, ['Pallets and shrink wrap', 'Security guard overtime', 'Fumigation', 'Forklift repair'][Math.floor(r() * 4)]);
    }
  }
  // offloading per delivery received, and the value of goods written off as damaged
  for (const a of d.acks) {
    const t = Date.parse(a.at); if (t < start || !WH[a.warehouseId]) continue;
    const cases = a.lines.reduce((s, l) => s + l.received, 0);
    const sh = d.shipments.find((s) => s.id === a.shipmentId);
    add(a.warehouseId, t + 2 * H, 'Offloading', cases * WH[a.warehouseId].offloadPerCase * (0.9 + r() * 0.2), sh?.ref ?? null, `Offloading ${cases.toLocaleString('en-US')} cases`);
    const dmg = a.lines.reduce((s, l) => s + l.damaged, 0);
    if (dmg >= 4) add(a.warehouseId, t + 4 * H, 'Damaged goods', dmg * (9 + r() * 6), sh?.ref ?? null, `${dmg} cases damaged on arrival (disposal)`, 'USD');
  }
  d.expenses = expenses.sort((a, b) => a.date.localeCompare(b.date));

  // ---- B-05: selling prices (directors) — company-wide from the price the sales actually used, one Juba price ----------
  const sp: SellingPrice[] = [];
  const traded = Object.keys(seed.salesPattern).flatMap((w) => Object.keys(seed.salesPattern[w]));
  const avgPrice = (pid: string, from: number, to: number) => { const xs = d.sales.filter((s) => s.lines[0]?.productId === pid && Date.parse(s.at) >= from && Date.parse(s.at) < to && !s.counterpartyEntityId); return xs.length ? r2(xs.reduce((a, s) => a + s.lines[0].price, 0) / xs.length) : null; };
  let ns = 0;
  for (const pid of [...new Set(traded)].sort()) {
    const e = seed.entityOfProduct(pid);
    for (const [from, a, b, by] of [[today - 120 * DAY, today - 150 * DAY, today - 120 * DAY, 'u-daniel'], [today - 35 * DAY, today - 35 * DAY, today, 'u-michael']] as const) {
      const p = avgPrice(pid, a, b); if (p === null) continue;
      ns++; sp.push({ id: `sp-${ns}`, entityId: e, productId: pid, warehouseId: null, price: p, currency: 'USD', from: ymd(from), note: ns % 2 ? 'Price list review' : 'Supplier price increase passed on', byUserId: by, at: iso(from - DAY + 10 * H) });
    }
  }
  { const base = sp.filter((x) => x.productId === 'p-a300').at(-1);
    if (base) { ns++; sp.push({ id: `sp-${ns}`, entityId: base.entityId, productId: 'p-a300', warehouseId: 'w-juba', price: r2(base.price * 1.04), currency: 'USD', from: ymd(today - 10 * DAY), note: 'Juba: higher transport cost', byUserId: 'u-daniel', at: iso(today - 11 * DAY + 9 * H) }); } }
  d.sellingPrices = sp;

  // ---- running stock per company × warehouse × product (sales are already in the moves) — keeps every new move inside stock --
  const balanceAfter = (e: string, w: string, p: string, t: number) => {
    let run = 0, min = Infinity;
    const ev: { at: number; q: number }[] = [];
    for (const m of d.stockMoves) if (m.entityId === e && m.warehouseId === w && m.productId === p) ev.push({ at: Date.parse(m.at), q: (m.kind === 'received' || m.kind === 'adjustment' || m.kind === 'transferIn' ? 1 : -1) * m.qty });
    ev.sort((a, b) => a.at - b.at);
    for (const x of ev) { run += x.q; if (x.at >= t) min = Math.min(min, run); }
    return Math.min(min, run);
  };

  // ---- B-02: stock counts, write-offs, moved out, found (receivers) ----------------------------------------------------
  const adj = (e: string, w: string, p: string, t: number, qty: number, reason: string, note: string | null, kind: R.StockMove['kind'] = 'adjustment') => {
    if (kind === 'adjustment' && qty < 0 && balanceAfter(e, w, p, t) + qty < 50) return;
    if (kind === 'damaged' && balanceAfter(e, w, p, t) - qty < 50) return;
    d.stockMoves.push({ entityId: e, warehouseId: w, productId: p, kind, qty, at: iso(t), ref: `ADJ-${ymd(t).replace(/-/g, '')}-${w.slice(2).toUpperCase()}`, reason, note, byUserId: WH[w].receiver });
  };
  for (let m = 0; m < 3; m++) {
    const t0 = Date.UTC(new Date(start).getUTCFullYear(), new Date(start).getUTCMonth() + m + 1, 1) - DAY + 17 * H; // month-end count
    for (const [w, prods] of Object.entries(seed.salesPattern)) {
      for (const p of Object.keys(prods).slice(0, 3)) { const diff = Math.round((r() - 0.65) * 6); adj(seed.entityOfProduct(p), w, p, t0 + Math.floor(r() * 3) * H, diff, 'Count difference', diff ? (diff < 0 ? 'Short on month-end count' : 'Over on month-end count') : 'Count agrees'); }
    }
  }
  adj('e-btw', 'w-goma', 'p-b500', today - 40 * DAY + 11 * H, 6, 'Damaged write-off', 'Water damage after roof leak (photo)', 'damaged');
  adj('e-btw', 'w-kgl', 'p-a300', today - 26 * DAY + 15 * H, -12, 'Moved out', 'Samples to the Kigali trade show (BTW marketing)');
  adj('e-btw', 'w-juba', 'p-a300', today - 18 * DAY + 10 * H, 3, 'Found', 'Found behind the racking during the clean-up');
  adj('e-nud', 'w-kgl', 'p-c200', today - 9 * DAY + 12 * H, 4, 'Damaged write-off', 'Crushed by the forklift', 'damaged');

  // ---- B-03: re-export orders Asie (Gisenyi) → Yonas (Juba) ------------------------------------------------------------
  // Asie's re-exports travel with a Gisenyi transporter of their own (not one of the trucks busy on the supplier lanes)
  if (!d.providers.some((p) => p.id === 'pr-gis')) {
    d.providers.push({ id: 'pr-gis', name: 'Rubavu Haulage', regular: true, phone: '+250788100200', kind: 'company' });
    d.drivers.push({ id: 'd-gis1', name: 'Jean Habimana', phone: '+250788100201', licence: 'DL-RW-55120', providerId: 'pr-gis', hasApp: false });
    d.trucks.push({ id: 't-gis1', providerId: 'pr-gis', reg: 'RAD 812K', trailer: 'RL 0451', capacityCases: 2000, defaultDriverId: 'd-gis1' });
  }
  const RX_TRUCK: [string, string] = ['t-gis1', 'd-gis1'];
  const route = d.routes.find((x) => x.id === REEXPORT_ROUTE)!;
  const stops = route.stops;
  const orders: ReexportOrder[] = [];
  let rx = 0;
  const refOf = (t: number) => `ASIE-RX-${new Date(t).getUTCFullYear()}-${String(++rx).padStart(4, '0')}`;
  const ship = (o: ReexportOrder, departAt: number, truckId: string, driverId: string, state: 'delivered' | 'transit') => {
    const sh: Shipment = { id: `rx-shp-${rx}`, entityId: o.entityId, ref: o.ref, poId: o.id, truckNo: 1, receivingCompanyId: 'rc-yonas', warehouseId: 'w-juba', legs: [], status: 'Loaded', fromWarehouseId: 'w-kgl', parentShipmentId: null, originShipmentId: null };
    const lines = o.lines.map((l) => ({ productId: l.productId, loadedQty: l.loadedQty ?? l.qty }));
    const leg: Leg = { id: `rx-leg-${rx}`, seq: 1, routeId: route.id, fromId: stops[0].checkpointId, toId: stops.at(-1)!.checkpointId, truckId, driverId, status: 'In transit',
      departedAt: iso(departAt), plannedArrival: iso(departAt + stops.at(-1)!.plannedHours * H), passes: R.makePasses(stops, departAt), lines, issues: [] };
    leg.passes[0].arrivedAt = iso(departAt - 4 * H); leg.passes[0].departedAt = iso(departAt); leg.passes[0].source = 'office';
    let t = departAt;
    const upto = state === 'delivered' ? stops.length : Math.max(2, Math.floor(stops.length / 2));
    for (let k = 1; k < upto; k++) {
      const seg = (stops[k].plannedHours - stops[k - 1].plannedHours - stops[k - 1].plannedDwellHours) * H * (0.95 + r() * 0.15);
      t += Math.max(H, seg); leg.passes[k].arrivedAt = iso(t); leg.passes[k].source = r() < 0.7 ? 'geofence' : 'driver';
      if (k < stops.length - 1) { t += stops[k].plannedDwellHours * H * (0.6 + r() * 0.8); leg.passes[k].departedAt = iso(t); }
    }
    for (const l of lines) d.stockMoves.push({ entityId: o.entityId, warehouseId: 'w-kgl', productId: l.productId, kind: 'transferOut', qty: l.loadedQty, at: iso(departAt - 3 * H), ref: o.ref });
    const cost = { id: `rx-cost-${rx}`, entityId: o.entityId, shipmentId: sh.id, legId: leg.id, kind: 'Transport' as const, amount: 1400, currency: 'USD' as const, docRef: `Agreed after loading ${ymd(departAt)}`, fxRate: 1, amountUsd: 1400 };
    d.costs.push(cost, { id: `rx-cost-${rx}b`, entityId: o.entityId, shipmentId: sh.id, legId: leg.id, kind: 'Taxes & duties', amount: Math.round(lines.reduce((a, l) => a + l.loadedQty, 0) * 0.9), currency: 'USD', docRef: `NRA-RX-${rx}`, fxRate: 1, amountUsd: Math.round(lines.reduce((a, l) => a + l.loadedQty, 0) * 0.9) },
      { id: `rx-cost-${rx}c`, entityId: o.entityId, shipmentId: sh.id, legId: leg.id, kind: 'Clearing & forwarding', amount: 380, currency: 'USD', docRef: `CF-RX-${rx}`, fxRate: 1, amountUsd: 380 });
    d.payments.push({ id: `rx-pay-${rx}`, entityId: o.entityId, shipmentId: sh.id, costId: cost.id, amount: 700, at: iso(departAt + 2 * H), reference: `MOMO RX${rx}${(departAt / 1e7).toFixed(0).slice(-4)}`, status: 'Paid', approvedById: 'u-daniel', fxRate: 1, amountUsd: 700 });
    if (state === 'delivered') {
      const ackT = t + (3 + r() * 5) * H;
      leg.passes.at(-1)!.arrivedAt ??= iso(t);
      const ackLines = lines.map((l, i) => { const damaged = i === 0 ? Math.round(l.loadedQty * 0.004) : 0; return { productId: l.productId, expected: l.loadedQty, received: l.loadedQty, damaged, ...(damaged ? { remarks: `${damaged} cases broken (photo)`, reason: 'Poor stacking' } : {}) }; });
      const ack: Acknowledgement = { id: `rx-ack-${rx}`, entityId: o.entityId, legId: leg.id, shipmentId: sh.id, warehouseId: 'w-juba', receiverName: 'Yonas Juba – M. Deng', at: iso(ackT), lines: ackLines, signature: 'sig:receiver', photos: [], hasDiscrepancy: ackLines.some((l) => l.damaged > 0) };
      d.acks.push(ack); leg.ackId = ack.id; leg.status = 'Acknowledged'; sh.status = 'Acknowledged';
      for (const l of ackLines) { d.stockMoves.push({ entityId: o.entityId, warehouseId: 'w-juba', productId: l.productId, kind: 'transferIn', qty: l.received, at: ack.at, ref: o.ref }); if (l.damaged) d.stockMoves.push({ entityId: o.entityId, warehouseId: 'w-juba', productId: l.productId, kind: 'damaged', qty: l.damaged, at: ack.at, ref: o.ref }); }
      d.payments.push({ id: `rx-pay-${rx}b`, entityId: o.entityId, shipmentId: sh.id, costId: cost.id, amount: 700, at: iso(ackT + 6 * DAY), reference: `BANK TT-RX${rx}`, status: 'Paid', approvedById: 'u-michael', fxRate: 1, amountUsd: 700 });
      o.status = 'Delivered'; o.deliveredAt = ack.at;
    } else { leg.lastPing = { lat: 0.33, lng: 32.58, at: iso(now - H) }; o.status = 'In transit'; sh.status = 'In transit'; }
    sh.legs.push(leg);
    o.shipmentId = sh.id;
    d.shipments.push(sh);
  };
  const plan = (t: number, entityId: string, lines: [string, number][], note: string, truck: [string, string], state: 'delivered' | 'transit' | 'open') => {
    // never below a 250-case floor at Gisenyi (an open order only reserves what is there now)
    const ok = lines.map(([p, q]) => [p, Math.min(q, Math.floor((balanceAfter(entityId, 'w-kgl', p, t) - 250) / 10) * 10)] as [string, number]).filter(([, q]) => q >= 100);
    if (!ok.length) return;
    const o: ReexportOrder = { id: `rx-${rx + 1}`, ref: refOf(t), entityId, fromWarehouseId: 'w-kgl', toWarehouseId: 'w-juba', routeId: route.id, status: 'Open',
      lines: ok.map(([productId, qty]) => ({ productId, qty, ...(state !== 'open' ? { loadedQty: qty } : {}) })), note, createdById: 'u-asie', createdAt: iso(t), followUpById: 'u-testfie',
      ...(state !== 'open' ? { truckId: truck[0], driverId: truck[1], loadedById: 'u-asie', loadedAt: iso(t + DAY) } : {}) };
    orders.push(o);
    if (state !== 'open') ship(o, t + DAY + 3 * H, truck[0], truck[1], state);
  };
  plan(today - 62 * DAY + 9 * H, 'e-btw', [['p-a300', 600], ['p-b500', 300]], 'Juba short of Tusker cans — top-up from Gisenyi', RX_TRUCK, 'delivered');
  plan(today - 27 * DAY + 9 * H, 'e-btw', [['p-a300', 800]], 'Re-export before the Juba price change', RX_TRUCK, 'delivered');
  plan(today - 3 * DAY + 8 * H, 'e-nud', [['p-c200', 400]], 'Juba trial order — Nihna Brand C (Konyo Konyo Traders)', RX_TRUCK, 'transit');
  plan(today - 0.3 * DAY, 'e-kivu', [['p-e330', 350]], 'Juba trial order — Kivu lager; load when a truck is free', ['', ''], 'open');
  d.reexports = orders;
  return { expenses: expenses.length, sellingPrices: sp.length, reexports: orders.length };
}
