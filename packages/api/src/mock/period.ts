// Demo: one 3-month cycle per company (docs/07 §F). An active period plan (a suggestion — plans gate nothing) (monthly split, even) covers the month
// two months back through the current month; the orders already in the demo are linked to it in date order, so the
// marks show what the planner saw at the time: BTW's Order No. 2 went over plan, NUD's GBI malt order was unplanned
// and its October order (awaiting the director) is over plan, each with its reason. Kivu is on plan; its draft
// October order goes over and will need a reason when submitted.
// BTW also has a new order awaiting approval and a draft copy of the plan for the next three months.
import * as seed from './seed';
import * as R from '../rules';
import type { ID, PeriodPlan, PeriodPlanLine, Plan, Route } from '../types';

const DAY = 864e5;
const iso = (t: number) => new Date(t).toISOString();
const ymd = (t: number) => iso(t).slice(0, 10);
const up100 = (x: number) => Math.ceil(x / 100) * 100;
const down100 = (x: number) => Math.floor(x / 100) * 100;

const PLANNER: Record<ID, ID> = { 'e-btw': 'u-kabonge', 'e-nud': 'u-kabonge', 'e-kivu': 'u-kabonge' }; // Kabonge plans all three (docs/12)
/** Planned = ordered × factor (cycled per line): > ~1.3 reads "Behind plan" mid-period, ~1.1 "On track". */
const FACTORS = [1.5, 1.12, 1.65, 1.15, 1.1];
/** The line (supplier|SKU|destination) planned below what was ordered, and by how many cases. */
const OVER: Record<ID, { key: string; by: number }> = {
  'e-btw': { key: 's-kbl|p-a300|w-kgl', by: 1000 },
  'e-nud': { key: 's-ubl|p-c200|w-kgl', by: 800 },
};
/** Suppliers left out of a company's plan (their orders show as Unplanned). */
const UNPLANNED: Record<ID, ID[]> = { 'e-nud': ['s-gbi'] };
const REASONS = {
  over: {
    'e-btw': 'Asie Gisenyi asked for extra cases for a promotion.',
    'e-nud': 'Brand C sold out early in Gisenyi.',
  } as Record<ID, string>,
  unplanned: 'One-truck trial of GBI malt for Juba.',
};

export interface PeriodTarget { plans: Plan[]; routes: Route[]; periodPlans?: PeriodPlan[]; pvThresholds?: { behind: number; over: number } }

/** Warehouse an order line is delivered to: the warehouse at its route's last stop. */
export const destOfLine = (routes: Route[]) => (l: Plan['lines'][number]) => {
  const cp = routes.find((r) => r.id === l.routeId)?.stops.at(-1)?.checkpointId;
  return seed.warehouses.find((w) => w.checkpointId === cp)?.id;
};

