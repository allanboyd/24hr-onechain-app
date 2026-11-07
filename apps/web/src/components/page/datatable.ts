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
