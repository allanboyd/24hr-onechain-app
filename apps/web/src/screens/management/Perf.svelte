<script lang="ts">
  // Management · Warehouse performance on live data (V3-10 step 3b): the performance report by warehouse (mgmt-perf),
  // plans vs POs, margin and profit per case, and the price floor (the Selling prices helper), in the report's look.
  import { dashboards, type DashResult } from '@btw/api';
  import type { MgmtPerf } from '@btw/api/dashboards';
  import { DataTable, type Column } from '../../components/page';
  import Waterfall from '../../components/charts/Waterfall.svelte';
  import GroupedBars from '../../components/charts/GroupedBars.svelte';
  import ColumnsLine from '../../components/charts/ColumnsLine.svelte';
  import { compact } from '../../components/charts/scale';
  import ErrorState from '../../components/ErrorState.svelte';
  import { watch } from '../../lib/load.svelte';
  import { destinationLabel } from '../../lib/planning';
  import ReportFilters, { reportFilters, apiFilter } from './ReportFilters.svelte';

  const f = reportFilters();
  let res = $state<DashResult | null>(null);
  const w = watch(async () => { res = (await dashboards.get(['mgmt-perf'], apiFilter(f))).results['mgmt-perf'] ?? null; }, () => [f.values.wh, f.values.p]);
  const d = $derived(res?.data as MgmtPerf | undefined);
  const usd = (n: number | null | undefined, dp = 0) => (n == null ? '-' : `$${n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`);
  const pct = (n: number | null | undefined) => (n == null ? '-' : `${(n * 100).toFixed(1)}%`);
  const num = (n: number | null | undefined) => (n == null ? '-' : Math.round(n).toLocaleString('en-US'));
  const whName = $derived(f.values.wh ? destinationLabel(f.values.wh) : 'All warehouses (combined)');
  type P = MgmtPerf['floor'][number];
  const columns: Column<P>[] = [
    { key: 'brand', label: 'Brand', sticky: true, value: (x) => x.label },
    { key: 'landed', label: 'Landed cost / case', align: 'right', sortValue: (x) => x.landedPerCase, value: (x) => usd(x.landedPerCase, 2) },
    { key: 'floor', label: 'Price floor / case', align: 'right', sortValue: (x) => x.floor, value: (x) => usd(x.floor, 2), title: 'Lowest price that keeps the target margin' },
    { key: 'avg', label: 'Average sale price', align: 'right', sortValue: (x) => x.avgPrice, value: (x) => usd(x.avgPrice, 2) },
    { key: 'price', label: 'Selling price set', align: 'right', sortValue: (x) => x.sellingPrice, value: (x) => usd(x.sellingPrice, 2), hideBelow: 900 },
    { key: 'status', label: 'Status', value: (x) => (x.below ? 'Below the floor' : 'OK'), cell: statusCell, filter: 'select' },
  ];
  let search = $state(''), filters = $state({});
</script>

