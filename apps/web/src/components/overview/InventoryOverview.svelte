<script lang="ts">
  import { destinationLabel } from '../../lib/planning';
  // Where stock stands: value, on hand vs in transit, cover risk, ageing, top value SKUs. Click → filtered List tab.
  import { lookup, type StockRow, type VelocityRow } from '@btw/api';
  import { fmtNum } from '@btw/ui';
  import { BarChart, ChartCard, Donut, Heatmap, StatTile, usd } from '../charts';
  import { drill } from '../../lib/tab';
  import { inventoryTiles } from '../../lib/tiles';
  let { rows, vel, levelOf, cover, thresholds, money = true }: {
    rows: StockRow[]; vel: VelocityRow[]; levelOf: (x: StockRow) => string; cover: (x: StockRow) => number;
    thresholds: { stockOutDays: number; overstockDays: number }; /** false = no values (receivers, docs/12 A-04) */ money?: boolean;
  } = $props();
  const B = '/inventory';
  const wname = (id: string) => destinationLabel(id) ?? id;
  const pname = (id: string) => { const p = lookup.product(id); return p ? `${p.brand} · ${p.pack}` : id; };
  const value = (x: StockRow) => x.closing * x.landedCostPerCase;
  const whs = $derived([...new Set(rows.map((x) => x.warehouseId))].sort());
  const prods = $derived([...new Set(rows.map((x) => x.productId))].sort());
  // docs/18: the tiles use the shared definitions (metrics registry)
  const total = $derived(inventoryTiles(rows, vel, money));
  const LEVELS = ['Out of stock', 'Low', 'OK', 'Overstock'] as const;
  const counts = $derived(LEVELS.map((l) => ({ label: l, value: rows.filter((x) => levelOf(x) === l).length })));
  const attention = $derived(total.attention);
  const sinceSale = (x: StockRow) => vel.find((v) => v.warehouseId === x.warehouseId && v.productId === x.productId)?.daysSinceSale ?? 99;
  const AGE = [['0–7 days', 0, 7], ['8–14 days', 8, 14], ['15–30 days', 15, 30], ['Over 30 days', 31, 1e9]] as const;
  const ageing = $derived(AGE.map(([l, a, b]) => rows.filter((x) => x.closing > 0 && sinceSale(x) >= a && sinceSale(x) <= b).reduce((s, x) => s + x.closing, 0)));
  const top = $derived([...rows].filter((x) => value(x) > 0).sort((a, b) => value(b) - value(a)).slice(0, 8));
  const byWh = $derived(whs.map((w) => rows.filter((x) => x.warehouseId === w)));
  const cell = (p: string, w: string) => rows.find((x) => x.productId === p && x.warehouseId === w);
  const classIdx: Record<string, number> = { 'Out of stock': 0, Low: 1, OK: 2, Overstock: 3 };
  import CompanySplit from '../group/CompanySplit.svelte';
  import { inventorySplit } from '../../lib/splits';
</script>

<CompanySplit title="Stock by company" metrics={inventorySplit()} />

