<script lang="ts">
  // Directors · business (docs/15): executive overview ★1, combined performance (link), profit and margin ★2, landed cost per
  // product and per truck, selling price & target margin (link + gauge), fast / slow products ★3.
  import type { DashKey, DashResult } from '@btw/api';
  import { DashboardPanel, Waterfall, StackedBarH, QuadrantScatter, type Kpi } from '../../../components/dashboard';
  import '../../../components/dashboard/report.css';
  import { BarChart, Donut, Meter } from '../../../components/charts';
  import type { Ink } from '../../../components/charts/theme.svelte';
  import ColumnsLine from '../../../components/charts/ColumnsLine.svelte';
  import { compact } from '../../../components/charts/scale';
  import { frame, cv, money, money2, cvRow, n0, pctF, monthLabel, currency } from '../fmt.svelte';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  let { key, r, link, span }: { key: DashKey; r: DashResult; link?: string; span?: 1 | 2 | 'full' } = $props();
  const d = $derived(r.data as any);
  const fr = $derived(frame(r));
  const go = (h: string) => (location.hash = h.replace(/^#/, ''));

  // ── executive overview: the three commercial figures. Trucks, orders and alerts stay on Home. ──
  const PERIOD = new Set(['sales', 'profit', 'margin']);
  const kpis = $derived.by((): Kpi[] => (key !== 'exec-overview' ? [] : d.kpis.filter((k: any) => PERIOD.has(k.key)).map((k: any) => {
    const fmt = k.unit === 'usd' ? (n: number) => compact(cv(n)) : k.unit === 'pct' ? (n: number) => pctF(n) : (n: number) => n0(n);
    const change = k.value != null && k.prev != null && k.changeKind ? { value: k.changeKind === 'pp' ? (k.value - k.prev) * 100 : k.prev ? (k.value - k.prev) / Math.abs(k.prev) : null, kind: k.changeKind, upIsGood: k.upIsGood ?? true, label: 'vs previous period' } : undefined;
    return { label: k.unit === 'usd' ? `${k.label} (${currency.code})` : k.label, value: k.value, format: fmt, change, trend: k.trend ?? undefined, note: k.note, status: k.status, href: k.href };
  })));
  const kpiRows = () => [['Measure', 'Value', 'Previous period', 'Unit'], ...(d.kpis ?? []).filter((k: any) => PERIOD.has(k.key)).map((k: any) => [k.label, k.value == null ? 'No data yet' : k.unit === 'usd' ? cvRow(k.value) : k.value, k.prev == null ? '' : k.unit === 'usd' ? cvRow(k.prev) : k.prev, k.unit === 'usd' ? currency.code : k.unit])];
  const marginTone = $derived(d?.margin == null || d?.targetMargin == null ? 'accent' : d.margin >= d.targetMargin ? 'success' : d.margin >= d.targetMargin * 0.8 ? 'warning' : 'danger');

  // ── profit ──
  const wf = $derived(key === 'profit-margin' ? (d.waterfall ?? []).map((s: any) => ({ label: s.label === 'Revenue' ? 'Sales' : s.label === 'Goods' ? 'Goods cost' : s.label === 'Truck' ? 'Truck cost' : s.label === 'Warehouse' ? 'Warehouse share' : s.label === 'Other' ? 'Other costs' : s.label, value: s.value, kind: s.kind })) : []);
  const wfRows = () => [['Step', `Change (${currency.code})`], ...wf.map((s: any) => [s.label, cvRow(s.value)])];
  const shareOf100 = $derived.by(() => {
    if (key !== 'profit-margin') return [] as { label: string; value: number }[];
    const sales = wf.find((s: { label: string; kind?: string }) => s.kind === 'total' && (s.label === 'Sales' || s.label === 'Revenue'));
    const base = sales?.value || 0;
    if (!base) return [];
    const inkOf: Record<string, Ink> = { 'Goods cost': 'navy', 'Truck cost': 'teal', 'Warehouse share': 'warn', 'Other costs': 'slate', Profit: 'good' };
    return wf.filter((s: { label: string; value: number }) => s !== sales && Math.abs(s.value) > 0).map((s: { label: string; value: number }) => ({ label: s.label, value: Math.round((Math.abs(s.value) / base) * 1000) / 10, ink: inkOf[s.label] }));
  });
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
  <DashboardPanel span="full" subtitle="against the previous period" decision="Open performance for the full product, warehouse and company breakdown." {...fr} title="Sales, profit and margin" rows={kpiRows} filename="sales-profit-margin" owner="Directors" drill={{ label: 'Open performance', href: '#/performance' }}>
    <div class="biz-kpis">
      <div class="dash-kpis" role="list" aria-label="Sales, profit and margin">
        {#each kpis as k (k.label)}
          {@const c = k.change}
          {@const dir = c?.value == null ? 0 : Math.sign(c.value)}
          {@const good = dir === 0 ? null : (dir > 0) === (c?.upIsGood ?? true)}
          <svelte:element this={k.href ? 'a' : 'div'} role="listitem" class="card kpi" href={k.href || undefined}>
            <span class="lbl">{k.label}</span>
            {#if k.value == null}<b class="val none">No data yet</b>{:else}<b class="val">{(k.format ?? ((n: number) => String(n)))(k.value)}</b>{/if}
            <span class="sub">{#if c && c.value != null}<span class="dash-chip" class:good={good === true} class:bad={good === false}>{dir > 0 ? '▲' : dir < 0 ? '▼' : '0'} {c.kind === 'pp' ? `${Math.abs(c.value).toFixed(1)} pp` : c.kind === 'abs' ? (k.format ?? ((n: number) => String(n)))(Math.abs(c.value)) : `${(Math.abs(c.value) * 100).toFixed(1)}%`}</span>{/if} {c?.label ?? (k.note ?? '')}</span>
          </svelte:element>
        {/each}
      </div>
    </div>
  </DashboardPanel>
{:else if key === 'combined-performance'}
  <DashboardPanel span={span ?? 1} subtitle="totals · open the report to switch level" decision="Open the full report to change product, warehouse or company." {...fr} title={r.title} rows={() => (d ? [['Measure', 'Value'], ['Sales', cvRow(d.revenue)], ['Profit', cvRow(d.profit)], ['Margin', pctF(d.margin)], ['Cases received', d.qtyReceived], ['Landed cost', cvRow(d.landedCost)]] : [['Measure', 'Value']])} filename="combined-performance" drill={{ label: 'Open combined performance', href: '#/performance' }}>
    {#if d}
      <div class="bridge" role="img" aria-label="Sales {money(d.revenue)}, costs {money(d.costs)}, profit {money(d.profit)}">
        <div class="row between small"><span>Sales</span><b>{money(d.revenue)}</b></div>
        <div class="track"><span class="fill sales"></span></div>
        <div class="row between small"><span>Costs (landed + other)</span><b>{money(d.costs)}</b></div>
        <div class="track"><span class="fill costs" style:width="{d.revenue ? Math.min(100, (d.costs / d.revenue) * 100) : 0}%"></span></div>
        <div class="row between small"><span>Profit</span><b>{money(d.profit)}</b></div>
        <div class="track"><span class="fill profit" style:width="{d.revenue ? Math.min(100, Math.max(0, (d.profit / d.revenue) * 100)) : 0}%"></span></div>
      </div>
      <Meter label="Margin vs target" value={d.margin ?? 0} max={Math.max(0.4, (d.targetMargin ?? 0.2) * 1.5)} target={d.targetMargin} tone={marginTone} format={(n) => pctF(n)} note={`${n0(d.qtySold)} cases sold · landed ${money2(d.landedPerUnit)} / case`} />
      <a class="btn btn-secondary btn-sm golink" href="#/performance">Product · warehouse · company · business <ArrowRight size={14} /></a>
    {/if}
  </DashboardPanel>
{:else if key === 'profit-margin'}
  <DashboardPanel span={span ?? 1} subtitle="the cost steps from sales to profit" decision="Cut the cost step that eats the most margin." {...fr} title={r.title} rows={wfRows} filename="profit-bridge" {drill}>
    <div class="split">
      <div>
        <p class="cap-line">Profit bridge</p>
        <Waterfall label="Profit bridge from sales to profit" steps={wf} format={money} onselect={() => go('#/performance')} />
      </div>
      <div>
        {#if shareOf100.length}
          <p class="cap-line">Where each $100 went</p>
          <Donut label="Where each $100 of sales went" data={shareOf100} format={(n) => `$${Math.round(n)}`} center="$100" height={220} />
        {/if}
      </div>
    </div>
  </DashboardPanel>
  <DashboardPanel span={span ?? 1} subtitle="sales in navy, profit in green" decision="Protect the months where profit is falling." {...fr} title="Sales and profit by month" period="Last 6 months" rows={mRows} filename="sales-and-profit-by-month" empty={!(d.months ?? []).some((m: any) => m.revenue)}>
    <BarChart label="Sales and profit by month" categories={(d.months ?? []).map((m: any) => monthLabel(m.month))} series={[{ name: 'Sales', values: d.months.map((m: any) => m.revenue), ink: 'navy' }, { name: 'Profit', values: d.months.map((m: any) => Math.max(0, m.profit)), ink: 'good' }]} format={money} labels={false} />
    <p class="cap-line cost">Cost and margin</p>
    <ColumnsLine label="Goods, truck and warehouse against profit" categories={(d.months ?? []).map((m: any) => monthLabel(m.month))}
      parts={[{ name: 'Goods cost', values: d.months.map((m: any) => m.goods), ink: 'navy' }, { name: 'Truck, warehouse, other', values: d.months.map((m: any) => m.expenses), ink: 'teal' }, { name: 'Profit', values: d.months.map((m: any) => m.profit), ink: 'good' }]}
      line={{ name: 'Margin', values: d.months.map((m: any) => m.margin) }} format={money} />
  </DashboardPanel>
{:else if key === 'landed-product'}
  <DashboardPanel span={span ?? 1} subtitle="goods + truck + warehouse, share of each" decision="Challenge the truck or warehouse share that is out of line." {...fr} title={r.title} unit="{currency.code} per case" rows={lpRows} filename="landed-cost-per-product" {drill}>
    <StackedBarH label="Landed cost per case by product" categories={(d.rows ?? []).map((x: any) => x.label)} parts={[{ name: 'Goods', values: (d.rows ?? []).map((x: any) => x.goods), ink: 'navy' }, { name: 'Truck', values: (d.rows ?? []).map((x: any) => x.truck), ink: 'teal' }, { name: 'Warehouse', values: (d.rows ?? []).map((x: any) => x.warehouse), ink: 'warn' }]} format={money2} onselect={() => go('#/performance')} />
  </DashboardPanel>
{:else if key === 'landed-truck'}
  <DashboardPanel span={span ?? 1} subtitle="all trip costs by category" decision="Open every trip flagged above average." {...fr} title={r.title} rows={ltRows} filename="landed-cost-per-truck" {drill}>
    <BarChart label="Trip costs per truck by category" horizontal stacked categories={ltTop.map((x: any) => x.truck)} series={(d.kinds ?? []).map((k: string) => ({ name: k, values: ltTop.map((x: any) => x.byKind[k] ?? 0) }))} format={money} />
  </DashboardPanel>
{:else if key === 'selling-price'}
  <DashboardPanel span={span ?? 1} subtitle="{d ? `${d.below} of ${d.products} priced products are below the ${pctF(d.target, 0)} target` : ''}" decision="Raise the price, or stop selling the line." {...fr} title="Prices below target" rows={spRows} filename="prices-below-target" empty={!d?.products} drill={{ label: 'Open selling prices', href: '#/selling-prices' }}>
    {#if d?.worst?.length}
      <ul class="prices">
        {#each d.worst as w}<li><span class="nm">{w.label}</span><b>{pctF(w.margin)}</b><span class="need">Price {money2(w.needed)}</span></li>{/each}
      </ul>
    {:else if d?.products}
      <p class="caption">Every priced product meets the target.</p>
    {/if}
  </DashboardPanel>
{:else if key === 'fast-slow'}
  <DashboardPanel span={span ?? 2} subtitle="sales speed against days of stock · bubble = stock value" decision="Move or stop buying the slow, overstocked products." {...fr} title={r.title} rows={fsRows} filename="fast-slow-products" {drill}>
    <QuadrantScatter label="Products by sales speed and days of stock" points={d.points ?? []} {groups} xLabel="Sales speed (cases/day)" yLabel="Days of stock" xThreshold={d.xThreshold ?? undefined} yThreshold={d.yThreshold}
      quadrants={{ topLeft: { label: 'Slow & overstocked', status: 'bad' }, topRight: { label: 'Fast, well stocked', status: 'good' }, bottomLeft: { label: 'Slow, little stock', status: 'none' }, bottomRight: { label: 'Fast & running low', status: 'warn' } }}
      formatX={(n) => `${n}/day`} formatY={(n) => `${n} d`} sizeLabel="Stock value {currency.code}" onselect={() => go('#/stock')} />
  </DashboardPanel>
{/if}

<style>
  .bridge { display: flex; flex-direction: column; gap: 6px; margin-bottom: var(--space-4); }
  .track { height: 8px; border-radius: 4px; background: var(--surface-sunken); overflow: hidden; }
  .fill { display: block; height: 100%; border-radius: 4px; }
  .fill.sales { width: 100%; background: var(--viz-1); }
  .fill.costs { background: var(--viz-2); }
  .fill.profit { background: var(--viz-3); }
  .biz-kpis :global(.dash-kpis) { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .prices { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
  .prices li { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 10px; align-items: baseline; padding: 8px 0; border-top: 1px solid var(--border); }
  .prices li:first-child { border-top: 0; }
  .prices .nm { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .prices b { font-variant-numeric: tabular-nums; }
  .prices .need { color: var(--text-muted); font-size: 13px; font-variant-numeric: tabular-nums; }
  @media (max-width: 720px) { .biz-kpis :global(.dash-kpis) { grid-template-columns: 1fr; } .prices li { grid-template-columns: minmax(0, 1fr) auto; } .prices .need { grid-column: 1 / -1; } }
  .golink { margin-top: var(--space-3); }
  .split { display: flex; flex-wrap: wrap; gap: var(--space-4); align-items: stretch; }
  .split > div { flex: 1 1 220px; min-width: 0; display: flex; flex-direction: column; }
  .cap-line { margin: 0 0 var(--space-2); font-size: 12px; font-weight: 600; color: var(--text-muted); }
  .cap-line.cost { margin-top: var(--space-4); }
  @media (max-width: 1100px) { .split { flex-direction: column; } }
</style>
