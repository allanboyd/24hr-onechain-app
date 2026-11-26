// V3-8 DataTable engine (components/page/datatable.ts processRows, on TanStack Table): sorting keeps the old rules,
// search and filters narrow rows, pick-lists count values with the other filters applied. Run: npx tsx apps/web/test/datatable.test.ts
import { processRows, sortRows, isActive, type Column } from '../src/components/page/datatable';
import { tableQuery } from '../src/components/page/tablequery';

let fails = 0; const ok = (c: unknown, m: string, x?: unknown) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}${!c && x !== undefined ? ' ' + JSON.stringify(x) : ''}`); if (!c) fails++; };
type R = { id: string; ref: string; sup: string; amt: number | null; title: string };
const rows: R[] = [
  { id: '1', ref: 'PO-10', sup: 's-kbl', amt: 500, title: 'October order' },
  { id: '2', ref: 'PO-9', sup: 's-ubl', amt: null, title: 'Top-up' },
  { id: '3', ref: 'PO-2', sup: 's-kbl', amt: 2000, title: 'September order' },
  { id: '4', ref: 'PO-11', sup: 's-sbl', amt: 1200, title: '' },
  { id: '5', ref: 'PO-1', sup: 's-ubl', amt: 500, title: 'Order No. 1' },
];
const NAMES: Record<string, string> = { 's-kbl': 'KBL Nairobi', 's-ubl': 'UBL Kampala', 's-sbl': 'SBL Mwanza' };
const columns: Column<R>[] = [
  { key: 'ref', label: 'Reference', value: (r) => r.ref },
  { key: 'title', label: 'Title', value: (r) => r.title },
  { key: 'sup', label: 'Supplier', value: (r) => NAMES[r.sup], filter: 'select', filterValue: (r) => r.sup, filterLabel: (v) => NAMES[v] },
  { key: 'amt', label: 'Amount', align: 'right', sortValue: (r) => r.amt, filter: 'range' },
  { key: 'actions', label: '', csv: false },
];
const ids = (xs: R[]) => xs.map((r) => r.id).join(',');
const run = (o: Partial<Parameters<typeof processRows<R>>[0]> = {}) => processRows<R>({ rows, columns, rowKey: (r) => r.id, sort: null, ...o });

// sorting: same order as the old sortRows (natural text, numbers as numbers, empty last, stable)
for (const [key, dir] of [['ref', 'asc'], ['ref', 'desc'], ['amt', 'asc'], ['amt', 'desc'], ['title', 'asc'], ['title', 'desc']] as const) {
  const want = ids(sortRows(rows, columns.find((c) => c.key === key), dir));
  ok(ids(run({ sort: { key, dir } }).rows) === want, `sort ${key} ${dir} = the old order (${want})`, ids(run({ sort: { key, dir } }).rows));
}
ok(ids(run({ sort: { key: 'ref', dir: 'asc' } }).rows) === '5,3,2,1,4', 'natural sort: PO-1, PO-2, PO-9, PO-10, PO-11');
ok(run({ sort: { key: 'amt', dir: 'desc' } }).rows.at(-1)!.id === '2' && run({ sort: { key: 'amt', dir: 'asc' } }).rows.at(-1)!.id === '2', 'empty amount last in both directions');
ok(ids(run().rows) === '1,2,3,4,5', 'no sort keeps the given order');

// search: any searchable column, by what people read (supplier name, not its id); not the actions column
ok(ids(run({ search: 'order' }).rows) === '1,3,5', 'search "order" matches titles');
ok(ids(run({ search: 'kampala' }).rows) === '2,5', 'search matches the supplier name shown');
ok(ids(run({ search: 's-kbl' }).rows) === '', 'search does not match hidden ids');
ok(ids(run({ search: '  po-1  ' }).rows) === '1,4,5', 'search trims spaces and ignores case (PO-10, PO-11, PO-1)');

// filters
ok(ids(run({ filters: { sup: ['s-kbl'] } }).rows) === '1,3', 'select filter by id');
ok(ids(run({ filters: { sup: ['s-kbl', 's-sbl'] } }).rows) === '1,3,4', 'select filter, two values');
ok(ids(run({ filters: { amt: [600, null] } }).rows) === '3,4', 'range from 600');
ok(ids(run({ filters: { amt: [null, 500] } }).rows) === '1,5', 'range up to 500 (empty amount left out)');
ok(ids(run({ filters: { sup: ['s-kbl'], amt: [1000, 3000] }, search: 'sept' }).rows) === '3', 'filters + search together');
ok(ids(run({ filters: { sup: [], amt: [null, null] } }).rows) === '1,2,3,4,5', 'empty filters filter nothing');
ok(ids(run({ filters: { nope: ['x'] } }).rows) === '1,2,3,4,5', 'a filter on an unknown column is ignored');

// pick-list counts and range bounds
const f = run({ filters: { amt: [500, 500] } });
ok(JSON.stringify(f.facets('sup')) === JSON.stringify([{ value: 's-kbl', count: 1 }, { value: 's-ubl', count: 1 }]), 'supplier counts with the amount filter applied', f.facets('sup'));
const g = run({ filters: { sup: ['s-kbl'] } });
ok(g.facets('sup').length === 3, "a column's own filter doesn't hide its other choices", g.facets('sup'));
ok(JSON.stringify(run().range('amt')) === '[500,2000]', 'amount range 500 to 2000', run().range('amt'));

ok(isActive(['a']) && !isActive([]) && isActive([1, null]) && !isActive([null, null]) && isActive('x') && !isActive('  ') && !isActive(undefined), 'isActive');

// searchExtra: text that is not a column (e.g. a truck plate)
const plates: Record<string, string> = { '1': 'KBX 123A', '3': 'UAB 999Z' };
ok(ids(run({ search: 'uab', searchExtra: (r) => plates[r.id] ?? '' }).rows) === '3', 'searchExtra: search also matches text outside the columns');
ok(ids(run({ search: 'uab' }).rows) === '', 'without searchExtra that text is not searched');

// tableQuery: filters <-> address values (same names as before; ids by commas; ranges "from,to")
const values: Record<string, string> = { q: 'oct', entity: 'e-btw', supplier: '', amount: '100,' };
const fq = { values, set: (k: string, v: string) => { values[k] = v; } };
const t = tableQuery(fq, { search: 'q', filters: { company: 'entity', supplier: 'supplier', amount: ['amount', 'range'] } });
ok(t.search.get() === 'oct' && JSON.stringify(t.filters.get()) === JSON.stringify({ company: ['e-btw'], supplier: [], amount: [100, null] }), 'tableQuery reads the address');
t.filters.set({ company: ['e-btw', 'e-nud'], supplier: undefined, amount: [null, 5000] }); t.search.set('');
ok(values.entity === 'e-btw,e-nud' && values.supplier === '' && values.amount === ',5000' && values.q === '', 'tableQuery writes ids by commas, ranges "from,to", clears');
t.filters.set({ company: [], amount: [null, null] });
ok(values.entity === '' && values.amount === '', 'tableQuery: empty filters clear the address');

// size: 2,000 rows search + filter + sort stays quick
const many = Array.from({ length: 2000 }, (_, i) => ({ ...rows[i % 5], id: String(i), ref: `PO-${i}` }));
const t0 = performance.now(); processRows<R>({ rows: many, columns, rowKey: (r) => r.id, sort: { key: 'amt', dir: 'desc' }, search: 'order', filters: { sup: ['s-kbl', 's-ubl'] } });
const ms = performance.now() - t0; ok(ms < 250, `2,000 rows in ${ms.toFixed(0)} ms`);

console.log(fails ? `${fails} datatable check(s) failed` : 'all datatable checks passed');
process.exit(fails ? 1 : 0);