<div class="tiles">
  {#if money}<StatTile label="Stock value" value={usd(total.value ?? 0)} hint="at landed cost per case" />{/if}
  <StatTile label="Cases on hand" value={fmtNum(total.cases)} hint="{whs.length} warehouses · {prods.length} SKUs" />
  <StatTile label="In transit" value={fmtNum(total.transit)} hint="loaded, not yet acknowledged" onclick={() => drill(B, {})} />
  <StatTile label="Needs attention" value={String(attention)} hint="out of stock, low cover, overstock or no recent sale" onclick={() => drill(B, { level: 'Low' })} />
</div>

<div class="charts-grid">
{#if money}
  <ChartCard title="Stock value by warehouse" subtitle="USD at landed cost" rows={() => [['Warehouse', 'Value (USD)', 'Cases'], ...whs.map((w, i) => [wname(w), Math.round(byWh[i].reduce((a, x) => a + value(x), 0)), byWh[i].reduce((a, x) => a + x.closing, 0)])]}>
    <BarChart label="Stock value by warehouse" horizontal categories={whs.map(wname)} series={[{ name: 'Value', values: byWh.map((r) => Math.round(r.reduce((a, x) => a + value(x), 0))) }]} format={usd} onselect={(c) => drill(B, { wh: whs.find((w) => wname(w) === c) })} />
  </ChartCard>
  {/if}
  <ChartCard title="On hand vs in transit" subtitle="cases by warehouse" rows={() => [['Warehouse', 'On hand', 'In transit'], ...whs.map((w, i) => [wname(w), byWh[i].reduce((a, x) => a + x.closing, 0), byWh[i].reduce((a, x) => a + x.inTransit, 0)])]}>
    <BarChart label="Cases on hand and in transit by warehouse" stacked categories={whs.map(wname)} series={[{ name: 'On hand', values: byWh.map((r) => r.reduce((a, x) => a + x.closing, 0)) }, { name: 'In transit', values: byWh.map((r) => r.reduce((a, x) => a + x.inTransit, 0)), slot: 1 }]} onselect={(c) => drill(B, { wh: whs.find((w) => wname(w) === c) })} />
  </ChartCard>
  <ChartCard span={2} title="Days of cover by SKU and warehouse" subtitle="closing stock ÷ average daily sales · low < {thresholds.stockOutDays} d · overstock > {thresholds.overstockDays} d" rows={() => [['SKU', ...whs.map(wname)], ...prods.map((p) => [pname(p), ...whs.map((w) => { const c = cell(p, w); return c ? (cover(c) >= 999 ? 'no sales' : cover(c)) : ''; })])]}>
    <Heatmap label="Days of cover heatmap" rows={prods.map(pname)} cols={whs.map(wname)}
      classes={[{ label: 'Out', tone: 'danger' }, { label: 'Low', tone: 'warning' }, { label: 'OK', tone: 'success' }, { label: 'Over', tone: 'info' }]}
      values={prods.map((p) => whs.map((w) => { const c = cell(p, w); return c ? classIdx[levelOf(c)] : null; }))}
      text={prods.map((p) => whs.map((w) => { const c = cell(p, w); if (!c) return ''; const d = cover(c); return c.closing <= 0 ? 'Out' : d >= 999 ? 'no sales' : `${Math.max(0, d)} d`; }))}
      onselect={(r, c) => drill(B, { wh: whs.find((w) => wname(w) === c), q: lookup.product(prods.find((p) => pname(p) === r) ?? '')?.sku })} />
  </ChartCard>
  <ChartCard title="Stock level" subtitle="SKU × warehouse positions" rows={() => [['Level', 'Positions'], ...counts.map((c) => [c.label, c.value])]}>
    <Donut label="Stock level mix" data={counts} center={String(rows.length)} onselect={(l) => drill(B, { level: l })} />
  </ChartCard>
  <ChartCard title="Stock ageing" subtitle="cases on hand by days since the last sale" rows={() => [['Days since last sale', 'Cases on hand'], ...AGE.map(([l], i) => [l, ageing[i]])]}>
    <BarChart label="Stock ageing" categories={AGE.map(([l]) => l)} series={[{ name: 'Cases', values: ageing }]} />
  </ChartCard>
{#if money}
  <ChartCard span={2} title="Top value SKUs" subtitle="where the money sits" rows={() => [['SKU', 'Warehouse', 'Cases', 'Value (USD)'], ...top.map((x) => [pname(x.productId), wname(x.warehouseId), x.closing, Math.round(value(x))])]}>
    <BarChart label="Top value SKUs" horizontal categories={top.map((x) => `${pname(x.productId)} — ${wname(x.warehouseId)}`)} series={[{ name: 'Value', values: top.map((x) => Math.round(value(x))) }]} format={usd} onselect={(c) => { const x = top.find((t) => `${pname(t.productId)} — ${wname(t.warehouseId)}` === c); if (x) drill(B, { wh: x.warehouseId, q: lookup.product(x.productId)?.sku }); }} />
  </ChartCard>
  {/if}
</div>
