// DataTable column model (docs/13-dashboard-kit.md "DataTable"). Kept in a .ts file so screens can type their columns.
import type { Snippet } from 'svelte';

export type Cell = string | number | null | undefined;

export interface Column<T> {
  /** unique per table; also the CSV / column-menu id */
  key: string;
  /** header text (also the label on phone cards and in the CSV) */
  label: string;
  align?: 'left' | 'right' | 'center';
  /** CSS width, e.g. '120px' or '12ch' */
  width?: string;
  /** default: true when the column has `sortValue` or `value` */
  sortable?: boolean;
  /** what the column sorts by — numbers / ISO dates / timestamps sort as values, not as the text shown */
  sortValue?: (row: T) => Cell;
  /** plain text / number of the cell: shown when there is no `cell` snippet, used for CSV and as the sort fallback */
  value?: (row: T) => Cell;
  /** CSV value (default `value`, else `sortValue`); `false` leaves the column out of the CSV (actions) */
  csv?: ((row: T) => Cell) | false;
  /** rich cell content (links, chips, captions); receives the row */
  cell?: Snippet<[T]>;
  /** stick to the left edge while the table scrolls sideways (first column) */
  sticky?: boolean;
  /** hide the column when the table is narrower than this many px (the column menu can still show it) */
  hideBelow?: number;
  /** header tooltip (what the figure means) */
  title?: string;
  /** starts hidden (the column menu can show it) */
  hidden?: boolean;
  /** default true; false keeps it out of the column menu (always shown) */
  hideable?: boolean;
  /** phone card role: 'title' (top left, bold), 'aside' (top right — a status chip), 'actions' (buttons under the card),
   *  false (left out); default: a "label: value" line */
  mobile?: 'title' | 'aside' | 'actions' | false;
  /** totals row value over all filtered rows (shown when any column has one) */
  total?: (rows: T[]) => Cell;
  /** extra class on the cells (e.g. 'small', 'nowrap') */
  class?: string;
  /** V3-8: offer this column in the Filters panel */
  filter?: FilterKind;
  /** V3-8: what filters / search / pick-lists use (default `value`, else `sortValue`), e.g. an id for a 'select' */
  filterValue?: (row: T) => Cell;
  /** V3-8: label of a filter value (pick-list and chips), e.g. id → "KBL Nairobi" */
  filterLabel?: (value: string) => string;
  /** V3-8: false leaves the column out of the search box */
  searchable?: boolean;
}

export type SortDir = 'asc' | 'desc';
export interface SortState { key: string; dir: SortDir }

/** Compare two sort values: numbers as numbers, text naturally ("PO-9" < "PO-10"), empty always last. */
export function compareCells(a: Cell, b: Cell, dir: SortDir): number {
  const ea = a === null || a === undefined || a === '' || (typeof a === 'number' && Number.isNaN(a));
  const eb = b === null || b === undefined || b === '' || (typeof b === 'number' && Number.isNaN(b));
  if (ea || eb) return ea === eb ? 0 : ea ? 1 : -1;
  const r = typeof a === 'number' && typeof b === 'number' ? a - b : collator.compare(String(a), String(b));
  return dir === 'asc' ? r : -r;
}
const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/** Stable sort of rows by one column. */
export function sortRows<T>(rows: T[], col: Column<T> | undefined, dir: SortDir): T[] {
  const get = col?.sortValue ?? col?.value;
  if (!get) return rows;
  return rows.map((r, i) => ({ r, i, v: get(r) })).sort((x, y) => compareCells(x.v, y.v, dir) || x.i - y.i).map((x) => x.r);
}

/** Date helper for sortValue: ISO string → epoch ms (empty stays empty). */
export const ts = (iso?: string | null) => (iso ? Date.parse(iso) : null);

// ---- V3-8: search, filters and sorting on TanStack Table (table-core, framework-free so it is unit-tested) ----------------
import {
  constructTable, tableFeatures, rowSortingFeature, createSortedRowModel, columnFilteringFeature, globalFilteringFeature,
  createFilteredRowModel, columnFacetingFeature, createFacetedRowModel, createFacetedUniqueValues, createFacetedMinMaxValues,
} from '@tanstack/table-core';
import { storeReactivityBindings } from '@tanstack/table-core/store-reactivity-bindings';

/** A column filter: 'select' = pick one or more values (with counts), 'text' = contains, 'range' = from / to number. */
export type FilterKind = 'select' | 'text' | 'range';
export type RangeValue = [number | null, number | null];
export type FilterValue = string[] | string | RangeValue;
/** Active filters by column key (empty / missing = not filtered). */
export type Filters = Record<string, FilterValue | undefined>;

