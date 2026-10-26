<script lang="ts">
  import { destinationLabel } from '../../lib/planning';
  // Sales at a glance (reports.sales — every sale, not just the list page's latest 200): trend vs last year,
  // mix by brand / warehouse / type, who owes us, receivables ageing. Period presets scope everything below.
  import { reports, type PeriodPreset, type SalesReport } from '@btw/api';
  import { fmtNum } from '@btw/ui';
  import { BarChart, ChartCard, Donut, LineChart, StatTile, pct, usd } from '../charts';
  import ErrorState from '../ErrorState.svelte';
  import { drill } from '../../lib/tab';
  import { salesTiles } from '../../lib/tiles';
  let { warehouseId }: { warehouseId?: string } = $props();
  const B = '/sales';
  const PERIODS: [PeriodPreset, string][] = [['last-30', 'Last 30 days'], ['last-90', 'Last 90 days'], ['this-quarter', 'This quarter'], ['last-quarter', 'Last quarter'], ['ytd', 'Year to date'], ['last-12m', 'Last 12 months']];
  let period = $state<PeriodPreset>('last-90');
  let rep = $state<SalesReport | null>(null);
  let error = $state<unknown>(null);
  let busy = $state(false);
  $effect(() => {
    const p = reports.resolvePeriod(period, Date.now());
    busy = true;
    reports.sales({ from: p.from, to: p.to, warehouseId }).then((r) => { rep = r; error = null; }).catch((e) => (error = e)).finally(() => (busy = false));
  });
  const change = (a: number, b: number) => (b ? a / b - 1 : null);
  const label = $derived(PERIODS.find(([k]) => k === period)?.[1] ?? '');
  const fig = $derived(rep ? salesTiles(rep) : null);
  const owed = $derived((rep?.topCustomers ?? []).filter((c) => c.outstanding > 0).slice(0, 8));
  import CompanySplit from '../group/CompanySplit.svelte';
  import { salesSplit } from '../../lib/splits';
</script>

<CompanySplit title="Sales by company · last 90 days" metrics={salesSplit()} />

