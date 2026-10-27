<script lang="ts">
  // Directors · business (docs/15): executive overview ★1, combined performance (link), profit and margin ★2, landed cost per
  // product and per truck, selling price & target margin (link + gauge), fast / slow products ★3.
  import type { DashKey, DashResult } from '@btw/api';
  import { DashboardPanel, KpiScorecard, ExceptionList, Waterfall, StackedBarH, QuadrantScatter, StatusBadge, type Kpi } from '../../../components/dashboard';
  import { BarChart, Gauge } from '../../../components/charts';
  import ColumnsLine from '../../../components/charts/ColumnsLine.svelte';
  import { compact } from '../../../components/charts/scale';
  import { frame, cv, money, money2, cvRow, unitMoney, n0, pctF, monthLabel, currency } from '../fmt.svelte';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  let { key, r, link, span }: { key: DashKey; r: DashResult; link?: string; span?: 1 | 2 | 'full' } = $props();
  const d = $derived(r.data as any);
  const fr = $derived(frame(r));
  const go = (h: string) => (location.hash = h.replace(/^#/, ''));

  // ── executive overview ──
  const kpis = $derived.by((): Kpi[] => (key !== 'exec-overview' ? [] : d.kpis.map((k: any) => {
    const fmt = k.unit === 'usd' ? (n: number) => compact(cv(n)) : k.unit === 'pct' ? (n: number) => pctF(n) : (n: number) => n0(n);
    const change = k.value != null && k.prev != null && k.changeKind ? { value: k.changeKind === 'pp' ? (k.value - k.prev) * 100 : k.prev ? (k.value - k.prev) / Math.abs(k.prev) : null, kind: k.changeKind, upIsGood: k.upIsGood ?? true, label: 'vs previous period' } : undefined;
    return { label: k.unit === 'usd' ? `${k.label} (${currency.code})` : k.label, value: k.value, format: fmt, change, trend: k.trend ?? undefined, note: k.note, status: k.status, href: k.href };
  })));
  const excRows = () => [['Severity', 'Exception', 'Detail', 'Owner', 'Due', 'Status'], ...(d.exceptions ?? []).map((e: any) => [e.severity, e.title, e.detail, e.owner ?? 'Not assigned', e.due ?? '', e.status])];
  const kpiRows = () => [['Measure', 'Value', 'Previous period', 'Unit'], ...(d.kpis ?? []).map((k: any) => [k.label, k.value == null ? 'No data yet' : k.unit === 'usd' ? cvRow(k.value) : k.value, k.prev == null ? '' : k.unit === 'usd' ? cvRow(k.prev) : k.prev, k.unit === 'usd' ? currency.code : k.unit])];

  // ── profit ──
  const wf = $derived(key === 'profit-margin' ? (d.waterfall ?? []).map((s: any) => ({ label: s.label === 'Revenue' ? 'Sales' : s.label === 'Goods' ? 'Goods cost' : s.label === 'Truck' ? 'Truck cost' : s.label === 'Warehouse' ? 'Warehouse share' : s.label === 'Other' ? 'Other costs' : s.label, value: s.value, kind: s.kind })) : []);
  const wfRows = () => [['Step', `Change (${currency.code})`], ...wf.map((s: any) => [s.label, cvRow(s.value)])];
  const mRows = () => [['Month', `Sales (${currency.code})`, `Goods cost (${currency.code})`, `Truck + warehouse + other (${currency.code})`, `Profit (${currency.code})`, 'Margin'], ...(d.months ?? []).map((m: any) => [m.month, cvRow(m.revenue), cvRow(m.goods), cvRow(m.expenses), cvRow(m.profit), m.margin == null ? '' : pctF(m.margin)])];
  // ── landed cost ──
  const lpRows = () => [['Product', 'Cases received', `Goods (${currency.code}/case)`, `Truck (${currency.code}/case)`, `Warehouse (${currency.code}/case)`, `Landed (${currency.code}/case)`], ...(d.rows ?? []).map((x: any) => [x.label, x.qty, cvRow(x.goods), cvRow(x.truck), cvRow(x.warehouse), cvRow(x.total)])];
  const ltTop = $derived(key === 'landed-truck' ? (d.rows ?? []).slice(0, 12) : []);
  const ltRows = () => [['Truck', 'Provider', 'Trips', 'Cases', ...(d.kinds ?? []).map((k: string) => `${k} (${currency.code})`), `Total (${currency.code})`, `Per case (${currency.code})`, 'Above average'], ...(d.rows ?? []).map((x: any) => [x.truck, x.provider, x.trips, x.cases, ...d.kinds.map((k: string) => cvRow(x.byKind[k])), cvRow(x.total), cvRow(x.perCase), x.aboveAverage ? 'Yes' : ''])];
  // ── fast / slow ──
  const fsRows = () => [['Product', 'Category', 'Sales speed (cases/day)', 'Days of stock', `Stock value (${currency.code})`], ...(d.points ?? []).map((p: any) => [p.label, p.group, p.x, p.y, cvRow(p.size)]), ...(d.noSales ?? []).map((p: any) => [p.label, '', 'No sales', 'No data yet', ''])];
  const groups = $derived(key === 'fast-slow' ? [...new Set((d.points ?? []).map((p: any) => p.group as string))] as string[] : []);
  const spRows = () => [['Product', `Selling price (${currency.code})`, `Landed (${currency.code}/case)`, 'Margin', `Price for target (${currency.code})`], ...(d?.worst ?? []).map((x: any) => [x.label, cvRow(x.price), cvRow(x.landed), pctF(x.margin), cvRow(x.needed)])];
  const drill = $derived(link ? { label: 'Open the full screen', href: link } : undefined);
</script>

{#if key === 'exec-overview'}
  <DashboardPanel span="full" title="Executive overview" subtitle="tap a figure to open its list" {...fr} rows={kpiRows} filename="executive-overview" owner="Directors">
    <KpiScorecard items={kpis} label="Executive overview" />
  </DashboardPanel>
  <DashboardPanel span="full" title="Delayed trucks and high-priority alerts" subtitle="by severity, then due time" definition="Delayed trucks and every critical or high alert from the alerts centre, each with an owner and a due time. Overdue items show in red." period="Open now" updatedAt={r.freshness} rows={excRows} filename="exceptions" empty={!d.exceptions?.length} emptyText="Nothing urgent right now" drill={{ label: 'Open the alerts centre', href: '#/dashboards/admin' }}>
    <ExceptionList items={d.exceptions} max={6} moreHref="#/dashboards/admin" label="Delayed trucks and high-priority alerts" />
  </DashboardPanel>
{:else if key === 'combined-performance'}
  <DashboardPanel span={span ?? 1} title="Combined performance" subtitle="totals · open the report to switch level" {...fr} rows={() => (d ? [['Measure', 'Value'], ['Sales', cvRow(d.revenue)], ['Profit', cvRow(d.profit)], ['Margin', pctF(d.margin)], ['Cases received', d.qtyReceived], ['Landed cost', cvRow(d.landedCost)]] : [['Measure', 'Value']])} filename="combined-performance" drill={{ label: 'Open combined performance', href: '#/performance' }}>
    {#if d}
      <div class="mini">
        <div><span class="caption">Sales</span><b>{money(d.revenue)}</b></div>
        <div><span class="caption">Profit</span><b>{money(d.profit)}</b></div>
        <div><span class="caption">Margin</span><b>{pctF(d.margin)}</b></div>
        <div><span class="caption">Landed cost per case</span><b>{money2(d.landedPerUnit)}</b></div>
      </div>
      <a class="btn btn-secondary btn-sm golink" href="#/performance">Product · warehouse · company · business <ArrowRight size={14} /></a>
    {/if}
  </DashboardPanel>
{:else if key === 'profit-margin'}
  <DashboardPanel span={span ?? 1} title="Profit bridge" subtitle="how sales become profit" {...fr} rows={wfRows} filename="profit-bridge" {drill}>
    <Waterfall label="Profit bridge from sales to profit" steps={wf} format={money} onselect={() => go('#/performance')} />
    {#if d.estimated}<p class="caption">Part of the cost of units sold is estimated (products with no landed cost yet).</p>{/if}
  </DashboardPanel>
  <DashboardPanel span={span ?? 1} title="Profit and margin by month" subtitle="goods cost · truck, warehouse and other · profit, with margin %" {...fr} period="Last 6 months" rows={mRows} filename="profit-by-month" empty={!(d.months ?? []).some((m: any) => m.revenue)}>
    <ColumnsLine label="Monthly cost, expenses and profit with margin" categories={(d.months ?? []).map((m: any) => monthLabel(m.month))}
      parts={[{ name: 'Goods cost', values: d.months.map((m: any) => m.goods) }, { name: 'Truck, warehouse, other', values: d.months.map((m: any) => m.expenses), slot: 2 }, { name: 'Profit', values: d.months.map((m: any) => m.profit), slot: 1 }]}
      line={{ name: 'Margin', values: d.months.map((m: any) => m.margin) }} format={money} />
  </DashboardPanel>
{:else if key === 'landed-product'}
  <DashboardPanel span={span ?? 1} title="Landed cost per case" subtitle="goods + truck + warehouse, share of each" {...fr} unit="{currency.code} per case" rows={lpRows} filename="landed-cost-per-product" {drill}>
    <StackedBarH label="Landed cost per case by product" categories={(d.rows ?? []).map((x: any) => x.label)} parts={[{ name: 'Goods', values: (d.rows ?? []).map((x: any) => x.goods) }, { name: 'Truck', values: (d.rows ?? []).map((x: any) => x.truck) }, { name: 'Warehouse', values: (d.rows ?? []).map((x: any) => x.warehouse) }]} format={money2} onselect={() => go('#/performance')} />
  </DashboardPanel>
{:else if key === 'landed-truck'}
  <DashboardPanel span={span ?? 1} title="Landed cost per truck" subtitle="all trip costs by category · above average flagged" {...fr} rows={ltRows} filename="landed-cost-per-truck" {drill}>
    <BarChart label="Trip costs per truck by category" horizontal stacked categories={ltTop.map((x: any) => x.truck)} series={(d.kinds ?? []).map((k: string) => ({ name: k, values: ltTop.map((x: any) => x.byKind[k] ?? 0) }))} format={money} />
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Truck</th><th class="hide-sm">Provider</th><th class="num">Trips</th><th class="num">Total</th><th class="num">Per case</th><th></th></tr></thead>
      <tbody>{#each ltTop as x}<tr><td><b>{x.truck}</b></td><td class="hide-sm small">{x.provider}</td><td class="num">{x.trips}</td><td class="num">{money(x.total)}</td><td class="num">{money2(x.perCase)}</td>
        <td>{#if x.aboveAverage}<StatusBadge status="warn" label="Above average" />{:else if x.notRecorded}<StatusBadge status="none" label="Price not recorded" />{/if}</td></tr>{/each}</tbody>
    </table></div>
    <p class="caption">Average {money2(d.avgPerCase)} per case.</p>
  </DashboardPanel>
{:else if key === 'selling-price'}
  <DashboardPanel span={span ?? 1} title="Selling price & target margin" subtitle="margin at today's prices against the target" {...fr} rows={spRows} filename="selling-price-margin" drill={{ label: 'Open the target-margin calculator', href: '#/selling-prices' }}>
    {#if d}
      <div class="gauge-row">
        <Gauge label="Average margin at today's prices" value={Math.max(0, d.avgMargin ?? 0)} max={Math.max(0.4, d.target * 1.5)} target={d.target} tone={(d.avgMargin ?? 0) >= d.target ? 'success' : 'warning'} format={(n) => pctF(n)} />
        <div class="small"><p><b>{d.below}</b> of {d.products} priced products below the {pctF(d.target, 0)} target.</p>
          {#if d.worst?.length}<ul class="plain">{#each d.worst as w}<li>{w.label}: {pctF(w.margin)} → price {money2(w.needed)}</li>{/each}</ul>{/if}</div>
      </div>
    {/if}
  </DashboardPanel>
{:else if key === 'fast-slow'}
  <DashboardPanel span={span ?? 2} title="Fast and slow products" subtitle="sales speed against days of stock · bubble = stock value" {...fr} rows={fsRows} filename="fast-slow-products" {drill}>
    <QuadrantScatter label="Products by sales speed and days of stock" points={d.points ?? []} {groups} xLabel="Sales speed (cases/day)" yLabel="Days of stock" xThreshold={d.xThreshold ?? undefined} yThreshold={d.yThreshold}
      quadrants={{ topLeft: { label: 'Slow & overstocked', status: 'bad' }, topRight: { label: 'Fast, well stocked', status: 'good' }, bottomLeft: { label: 'Slow, little stock', status: 'none' }, bottomRight: { label: 'Fast & running low', status: 'warn' } }}
      formatX={(n) => `${n}/day`} formatY={(n) => `${n} d`} sizeLabel="Stock value {currency.code}" onselect={() => go('#/stock')} />
    {#if d.noSales?.length}<p class="caption">{d.noSales.length} product{d.noSales.length === 1 ? '' : 's'} with stock and no sales in the period (not plotted): {d.noSales.slice(0, 4).map((x: any) => x.label).join(', ')}{d.noSales.length > 4 ? '…' : ''}</p>{/if}
  </DashboardPanel>
{/if}

<style>
  .mini { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3); }
  .mini div { display: flex; flex-direction: column; gap: 2px; }
  .mini b { font: 700 20px/1.2 var(--ff-display); }
  .golink { margin-top: var(--space-3); }
  .gauge-row { display: flex; gap: var(--space-4); align-items: center; flex-wrap: wrap; }
  .plain { margin: var(--space-2) 0 0; padding-left: 18px; }
  @media (max-width: 600px) { .hide-sm { display: none; } }
</style>
