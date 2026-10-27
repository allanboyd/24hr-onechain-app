<script lang="ts">
  import { destinationLabel } from '../../lib/planning';
  import { lookup, reports, type InventoryReport, type ReportFilter } from '@btw/api';
  import { Badge } from '@btw/ui';
  import { BarChart, ChartCard, Donut, StatTile, compact, usd } from '../charts';
  import { drill } from '../../lib/tab';
  import { watch } from '../../lib/load.svelte';
  import ErrorState from '../ErrorState.svelte';
  let { filter }: { filter: ReportFilter } = $props();
  let r = $state<InventoryReport | null>(null);
  const w = watch(async () => { r = await reports.inventory({ warehouseId: filter.warehouseId, productId: filter.productId }); }, () => [filter.warehouseId, filter.productId]);
  const RISK: Record<string, { label: string; tone: 'danger' | 'warning' | 'info' | 'success' | 'neutral'; level: string }> = {
    out: { label: 'Out of stock', tone: 'danger', level: 'Out of stock' }, 'stock-out risk': { label: 'Stock-out risk', tone: 'danger', level: 'Low' }, low: { label: 'Low', tone: 'warning', level: 'Low' },
    ok: { label: 'OK', tone: 'success', level: '' }, overstock: { label: 'Overstock', tone: 'info', level: 'Overstock' }, dead: { label: 'Not selling', tone: 'neutral', level: '' },
  };
  const wname = (id: string) => destinationLabel(id) ?? id;
</script>

<ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />
{#if !r}<div class="tiles">{#each Array(4) as _}<div class="card"><div class="skeleton" style="height:56px"></div></div>{/each}</div>
{:else}
  <div class="tiles">
    <StatTile label="Stock value" value={usd(r.totalValue)} hint="{compact(r.totalCases)} cases at landing cost" onclick={() => drill('/stock', {})} />
    <StatTile label="In transit" value={usd(r.inTransitValue)} hint="{compact(r.inTransitCases)} cases on the road" onclick={() => drill('/shipments', { show: 'road' })} />
    <StatTile label="Stock-out risk" value={String(r.riskCounts['stock-out risk'] + r.riskCounts.out + r.riskCounts.low)} upIsGood={false} hint="under 14 days of cover" onclick={() => drill('/stock', { level: 'Low' })} />
    <StatTile label="Overstock or not selling" value={String(r.riskCounts.overstock + r.riskCounts.dead)} upIsGood={false} hint="over 60 days of cover, or no sale in 30 days" onclick={() => drill('/stock', { level: 'Overstock' })} />
  </div>
  <div class="charts-grid">
    <ChartCard title="Stock value by warehouse" subtitle="click to open the stock list" filename="stock-by-warehouse" rows={() => [['Warehouse', 'Cases', 'Value (USD)', 'Days of cover', 'Items needing attention'], ...r!.byWarehouse.map((x) => [x.name, x.cases, x.value, x.coverDays ?? '', x.risks])]}>
      <BarChart label="Stock value by warehouse" horizontal categories={r.byWarehouse.map((x) => x.name)} series={[{ name: 'Value', values: r.byWarehouse.map((x) => x.value) }]} format={usd} onselect={(c) => drill('/stock', { wh: r!.byWarehouse.find((x) => x.name === c)?.warehouseId })} />
    </ChartCard>
    <ChartCard title="Stock age" subtitle="how long the cases on hand have been in the warehouse (first in, first out)" filename="stock-ageing" rows={() => [['Age', 'Cases', 'Value (USD)'], ...r!.ageing.map((a) => [a.label, a.cases, a.value])]}>
      <BarChart label="Stock by age" categories={r.ageing.map((a) => a.label)} series={[{ name: 'Value', values: r.ageing.map((a) => a.value), slot: 3 }]} format={usd} />
    </ChartCard>
    <ChartCard title="Where stock stands" subtitle="count of brand × warehouse lines" filename="stock-risk" rows={() => [['Status', 'Lines'], ...Object.entries(r!.riskCounts).map(([k, v]) => [RISK[k].label, v])]}>
      <Donut label="Stock lines by status" data={Object.entries(r.riskCounts).map(([k, v]) => ({ label: RISK[k].label, value: v }))} center="{r.rows.length} lines"
        onselect={(l) => { const k = Object.keys(RISK).find((x) => RISK[x].label === l); drill('/stock', { level: k ? RISK[k].level : '' }); }} />
    </ChartCard>
    <ChartCard title="Days of cover" subtitle="cases on hand ÷ average daily sales (last 30 days)" filename="days-of-cover" rows={() => [['Brand', 'Warehouse', 'Cases', 'Per day', 'Days of cover'], ...r!.rows.map((x) => [`${x.brand} ${x.pack}`, wname(x.warehouseId), x.closing, x.perDay, x.coverDays ?? ''])]}>
      <BarChart label="Days of cover by brand and warehouse" horizontal categories={r.rows.filter((x) => x.coverDays !== null).sort((a, b) => (a.coverDays ?? 0) - (b.coverDays ?? 0)).map((x) => `${x.brand} · ${wname(x.warehouseId)}`)}
        series={[{ name: 'Days of cover', values: r.rows.filter((x) => x.coverDays !== null).sort((a, b) => (a.coverDays ?? 0) - (b.coverDays ?? 0)).map((x) => Math.min(x.coverDays ?? 0, 400)) }]} format={(n) => `${Math.round(n)} d`} />
    </ChartCard>
    <ChartCard span={2} title="Stock by brand and warehouse" filename="stock-lines" rows={() => [['Brand', 'Pack', 'Warehouse', 'Cases', 'In transit', 'Value (USD)', 'Per day', 'Days of cover', 'Oldest (days)', 'Status'], ...r!.rows.map((x) => [x.brand, x.pack, wname(x.warehouseId), x.closing, x.inTransit, x.value, x.perDay, x.coverDays ?? '', x.ageDays, RISK[x.risk].label])]}>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Brand</th><th>Warehouse</th><th class="num">Cases</th><th class="num">In transit</th><th class="num">Value</th><th class="num">Per day</th><th class="num">Cover</th><th class="num">Oldest</th><th>Status</th></tr></thead>
        <tbody>{#each r.rows as x}<tr class="clickable" onclick={() => drill('/stock', { wh: x.warehouseId, q: lookup.product(x.productId)?.sku })}>
          <td>{x.brand} <span class="caption">{x.pack}</span></td><td>{wname(x.warehouseId)}</td><td class="num">{compact(x.closing)}</td><td class="num">{x.inTransit ? compact(x.inTransit) : '—'}</td><td class="num">{usd(x.value)}</td><td class="num">{x.perDay}</td><td class="num">{x.coverDays === null ? '—' : `${x.coverDays} d`}</td><td class="num">{x.ageDays} d</td><td><Badge tone={RISK[x.risk].tone}>{RISK[x.risk].label}</Badge></td></tr>{/each}</tbody>
      </table></div>
    </ChartCard>
  </div>
{/if}
