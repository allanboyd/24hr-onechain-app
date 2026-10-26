// Orders against plans: totals of an order, and what has been ordered against each period-plan line
// (same rule as the reports: submitted/approved orders of the company dated inside the plan's period).
import { lookup, type PeriodPlan, type Plan, type PoStage, type PurchaseOrder } from '@btw/api';
import { ORDER_COUNTS } from '@btw/api/rules';

export const orderCases = (p: Plan) => p.lines.reduce((a, l) => a + l.qty, 0);
export const orderValue = (p: Plan) => p.lines.reduce((a, l) => a + l.qty * l.price, 0);
export const trucksOf = (p: Plan) => new Set(p.lines.map((l) => l.truckNo)).size;
export const supplierName = (id: string) => lookup.supplier(id)?.name ?? '—';

export function orderedByLine(pp: PeriodPlan, orders: Plan[]): Map<string, number> {
  const out = new Map<string, number>(pp.lines.map((l) => [l.id, 0]));
  for (const o of orders) {
    if (!ORDER_COUNTS(o.status) || o.entityId !== pp.entityId) continue;
    const day = o.date.slice(0, 10);
    for (const l of o.lines) {
      const hit = l.periodLineId && out.has(l.periodLineId) ? l.periodLineId
        : !l.periodLineId && day >= pp.from && day <= pp.to ? pp.lines.find((x) => x.supplierId === o.supplierId && x.productId === l.productId)?.id : undefined;
      if (hit) out.set(hit, (out.get(hit) ?? 0) + l.qty);
    }
  }
  return out;
}
export const plannedCases = (pp: PeriodPlan) => pp.lines.reduce((a, l) => a + l.cases, 0);
export const sumMap = (m: Map<string, number>) => [...m.values()].reduce((a, v) => a + v, 0);

// ---- Purchase orders: stage chip and revision badge -------------------------------------------------------------
type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
export const STAGE_TONE: Record<PoStage, Tone> = { 'Awaiting approval': 'warning', Created: 'warning', Sent: 'info', Loading: 'info', 'On the road': 'info', Delivered: 'success', Deleted: 'danger' };
/** Stage of a PO from the list/detail (older servers without `stage`: from status / sentAt). */
export const stageOf = (p: Pick<PurchaseOrder, 'stage' | 'status' | 'sentAt'>): PoStage =>
  p.stage ?? (p.status === 'Deleted' ? 'Deleted' : p.status === 'Awaiting approval' ? 'Awaiting approval' : p.sentAt ? 'Sent' : 'Created');
/** "rev002" for revision 2; '' for the original. */
export const revLabel = (n?: number) => (n ? `rev${String(n).padStart(3, '0')}` : '');
