import type { ReportFilter } from '@btw/api';
/** UI filter values → API filter (dates are inclusive days in the UI, [from, to) in the API). */
export function toFilter(v: { from?: string; to?: string; wh?: string; prod?: string }): ReportFilter {
  const f: ReportFilter = {};
  if (v.from) f.from = new Date(v.from + 'T00:00:00Z').toISOString();
  if (v.to) f.to = new Date(Date.parse(v.to + 'T00:00:00Z') + 864e5).toISOString();
  if (v.wh) f.warehouseId = v.wh;
  if (v.prod) f.productId = v.prod;
  return f;
}
