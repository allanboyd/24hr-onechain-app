// V3-8: keep a DataTable's search + filters in the page address with the screen's existing names, so links and old
// bookmarks keep working. Pick-list values are stored as ids separated by commas; ranges as "from,to".
//   const t = tableQuery(f, { search: 'q', filters: { company: 'entity', amount: ['amount', 'range'] } });
//   <DataTable searchable bind:search={t.search.get, t.search.set} bind:filters={t.filters.get, t.filters.set} … />
import type { Filters, FilterValue, RangeValue } from './datatable';

type Q = { values: Record<string, string>; set: (k: any, v: string) => void };
type Spec = { search?: string; filters?: Record<string, string | [string, 'range' | 'select' | 'text']> };

const list = (v: string) => (v ? v.split(',') : []);
const range = (v: string): RangeValue => { const [a = '', b = ''] = v.split(','); return [a === '' ? null : Number(a), b === '' ? null : Number(b)]; };
function write(kind: 'select' | 'range' | 'text', v: FilterValue | undefined): string {
  if (v === undefined) return '';
  if (kind === 'range') { const r = v as RangeValue; return Array.isArray(r) && (r[0] !== null || r[1] !== null) ? `${r[0] ?? ''},${r[1] ?? ''}` : ''; }
  if (kind === 'text') return typeof v === 'string' ? v : '';
  return Array.isArray(v) ? (v as string[]).join(',') : '';
}

export function tableQuery(f: Q, spec: Spec) {
  const entries = Object.entries(spec.filters ?? {}).map(([col, p]) => (Array.isArray(p) ? { col, param: p[0], kind: p[1] } : { col, param: p, kind: 'select' as const }));
  return {
    search: {
      get: () => (spec.search ? f.values[spec.search] ?? '' : ''),
      set: (v: string) => { if (spec.search && v !== f.values[spec.search]) f.set(spec.search, v); },
    },
    filters: {
      get: (): Filters => Object.fromEntries(entries.map((e) => {
        const raw = f.values[e.param] ?? '';
        return [e.col, e.kind === 'range' ? range(raw) : e.kind === 'text' ? raw : list(raw)];
      })),
      set: (v: Filters) => { for (const e of entries) { const next = write(e.kind, v[e.col]); if (next !== (f.values[e.param] ?? '')) f.set(e.param, next); } },
    },
  };
}