export function buildPeriodPlans(d: PeriodTarget, now = Date.now()) {
  const destOf = destOfLine(d.routes);
  const today = ymd(now);
  const m0 = R.shiftMonth(today.slice(0, 7), -2);
  const from = `${m0}-01`;
  const to = R.periodRange('month', today).to;
  const months = R.monthsIn(from, to);
  const price = (pid: ID) => seed.priceList.find((x) => x.productId === pid)?.price ?? 10;
  const label = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' });
  const title = `${label(months[0])}–${label(months.at(-1)!)} ’${to.slice(2, 4)} supply plan`;
  const inPeriod = (p: Plan) => R.ORDER_COUNTS(p) && p.date >= from && p.date <= to;

  // BTW: a new order awaiting director approval, inside the plan.
  const btwRefs = d.plans.filter((p) => p.entityId === 'e-btw').map((p) => p.ref);
  d.plans.push({
    id: 'plan-6', ref: R.nextRef(btwRefs, 'BTW-PO', Number(today.slice(0, 4))), title: `${new Date(now).toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' })} top-up`,
    entityId: 'e-btw', supplierId: 's-kbl', currency: 'USD', date: today, requiredBy: ymd(now + 10 * DAY), status: 'Submitted', version: 1, createdById: 'u-kabonge',
    lines: [{ id: 'pl-61', truckNo: 1, productId: 'p-b500', qty: 1000, price: price('p-b500'), deliveredToId: 'rc-asie', routeId: 'r-nbo-goma' },
      { id: 'pl-62', truckNo: 1, productId: 'p-a300', qty: 1000, price: price('p-a300'), deliveredToId: 'rc-asie', routeId: 'r-nbo-goma' }],
    history: [{ at: iso(now - 3 * 36e5), byUserId: 'u-kabonge', action: 'submitted' }],
  });

  const out: PeriodPlan[] = [];
  for (const entityId of ['e-btw', 'e-nud', 'e-kivu']) {
    const ordered = new Map<string, number>(); const lastQty = new Map<string, number>();
    for (const p of d.plans.filter((x) => x.entityId === entityId && inPeriod(x)).sort((a, b) => a.date.localeCompare(b.date))) {
      if (UNPLANNED[entityId]?.includes(p.supplierId)) continue;
      const mine = new Map<string, number>();
      for (const l of p.lines) { const k = `${p.supplierId}|${l.productId}|${destOf(l)}`; ordered.set(k, (ordered.get(k) ?? 0) + l.qty); mine.set(k, (mine.get(k) ?? 0) + l.qty); }
      for (const [k, q] of mine) lastQty.set(k, q);
    }
    const lines: PeriodPlanLine[] = [...ordered].sort(([a], [b]) => a.localeCompare(b)).map(([k, qty], i) => {
      const [supplierId, productId, destinationId] = k.split('|');
      const over = OVER[entityId]?.key === k;
      const cases = over ? Math.max(100, down100(qty - Math.min(OVER[entityId].by, (lastQty.get(k) ?? 0) - 100))) : up100(qty * FACTORS[i % FACTORS.length]);
      return { id: `ppl-${entityId.slice(2)}-${i + 1}`, supplierId, productId, cases, price: price(productId), destinationId, months: R.evenSplit(cases, months) };
    });
    const prefix = seed.entities.find((e) => e.id === entityId)!.poPrefix.replace(/-PO$/, '-PP');
    const savedAt = Date.parse(`${from}T00:00:00Z`) - 6 * DAY;
    out.push({
      id: `pp-${entityId.slice(2)}-1`, ref: `${prefix}-${from.slice(0, 4)}-0001`, entityId, title, periodKind: 'custom', from, to,
      status: 'Active', version: 1, lines, createdById: PLANNER[entityId],
      history: [{ at: iso(savedAt), byUserId: PLANNER[entityId], action: 'created' }],
    });
  }

  // Stamp the links and marks in date order — as the planner saw them when each order was raised.
  const done: Plan[] = [];
  for (const p of [...d.plans].filter((x) => x.date >= from && x.date <= to).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))) {
    let linked = R.applyPlanLinks(p, out, done, destOf);
    if (R.ORDER_COUNTS(p)) linked = { ...linked, lines: linked.lines.map((l) => l.exception ? { ...l, exceptionReason: l.exception === 'unplanned' ? REASONS.unplanned : REASONS.over[p.entityId] } : l) };
    Object.assign(p, linked);
    if (R.ORDER_COUNTS(p)) done.push(p);
  }

  // BTW: the planner has started next period's plan from this one (PL-11).
  const nextFrom = `${R.shiftMonth(months.at(-1)!, 1)}-01`;
  const nextTo = R.periodRange('month', `${R.shiftMonth(months.at(-1)!, 3)}-01`).to;
  const nm = R.monthsIn(nextFrom, nextTo);
  let k = 0;
  out.push(R.copyPeriodPlan(out[0], { from: nextFrom, to: nextTo, title: `${label(nm[0])}–${label(nm.at(-1)!)} ’${nextTo.slice(2, 4)} supply plan` },
    { id: 'pp-btw-2', ref: `BTW-PP-${nextFrom.slice(0, 4)}-${nextFrom.slice(0, 4) === from.slice(0, 4) ? '0002' : '0001'}`, lineId: () => `ppl-btw-n${++k}` }, 'u-kabonge'));

  d.periodPlans = out;
  d.pvThresholds = { ...R.defaultPvThresholds };
  return out;
}