const features = tableFeatures({
  coreReactivityFeature: storeReactivityBindings(),
  rowSortingFeature, sortedRowModel: createSortedRowModel(),
  columnFilteringFeature, globalFilteringFeature, filteredRowModel: createFilteredRowModel(),
  columnFacetingFeature, facetedRowModel: createFacetedRowModel(), facetedUniqueValues: createFacetedUniqueValues(), facetedMinMaxValues: createFacetedMinMaxValues(),
});
const isEmpty = (v: Cell) => v === null || v === undefined || v === '' || (typeof v === 'number' && Number.isNaN(v));
const F = '__f'; // the filter twin of each column (ids for pick-lists, numbers for ranges)
const S = '__s'; // the search twin: the text people read (value, else sortValue)
/** What a column shows / filters / searches by (filterValue, else value, else sortValue). */
export const filterText = <T>(c: Column<T>, r: T): Cell => (c.filterValue ?? c.value ?? c.sortValue)?.(r);
export const isRange = (v: FilterValue | undefined): v is RangeValue => Array.isArray(v) && v.length === 2 && v.every((x) => x === null || typeof x === 'number');
export const isActive = (v: FilterValue | undefined) =>
  v === undefined ? false : isRange(v) ? v[0] !== null || v[1] !== null : Array.isArray(v) ? v.length > 0 : v.trim() !== '';

export interface Processed<T> {
  /** rows after search + filters, sorted (empty values last in both directions) */
  rows: T[];
  /** pick-list values with counts for a 'select' column (the other filters applied, not its own) */
  facets: (key: string) => { value: string; count: number }[];
  /** smallest / largest number of a 'range' column (the other filters applied) */
  range: (key: string) => [number, number] | undefined;
}

/** Search, filter and sort rows with TanStack Table. Each column becomes three TanStack columns: `key` sorts by
 *  sortValue / value; `key__f` is what filters and pick-lists use (filterValue / value / sortValue); `key__s` is the text
 *  the search box matches (value / sortValue), so a search never matches a hidden id. */
export function processRows<T>(o: { rows: T[]; columns: Column<T>[]; rowKey: (r: T) => string; sort: SortState | null; search?: string; filters?: Filters }): Processed<T> {
  const cols = o.columns.flatMap((c) => {
    const sortGet = c.sortValue ?? c.value;
    const kind = c.filter;
    return [
      { id: c.key, accessorFn: (r: T) => { const v = sortGet?.(r); return isEmpty(v) ? undefined : v; }, sortUndefined: 'last' as const,
        sortFn: (a: any, b: any, id: string) => compareCells(a.getValue(id), b.getValue(id), 'asc') },
      { id: c.key + F, accessorFn: (r: T) => { const v = kind === 'range' ? (c.sortValue ?? c.value)?.(r) : filterText(c, r); return isEmpty(v) ? undefined : kind === 'range' ? Number(v) : String(v); },
        filterFn: (row: any, id: string, fv: FilterValue) => {
          const v = row.getValue(id) as string | number | undefined;
          if (kind === 'range') { const [lo, hi] = fv as RangeValue; return v !== undefined && (lo === null || (v as number) >= lo) && (hi === null || (v as number) <= hi); }
          if (Array.isArray(fv)) return v !== undefined && (fv as string[]).includes(String(v));
          return v !== undefined && String(v).toLowerCase().includes(String(fv).toLowerCase());
        } },
      { id: c.key + S, accessorFn: (r: T) => { const v = (c.value ?? c.sortValue)?.(r); return isEmpty(v) ? undefined : String(v); } },
    ];
  });
  const searchable = new Set(o.columns.filter((c) => c.searchable !== false && (c.value ?? c.sortValue) && c.csv !== false).map((c) => c.key + S));
  const columnFilters = Object.entries(o.filters ?? {}).filter(([k, v]) => isActive(v) && o.columns.some((c) => c.key === k)).map(([k, v]) => ({ id: k + F, value: v }));
  const table = constructTable({
    features, columns: cols as any, data: o.rows, getRowId: (r: T) => o.rowKey(r),
    state: { sorting: o.sort ? [{ id: o.sort.key, desc: o.sort.dir === 'desc' }] : [], columnFilters, globalFilter: (o.search ?? '').trim() },
    globalFilterFn: (row: any, id: string, q: string) => String(row.getValue(id) ?? '').toLowerCase().includes(q.toLowerCase()),
    getColumnCanGlobalFilter: (col: any) => searchable.has(col.id),
  } as any) as any;
  return {
    rows: table.getRowModel().rows.map((r: any) => r.original as T),
    facets: (key) => [...((table.getColumn(key + F)?.getFacetedUniqueValues() ?? new Map()) as Map<unknown, number>).entries()]
      .filter(([v]) => v !== undefined).map(([v, count]) => ({ value: String(v), count }))
      .sort((a, b) => collator.compare(a.value, b.value)),
    range: (key) => { const mm = table.getColumn(key + F)?.getFacetedMinMaxValues(); return mm && Number.isFinite(mm[0]) ? [mm[0], mm[1]] : undefined; },
  };
}
