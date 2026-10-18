// Product helpers for the client's catalogue (131 SKUs from Source.xlsx: KBL, GBI, SBL, UBL).
// The API may supply `category`, `packToConfirm` and `priceToConfirm`; until then they are derived here.
import { lookup, type Product } from '@btw/api';

export type Category = 'Spirits' | 'Beer' | 'Wine' | 'RTD & other';
export const CATEGORIES: Category[] = ['Spirits', 'Beer', 'Wine', 'RTD & other'];

const BEER = /tusker|guinness|white ?cap|barozi|balozi|heineken|serengeti|bell lager|lager|pilsner/i;
const WINE = /claret|cellar cask|chamdor|overmeer|four cousins|4th street|nederburg|wine/i;
const RTD = /guarana|savanna|smirnoff ice|cider/i;

type Extra = Product & { category?: string; packConfirmed?: boolean; packToConfirm?: boolean; priceToConfirm?: boolean };

export function categoryOf(p: Product): Category {
  const c = (p as Extra).category;
  if (c) {
    const k = c.toLowerCase();
    if (k.startsWith('spirit')) return 'Spirits';
    if (k.startsWith('beer')) return 'Beer';
    if (k.startsWith('wine')) return 'Wine';
    return 'RTD & other';
  }
  const name = `${p.brand} ${p.pack}`;
  if (RTD.test(name)) return 'RTD & other';
  if (WINE.test(name)) return 'Wine';
  if (BEER.test(name)) return 'Beer';
  return 'Spirits';
}

export const packToConfirm = (p: Product) => (p as Extra).packConfirmed === false || (p as Extra).packToConfirm === true || !p.pack || /confirm/i.test(p.pack);
export const priceToConfirm = (p: Product) => (p as Extra).priceToConfirm !== false; // the sheet has no prices yet
export const sourceCode = (p: Product) => lookup.supplier(p.supplierId)?.code ?? '—';
export const productLabel = (p: Product) => (packToConfirm(p) ? `${p.brand} · pack to confirm` : `${p.brand} · ${p.pack}`);

/** Group products as Source → Category → products (sorted by brand), for pickers and master data. */
export function groupProducts(list: Product[]) {
  const bySource = new Map<string, Map<Category, Product[]>>();
  for (const p of [...list].sort((a, b) => a.brand.localeCompare(b.brand) || a.pack.localeCompare(b.pack))) {
    const s = sourceCode(p);
    if (!bySource.has(s)) bySource.set(s, new Map());
    const cats = bySource.get(s)!;
    const c = categoryOf(p);
    if (!cats.has(c)) cats.set(c, []);
    cats.get(c)!.push(p);
  }
  return [...bySource.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([source, cats]) => ({
    source, categories: CATEGORIES.filter((c) => cats.has(c)).map((c) => ({ category: c, products: cats.get(c)! })),
  }));
}

export const matches = (p: Product, q: string) => {
  if (!q.trim()) return true;
  const hay = `${p.brand} ${p.pack} ${p.sku} ${sourceCode(p)} ${categoryOf(p)}`.toLowerCase();
  return q.toLowerCase().split(/\s+/).every((t) => hay.includes(t));
};