<div class="filters" style="margin-bottom:var(--space-3)">
  <label class="field"><span>Period</span><select class="select" bind:value={period}>{#each PERIODS as [k, l]}<option value={k}>{l}</option>{/each}</select></label>
  {#if busy && rep}<span class="caption">Updating…</span>{/if}
</div>
<ErrorState {error} onretry={() => (period = period)} compact={!!rep} />

{#if !rep}
  <div class="tiles">{#each Array(4) as _}<div class="card"><div class="skeleton" style="height:56px"></div></div>{/each}</div>
{:else}
  <div class="tiles" style:opacity={busy ? 0.6 : 1}>
    <StatTile label="Sales" value={usd(fig!.sales)} delta={change(rep.totals.revenue, rep.prev.revenue)} deltaLabel="vs previous period" trend={rep.series.map((s) => s.revenue)} />
    <StatTile label="Cases sold" value={fmtNum(fig!.cases)} delta={change(rep.totals.cases, rep.prev.cases)} deltaLabel="vs previous period" hint="{fmtNum(Math.round(rep.avgDailyCases))} a day on average" />
    <StatTile label="Versus last year" value={rep.lastYear.revenue ? `${rep.totals.revenue >= rep.lastYear.revenue ? '+' : '−'}${pct(Math.abs(rep.totals.revenue / rep.lastYear.revenue - 1))}` : '—'} hint={rep.lastYear.revenue ? `same period last year ${usd(rep.lastYear.revenue)}` : 'no sales in the same period last year'} />
    <StatTile label="Owed by customers" value={usd(fig!.owed)} hint="unpaid and part-paid" upIsGood={false} onclick={() => drill(B, { status: 'Unpaid' })} />
  </div>

  <div class="charts-grid" style:opacity={busy ? 0.6 : 1}>
    <ChartCard span={2} title="Sales over time" subtitle="USD per {rep.groupBy}, dashed = same period last year" period={label} rows={() => [['Period', 'Sales (USD)', 'Cases', 'Last year (USD)', 'Last year cases'], ...rep!.series.map((s) => [s.label, s.revenue, s.cases, s.lyRevenue ?? '', s.lyCases ?? ''])]}>
      <LineChart label="Sales over time with last year" labels={rep.series.map((s) => s.key)} format={usd}
        series={[{ name: 'Sales', values: rep.series.map((s) => s.revenue), area: true }, ...(rep.series.some((s) => s.lyRevenue != null) ? [{ name: 'Last year', values: rep.series.map((s) => s.lyRevenue), dashed: true, slot: 8 }] : [])]} />
    </ChartCard>
    <ChartCard title="Sales by brand" subtitle="USD" period={label} rows={() => [['Brand', 'Package', 'Sales (USD)', 'Cases', 'Share', 'Change vs previous'], ...rep!.byBrand.map((b) => [b.brand, b.pack, b.revenue, b.cases, Math.round(b.share * 1000) / 10, b.change == null ? '' : Math.round(b.change * 1000) / 10])]}>
      <BarChart label="Sales by brand" horizontal categories={rep.byBrand.map((b) => `${b.brand} · ${b.pack}`)} series={[{ name: 'Sales', values: rep.byBrand.map((b) => b.revenue) }]} format={usd} />
    </ChartCard>
    <ChartCard title="Sales by warehouse" subtitle="USD" period={label} rows={() => [['Warehouse', 'Sales (USD)', 'Cases', 'Share', 'Change vs previous'], ...rep!.byWarehouse.map((w) => [w.name, w.revenue, w.cases, Math.round(w.share * 1000) / 10, w.change == null ? '' : Math.round(w.change * 1000) / 10])]}>
      <BarChart label="Sales by warehouse" categories={rep.byWarehouse.map((w) => destinationLabel(w.warehouseId))} series={[{ name: 'Sales', values: rep.byWarehouse.map((w) => w.revenue) }]} format={usd}
        onselect={(c) => drill(B, { wh: rep!.byWarehouse.find((w) => destinationLabel(w.warehouseId) === c)?.warehouseId })} />
    </ChartCard>
    <ChartCard title="Cash, credit and batch" subtitle="share of sales value" period={label} rows={() => [['Type', 'Sales (USD)', 'Orders'], ...rep!.byKind.map((k) => [k.kind, k.revenue, k.orders])]}>
      <Donut label="Sales by type" data={rep.byKind.map((k) => ({ label: k.kind, value: k.revenue }))} format={usd} center={usd(rep.totals.revenue)} onselect={(k) => drill(B, { kind: k })} />
    </ChartCard>
    <ChartCard title="Who owes us" subtitle="outstanding by customer, USD" rows={() => [['Customer', 'Sales (USD)', 'Outstanding (USD)', 'Orders'], ...rep!.topCustomers.map((c) => [c.customer, c.revenue, c.outstanding, c.orders])]}>
      {#if owed.length}<BarChart label="Outstanding by customer" horizontal categories={owed.map((c) => c.customer)} series={[{ name: 'Owed', values: owed.map((c) => c.outstanding), slot: 1 }]} format={usd} onselect={(c) => drill(B, { cust: c })} />
      {:else}<p class="empty small">Nobody owes anything for this period.</p>{/if}
    </ChartCard>
    <ChartCard span={2} title="Receivables ageing" subtitle="outstanding by age of the sale, USD" rows={() => [['Age', 'Owed (USD)', 'Sales'], ...rep!.receivables.buckets.map((b) => [b.label, b.amount, b.count])]}>
      <BarChart label="Receivables ageing" categories={rep.receivables.buckets.map((b) => b.label)} series={[{ name: 'Owed', values: rep.receivables.buckets.map((b) => b.amount), slot: 1 }]} format={usd} onselect={() => drill(B, { status: 'Unpaid' })} />
    </ChartCard>
  </div>
{/if}
