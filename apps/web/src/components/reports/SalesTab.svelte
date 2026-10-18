<script lang="ts">
  import { reports, type GroupBy, type ReportFilter, type SalesReport } from '@btw/api';
  import { BarChart, ChartCard, Donut, LineChart, StatTile, compact, usd } from '../charts';
  import { drill } from '../../lib/tab';
  import { watch } from '../../lib/load.svelte';
  import ErrorState from '../ErrorState.svelte';
  import { change, pct } from './fmt';
  let { filter, group, onfilter }: { filter: ReportFilter; group: GroupBy | ''; onfilter: (k: 'wh' | 'prod', v: string) => void } = $props();
  let r = $state<SalesReport | null>(null);
  const w = watch(async () => { r = await reports.sales({ ...filter, groupBy: group || undefined }); }, () => [JSON.stringify(filter), group]);
  const periodText = $derived(r ? `${new Date(r.range.from).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} – ${new Date(Date.parse(r.range.to) - 1).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : '');
  const hasLy = $derived(!!r && r.series.some((s) => s.lyRevenue !== null));
</script>

<ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />
{#if !r}<div class="tiles">{#each Array(4) as _}<div class="card"><div class="skeleton" style="height:56px"></div></div>{/each}</div>
{:else}
  <div class="tiles">
    <StatTile label="Sales revenue" value={usd(r.totals.revenue)} delta={change(r.totals.revenue, r.prev.revenue)} deltaLabel="vs previous period" trend={r.series.map((s) => s.revenue)} hint={r.lastYear.revenue ? `last year ${usd(r.lastYear.revenue)} (${pct(change(r.totals.revenue, r.lastYear.revenue) ?? 0)})` : undefined} />
    <StatTile label="Cases sold" value={compact(r.totals.cases)} delta={change(r.totals.cases, r.prev.cases)} trend={r.series.map((s) => s.cases)} hint="{compact(r.avgDailyCases)} a day on average" />
    <StatTile label="Average price per case" value={usd(r.totals.avgPrice)} delta={change(r.totals.avgPrice, r.prev.revenue && r.prev.cases ? r.prev.revenue / r.prev.cases : null)} />
    <StatTile label="Unpaid from these sales" value={usd(r.totals.outstanding)} upIsGood={false} delta={change(r.totals.outstanding, r.prev.outstanding)} hint="{r.totals.orders.toLocaleString()} sales" onclick={() => drill('/sales', { status: 'Unpaid' })} />
  </div>

  <div class="charts-grid">
    <ChartCard span={2} title="Revenue {hasLy ? 'vs same period last year' : 'trend'}" period={periodText} filename="sales-trend"
      rows={() => [['Period', 'Revenue (USD)', 'Cases', 'Last year revenue (USD)'], ...r!.series.map((s) => [s.label, s.revenue, s.cases, s.lyRevenue ?? ''])]}>
      <LineChart label="Revenue by {r.groupBy}" labels={r.series.map((s) => s.key)} format={usd} filename="sales-trend"
        series={[{ name: 'This period', values: r.series.map((s) => s.revenue), area: true }, ...(hasLy ? [{ name: 'Last year', values: r.series.map((s) => s.lyRevenue), dashed: true, slot: 8 }] : [])]} />
    </ChartCard>
    <ChartCard title="Revenue by brand" subtitle="click a brand to filter the report" filename="sales-by-brand" rows={() => [['Brand', 'Pack', 'Revenue (USD)', 'Cases', 'Share', 'Change vs previous'], ...r!.byBrand.map((b) => [b.brand, b.pack, b.revenue, b.cases, pct(b.share, 1), b.change === null ? '' : pct(b.change, 1)])]}>
      <BarChart label="Revenue by brand" horizontal categories={r.byBrand.map((b) => b.brand)} series={[{ name: 'Revenue', values: r.byBrand.map((b) => b.revenue) }]} format={usd}
        onselect={(c) => { const b = r!.byBrand.find((x) => x.brand === c); if (b) onfilter('prod', b.productId); }} />
    </ChartCard>
    <ChartCard title="Revenue by warehouse" subtitle="click to filter the report" filename="sales-by-warehouse" rows={() => [['Warehouse', 'Revenue (USD)', 'Cases', 'Share', 'Change vs previous'], ...r!.byWarehouse.map((b) => [b.name, b.revenue, b.cases, pct(b.share, 1), b.change === null ? '' : pct(b.change, 1)])]}>
      <BarChart label="Revenue by warehouse" horizontal categories={r.byWarehouse.map((b) => b.name)} series={[{ name: 'Revenue', values: r.byWarehouse.map((b) => b.revenue), slot: 1 }]} format={usd}
        onselect={(c) => { const b = r!.byWarehouse.find((x) => x.name === c); if (b) onfilter('wh', b.warehouseId); }} />
    </ChartCard>
    <ChartCard title="Sales by type" subtitle="click to see those sales" filename="sales-by-kind" rows={() => [['Type', 'Revenue (USD)', 'Sales'], ...r!.byKind.map((k) => [k.kind, k.revenue, k.orders])]}>
      <Donut label="Sales by type" data={r.byKind.map((k) => ({ label: k.kind, value: k.revenue }))} format={usd} center={usd(r.totals.revenue)} onselect={(l) => drill('/sales', { kind: l })} />
    </ChartCard>
    <ChartCard title="Receivables ageing" subtitle="unpaid customer balances at the end of the period" filename="receivables-ageing" rows={() => [['Age', 'Amount (USD)', 'Sales'], ...r!.receivables.buckets.map((b) => [b.label, b.amount, b.count])]}>
      <BarChart label="Receivables by age" categories={r.receivables.buckets.map((b) => b.label)} series={[{ name: 'Unpaid', values: r.receivables.buckets.map((b) => b.amount), slot: 2 }]} format={usd} onselect={() => drill('/sales', { status: 'Unpaid' })} />
    </ChartCard>
    <ChartCard span={2} title="Top customers" subtitle="click a customer to see their sales" filename="top-customers" rows={() => [['Customer', 'Revenue (USD)', 'Cases', 'Sales', 'Outstanding (USD)'], ...r!.topCustomers.map((c) => [c.customer, c.revenue, c.cases, c.orders, c.outstanding])]}>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Customer</th><th class="num">Revenue</th><th class="num">Cases</th><th class="num">Sales</th><th class="num">Outstanding</th></tr></thead>
        <tbody>{#each r.topCustomers as c}<tr class="clickable" onclick={() => drill('/sales', { cust: c.customer })}><td>{c.customer}</td><td class="num">{usd(c.revenue)}</td><td class="num">{compact(c.cases)}</td><td class="num">{c.orders}</td><td class="num">{c.outstanding ? usd(c.outstanding) : '—'}</td></tr>{/each}</tbody>
      </table></div>
    </ChartCard>
  </div>
{/if}
