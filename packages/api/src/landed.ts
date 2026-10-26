// Landed cost per case per product (docs/17 F-0b: the one figure behind every "stock value"). Small module so the mock's
// stock list (entry chunk) can use it without the reports bundle.
import type { ID, Plan, PriceListItem, Product, PurchaseOrder, Shipment, TripCost } from './types';

const sum = <T>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0);
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Landing cost per case per SKU from delivered trucks (fallback: list price × 1.21). Doc 08 §2: an onward shipment
 *  carries the per-case cost of the shipments before it (goods + their expenses, pro rata by cases) plus its own. */
export function landedCostMap(dt: { shipments: Shipment[]; costs: TripCost[]; plans: Plan[]; pos: PurchaseOrder[]; priceList: PriceListItem[]; products: Product[] }): Map<ID, number> {
  const planOfPo = new Map(dt.pos.map((p) => [p.id, dt.plans.find((x) => x.id === p.planId)]));
  const acc = new Map<ID, { cost: number; cases: number }>();
  const costBy = new Map<ID, number>();
  for (const c of dt.costs) costBy.set(c.shipmentId, (costBy.get(c.shipmentId) ?? 0) + (c.amountUsd ?? c.amount));
  const byId = new Map(dt.shipments.map((s) => [s.id, s]));
  const unitCost = (sh: typeof dt.shipments[number], productId: ID, depth = 0): number => {
    const cases = sum(sh.legs[0]?.lines ?? [], (l) => l.loadedQty);
    const own = cases ? (costBy.get(sh.id) ?? 0) / cases : 0;
    const parent = sh.parentShipmentId ? byId.get(sh.parentShipmentId) : undefined;
    if (parent && depth < 10) return unitCost(parent, productId, depth + 1) + own;
    const plan = planOfPo.get(sh.poId);
    return (plan?.lines.find((x) => x.productId === productId)?.price ?? dt.priceList.find((x) => x.productId === productId)?.price ?? 0) + own;
  };
  for (const sh of dt.shipments) {
    if (sh.status !== 'Acknowledged' || !sh.legs.length) continue;
    const lines = sh.legs[0].lines; if (!sum(lines, (l) => l.loadedQty)) continue;
    for (const l of lines) {
      const a = acc.get(l.productId) ?? { cost: 0, cases: 0 };
      a.cost += l.loadedQty * unitCost(sh, l.productId); a.cases += l.loadedQty; acc.set(l.productId, a);
    }
  }
  const out = new Map<ID, number>();
  for (const p of dt.products) {
    const a = acc.get(p.id);
    out.set(p.id, a?.cases ? r2(a.cost / a.cases) : r2((dt.priceList.find((x) => x.productId === p.id)?.price ?? 0) * 1.21));
  }
  return out;
}

