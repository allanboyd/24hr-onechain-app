// "Order this" from a report: opens the Create purchase order form prefilled — one PO per supplier, a line per truck, routed on
// the lane the report used. POs are never drafted (docs/09 §4): nothing is created until the planner checks the lines and saves.
import { plans } from '@btw/api';
import { router } from '@btw/ui';
import { setPrefill, type Prefill, type PrefillItem } from '../../lib/orders';

export type DraftItem = PrefillItem;
const ENTITY_FALLBACK: Record<string, string> = { 's-kbl': 'e-btw', 's-ubl': 'e-nud', 's-sbl': 'e-kivu', 's-gbi': 'e-nud' };

/** Queues one prefilled order per supplier and opens the form. Returns the number of orders to review. */
export async function openPrefilledPos(items: PrefillItem[], title: string): Promise<number> {
  const bySupplier = new Map<string, PrefillItem[]>();
  for (const it of items.filter((x) => x.trucks > 0)) bySupplier.set(it.supplierId, [...(bySupplier.get(it.supplierId) ?? []), it]);
  const all = await plans.list().catch(() => []);
  const queue: Prefill[] = [...bySupplier].map(([supplierId, xs]) => ({ supplierId, title, items: xs,
    entityId: all.filter((p) => p.supplierId === supplierId).sort((a, b) => b.date.localeCompare(a.date))[0]?.entityId ?? ENTITY_FALLBACK[supplierId] }));
  if (!queue.length) return 0;
  setPrefill(queue);
  router.go('/pos/new?prefill=1');
  return queue.length;
}
