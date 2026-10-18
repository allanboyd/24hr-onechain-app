<script lang="ts">
  import { reports, type QuarterlyReport, type ReportFilter } from '@btw/api';
  import { BarChart, ChartCard, StatTile, downloadCsv, usd } from '../charts';
  import { drill } from '../../lib/tab';
  import { watch } from '../../lib/load.svelte';
  import ErrorState from '../ErrorState.svelte';
  import { deltaText, kpiDelta, kpiValue, pct } from './fmt';
  import Printer from '@lucide/svelte/icons/printer';
  import Download from '@lucide/svelte/icons/download';
  let { filter, quarter = $bindable('') }: { filter: ReportFilter; quarter?: string } = $props();
  let r = $state<QuarterlyReport | null>(null);
  const w = watch(async () => { r = await reports.quarterly(quarter || undefined, { warehouseId: filter.warehouseId, productId: filter.productId }); if (!quarter) quarter = r.quarter; }, () => [quarter, filter.warehouseId, filter.productId]);
  const kpiRows = () => [['Measure', r!.label, 'Previous quarter', 'Change', 'Same quarter last year', 'Change'], ...r!.kpis.map((k) => [k.label, kpiValue(k, k.value), kpiValue(k, k.prev), deltaText(k, k.prev), kpiValue(k, k.ly), deltaText(k, k.ly)])];
  const tone = (good: boolean | null) => (good === null ? '' : good ? 'up' : 'down');
</script>

<ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />
<div class="row between noprint" style="margin-bottom:var(--space-3)">
  <label class="field" style="min-width:180px"><span>Quarter</span>
    <select class="select" bind:value={quarter}>{#each r?.quarters ?? [] as q}<option value={q}>{q.replace(/(\d{4})-Q(\d)/, 'Q$2 $1')}</option>{/each}</select></label>
  <div class="row">
    <button class="btn btn-secondary" disabled={!r} onclick={() => downloadCsv(`quarterly-review-${r!.quarter}`, kpiRows())}><Download size={16} />CSV</button>
    <button class="btn btn-primary" disabled={!r} onclick={() => window.print()}><Printer size={16} />Print / save as PDF</button>
  </div>
</div>

{#if !r}<div class="card"><div class="skeleton" style="height:120px"></div></div>
{:else}
  <section class="qr">
    <header class="qr-head">
      <div class="overline">Quarterly review</div>
      <h2>{r.label}{#if !r.complete} · in progress ({Math.round(r.elapsedPct * 100)}% of the quarter){/if}</h2>
      <p class="caption">{new Date(r.range.from).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} – {new Date(Date.parse(r.range.to) - 1).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}{#if !r.complete} · compared with the same number of days in earlier quarters{/if}</p>
    </header>

    <div class="tiles">
      {#each r.kpis.slice(0, 4) as k}<StatTile label={k.label} value={kpiValue(k, k.value)} delta={kpiDelta(k, k.prev)} deltaLabel={k.unit === 'pct' ? 'points vs previous quarter' : 'vs previous quarter'} upIsGood={k.upIsGood} hint={k.ly !== null ? `last year ${kpiValue(k, k.ly)}` : undefined} />{/each}
    </div>

    <div class="charts-grid">
      <section class="card">
        <h3>Highlights</h3>
        <ul class="hl">{#each r.highlights as h}<li>{h}</li>{/each}</ul>
      </section>
      <ChartCard title="Revenue by month" subtitle="this year vs last year" filename="quarter-months" rows={() => [['Month', 'Revenue (USD)', 'Last year (USD)', 'Gross margin (USD)'], ...r!.months.map((m) => [m.label, m.revenue, m.lyRevenue, m.margin])]}>
        <BarChart label="Revenue by month this year and last year" categories={r.months.map((m) => m.label)} series={[{ name: 'This year', values: r.months.map((m) => m.revenue) }, { name: 'Last year', values: r.months.map((m) => m.lyRevenue), slot: 8 }]} format={usd} />
      </ChartCard>
      <section class="card wide2">
        <header class="row between"><h3>Scorecard</h3><span class="caption">rates show the change in percentage points</span></header>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Measure</th><th class="num">{r.label}</th><th class="num">Previous quarter</th><th class="num">Change</th><th class="num">Last year</th><th class="num">Change</th></tr></thead>
          <tbody>
            {#each r.kpis as k}
              {@const d1 = kpiDelta(k, k.prev)}{@const d2 = kpiDelta(k, k.ly)}
              <tr><td>{k.label}</td><td class="num"><b>{kpiValue(k, k.value)}</b></td><td class="num">{kpiValue(k, k.prev)}</td>
                <td class="num {tone(d1 === null || d1 === 0 ? null : (d1 > 0) === k.upIsGood)}">{deltaText(k, k.prev)}</td>
                <td class="num">{kpiValue(k, k.ly)}</td><td class="num {tone(d2 === null || d2 === 0 ? null : (d2 > 0) === k.upIsGood)}">{deltaText(k, k.ly)}</td></tr>
            {/each}
          </tbody>
        </table></div>
      </section>
      <ChartCard title="Warehouses" subtitle="revenue this quarter · click to open its sales" filename="quarter-warehouses" rows={() => [['Warehouse', 'Revenue (USD)', 'Change', 'Gross margin %', 'On time', 'Deliveries'], ...r!.warehouses.map((x) => [x.name, x.revenue, x.change === null ? '' : pct(x.change, 1), pct(x.marginPct, 1), x.onTimePct === null ? '' : pct(x.onTimePct), x.deliveries])]}>
        <BarChart label="Revenue by warehouse this quarter" horizontal categories={r.warehouses.map((x) => x.name)} series={[{ name: 'Revenue', values: r.warehouses.map((x) => x.revenue), slot: 1 }]} format={usd} onselect={(c) => drill('/sales', { wh: r!.warehouses.find((x) => x.name === c)?.warehouseId })} />
      </ChartCard>
      <section class="card">
        <h3>Brands</h3>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Top by revenue</th><th class="num">Revenue</th><th class="num">vs prev.</th><th class="num">Margin</th></tr></thead>
          <tbody>{#each r.topBrands as b}<tr class="clickable" onclick={() => drill('/analytics', { brand: b.productId })}><td>{b.brand} <span class="caption">{b.pack}</span></td><td class="num">{usd(b.revenue)}</td><td class="num {tone(b.change === null ? null : b.change > 0)}">{b.change === null ? '—' : pct(b.change, 1)}</td><td class="num">{pct(b.marginPct, 1)}</td></tr>{/each}</tbody>
          <thead><tr><th>Weakest change</th><th class="num">Revenue</th><th class="num">vs prev.</th><th class="num">Margin</th></tr></thead>
          <tbody>{#each r.bottomBrands as b}<tr class="clickable" onclick={() => drill('/analytics', { brand: b.productId })}><td>{b.brand} <span class="caption">{b.pack}</span></td><td class="num">{usd(b.revenue)}</td><td class="num {tone(b.change === null ? null : b.change > 0)}">{b.change === null ? '—' : pct(b.change, 1)}</td><td class="num">{pct(b.marginPct, 1)}</td></tr>{/each}</tbody>
        </table></div>
      </section>
    </div>
  </section>
{/if}

<style>
  .qr-head { margin-bottom: var(--space-4); }
  .qr-head h2 { margin: 2px 0; }
  .hl { margin: var(--space-2) 0 0; padding-left: 1.1em; display: flex; flex-direction: column; gap: var(--space-2); }
  .wide2 { grid-column: span 2; }
  @media (max-width: 1100px) { .wide2 { grid-column: auto; } }
  td.up { color: var(--success); font-weight: 600; } td.down { color: var(--danger); font-weight: 600; }
  @media print {
    :global(.side), :global(.top), :global(.tabs), :global(.filters), .noprint, :global(.page-head .row) { display: none !important; }
    :global(.content) { padding: 0 !important; }
    .qr :global(.charts-grid) { grid-template-columns: 1fr 1fr; }
    .qr :global(.card) { break-inside: avoid; box-shadow: none; }
  }
</style>
