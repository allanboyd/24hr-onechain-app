// "Create draft plan from this": one draft per supplier, a line per truck, routed on the lane the report used.
import { lookup, plans, ref } from '@btw/api';
import { router } from '@btw/ui';

export interface DraftItem { supplierId: string; productId: string; warehouseId: string; trucks: number; capacity: number; routeIds: string[] }
const ENTITY_FALLBACK: Record<string, string> = { 's-kbl': 'e-btw', 's-ubl': 'e-nud', 's-sbl': 'e-kivu', 's-gbi': 'e-nud' };

/** Creates the draft(s) and opens the first one. Returns the plan refs created. */
export async function createDraftPlans(items: DraftItem[], title: string): Promise<string[]> {
  const bySupplier = new Map<string, DraftItem[]>();
  for (const it of items.filter((x) => x.trucks > 0)) { if (!bySupplier.has(it.supplierId)) bySupplier.set(it.supplierId, []); bySupplier.get(it.supplierId)!.push(it); }
  const all = await plans.list();
  const refs: string[] = []; let firstId = '';
  for (const [supplierId, xs] of bySupplier) {
    const entityId = all.filter((p) => p.supplierId === supplierId).sort((a, b) => b.date.localeCompare(a.date))[0]?.entityId ?? ENTITY_FALLBACK[supplierId] ?? ref().entities[0].id;
    let p = await plans.create(entityId, supplierId);
    let n = 0;
    p.title = title;
    p.lines = xs.flatMap((it) => {
      const deliveredToId = lookup.warehouse(it.warehouseId)?.receivingCompanyId ?? 'rc-asie';
      return Array.from({ length: it.trucks }, () => ({ ...plans.newLine(p, ++n), productId: it.productId, qty: it.capacity, price: lookup.price(it.productId), deliveredToId, routeId: it.routeIds[0] ?? plans.newLine(p, n).routeId }));
    });
    p = await plans.save(p);
    refs.push(p.ref); firstId ||= p.id;
  }
  if (firstId) router.go(`/plans/${firstId}`);
  return refs;
}