<section class="mrep" aria-labelledby="pf-h">
  <ReportFilters {f} />
  <header><h1 id="pf-h">Warehouse performance</h1><p class="muted">{whName} · {res?.period?.label ?? ''}</p></header>
  <ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />
  {#if d}
    {@const h = d.headline}
    <div class="kpis">
      <div class="card kpi"><span class="lbl">Revenue</span><b class="val">{usd(h.revenue)}</b></div>
      <div class="card kpi"><span class="lbl">Profit</span><b class="val">{usd(h.profit)}</b></div>
      <div class="card kpi"><span class="lbl">Profit margin</span><b class="val">{pct(h.margin)}</b><span class="sub">target {pct(d.targetMargin)}</span></div>
      <div class="card kpi"><span class="lbl">Cases sold</span><b class="val">{num(h.cases)}</b></div>
      <div class="card kpi"><span class="lbl">Profit per case</span><b class="val">{usd(h.profitPerCase, 2)}</b></div>
      <div class="card kpi"><span class="lbl">Landed cost per case</span><b class="val">{usd(h.landedPerCase, 2)}</b></div>
    </div>

    <div class="card">
      <h3 class="ct">All warehouses side by side (most profitable first)</h3>
      <div class="whs">
        {#each d.warehouses as x (x.warehouseId)}
          <div class="wh">
            <b>{x.label}</b>
            <div class="row2"><span>Revenue</span><span>{usd(x.revenue)}</span></div>
            <div class="row2"><span>Profit</span><span>{usd(x.profit)}</span></div>
            <div class="row2"><span>Margin</span><span class="chip {x.margin !== null && x.margin < d.targetMargin ? 'bad' : 'good'}">{pct(x.margin)}</span></div>
            <div class="row2"><span>Cases sold</span><span>{num(x.cases)}</span></div>
            <div class="row2"><span>Profit per case</span><span>{usd(x.profitPerCase, 2)}</span></div>
          </div>
        {:else}<p class="muted">No sales in this period.</p>{/each}
      </div>
    </div>

    <div class="card">
      <h3 class="ct">How the company makes profit{#if h.margin !== null}<span class="chip good">{pct(h.margin)} of sales kept as profit</span>{/if}</h3>
      {#if d.waterfall.length}<Waterfall label="How the company makes profit, from sales to profit" steps={d.waterfall.map((s) => ({ label: s.label === 'Revenue' ? 'Sales' : s.label === 'Truck' ? 'Transport' : s.label, value: s.value, kind: s.kind }))} format={(n) => `$${compact(n)}`} />
      {:else}<p class="muted">No sales in this period.</p>{/if}
    </div>

    <div class="g2">
      <div class="card">
        <h3 class="ct">Plan vs actual: purchase orders issued<span class="chip">Planned {num(d.plan.planned)} · PO issued {num(d.plan.ordered)}</span></h3>
        {#if d.plan.months.length}<GroupedBars label="Planned and PO issued by month, cases" categories={d.plan.months.map((x) => x.month)} series={[{ name: 'Planned', values: d.plan.months.map((x) => x.planned) }, { name: 'PO issued', values: d.plan.months.map((x) => x.ordered) }]} unit="cases" height={260} />
        {:else}<p class="muted">No plans in this period.</p>{/if}
      </div>
      <div class="card">
        <h3 class="ct">Profit margin and profit by month</h3>
        <ColumnsLine label="Profit by month with the profit margin" categories={d.months.map((x) => x.month)} parts={[{ name: 'Profit', values: d.months.map((x) => x.profit) }]} line={{ name: 'Profit margin', values: d.months.map((x) => x.margin) }} format={(n) => `$${compact(n)}`} height={260} />
      </div>
    </div>

    <div class="card">
      <h3 class="ct">Profit per case (USD, all brands) by month</h3>
      <GroupedBars label="Profit per case by month" categories={d.months.map((x) => x.month)} series={[{ name: 'Profit per case', values: d.months.map((x) => x.profitPerCase) }]} format={(n) => `$${n.toFixed(2)}`} gaps={false} height={220} />
    </div>

    <div class="card">
      <h3 class="ct">Price floor: the lowest safe selling price<span class="chip {d.floor.some((x) => x.below) ? 'bad' : 'good'}">{d.floor.filter((x) => x.below).length} below the floor</span></h3>
      <DataTable id="mgmt-price-floor" label="Price floor per brand" noun="brands" rows={d.floor} {columns} rowKey={(x) => x.productId} filename="price-floor" searchable searchPlaceholder="Brand" bind:search bind:filters maxHeight="420px" />
    </div>
    <p class="caption">{res?.definition}</p>
  {:else}
    <div class="kpis">{#each Array(6) as _}<div class="card kpi"><div class="skeleton" style="height:56px"></div></div>{/each}</div>
  {/if}
</section>

{#snippet statusCell(x: P)}<span class="chip {x.below ? 'bad' : 'good'}">{x.below ? 'Below the floor' : 'OK'}</span>{/snippet}

<style>
  .mrep { display: flex; flex-direction: column; gap: 14px; }
  header h1 { font-size: 24px; line-height: 30px; } header p { margin: 2px 0 0; }
  .kpis { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); }
  .kpi { display: flex; flex-direction: column; gap: 2px; padding: 16px; }
  .kpi .lbl { font-size: 13px; color: var(--text-muted); }
  .kpi .val { font: 800 24px/1.25 var(--ff-display); font-variant-numeric: tabular-nums; margin: 2px 0 3px; }
  .kpi .sub { font-size: 12.5px; color: var(--text-muted); }
  .g2 { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); }
  .ct { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 15px; margin-bottom: 10px; }
  .chip { display: inline-flex; padding: 2px 9px; border-radius: 99px; font-size: 12px; font-weight: 600; white-space: nowrap; background: var(--surface-sunken); color: var(--text-muted); }
  .chip.good { background: var(--success-subtle); color: var(--success); }
  .chip.bad { background: var(--danger-subtle); color: var(--danger); }
  .whs { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
  .wh { display: flex; flex-direction: column; gap: 6px; padding: 14px; border-radius: 14px; background: var(--surface-sunken); }
  .wh b { font-size: 15px; margin-bottom: 4px; }
  .row2 { display: flex; justify-content: space-between; gap: 8px; font-size: 14px; }
  .row2 span:first-child { color: var(--text-muted); }
  .row2 span:last-child { font-variant-numeric: tabular-nums; font-weight: 600; }
</style>
