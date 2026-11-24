<script lang="ts">
  // Directors · business (docs/15): executive overview ★1, combined performance (link), profit and margin ★2, landed cost per
  // product and per truck, selling price & target margin (link + gauge), fast / slow products ★3.
  import type { DashKey, DashResult } from '@btw/api';
  import { DashboardPanel, KpiScorecard, ExceptionList, Waterfall, StackedBarH, QuadrantScatter, StatusBadge, type Kpi } from '../../../components/dashboard';
  import { BarChart, Donut, Gauge, Meter } from '../../../components/charts';
  import type { Ink } from '../../../components/charts/theme.svelte';
  import ColumnsLine from '../../../components/charts/ColumnsLine.svelte';
  import { compact } from '../../../components/charts/scale';
  import { frame, cv, money, money2, cvRow, n0, pctF, monthLabel, currency } from '../fmt.svelte';
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
  const kpiRows = () => [['Measure', 'Value', 'Previous period', 'Unit'], ...(d.kpis ?? []).map((k: any) => [k.label, k.value == null ? 'No data yet' : k.unit === 'usd' ? cvRow(k.value) : k.value, k.prev == null ? '' : k.unit === 'usd' ? cvRow(k.prev) : k.prev, k.unit === 'usd' ? currency.code : k.unit])];
  const excRows = () => [['Severity', 'Exception', 'Detail', 'Owner', 'Due', 'Status'], ...(d.exceptions ?? []).map((e: any) => [e.severity, e.title, e.detail, e.owner ?? 'Not assigned', e.due ?? '', e.status])];
  const bulletTone = (s: string) => (s === 'good' ? 'success' : s === 'warn' ? 'warning' : s === 'bad' ? 'danger' : 'accent') as 'success' | 'warning' | 'danger' | 'accent';
  const bulletFmt = (b: { unit: string }) => (b.unit === 'pct' ? (n: number) => pctF(n) : (n: number) => `${Math.round(n)} d`);
  const bulletRows = () => [['Measure', 'Value', 'Target', 'Status'], ...(d.bullets ?? []).map((b: any) => [b.label, b.value == null ? 'No data yet' : b.unit === 'pct' ? pctF(b.value) : `${Math.round(b.value)} d`, b.unit === 'pct' ? pctF(b.target) : `${b.target} d`, b.status])];
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
  const why = $derived.by(() => {
    if (key !== 'profit-margin') return '';
    const ms = (d?.months ?? []).filter((m: { revenue: number }) => m.revenue);
    const a = ms.at(-1) as { month: string; profit: number; revenue: number } | undefined;
    const b = ms.at(-2) as { month: string; profit: number } | undefined;
    if (!a || !b) return '';
    const diff = a.profit - b.profit;
    const recent = ms.slice(-3) as { revenue: number }[];
    const avg = recent.reduce((s, m) => s + m.revenue, 0) / recent.length;
    return `Profit in ${monthLabel(a.month)} is ${money(a.profit)}, ${diff >= 0 ? 'up' : 'down'} ${money(Math.abs(diff))} from ${monthLabel(b.month)}. If the last ${recent.length} months hold, sales next month are near ${money(avg)}.`;
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
  <DashboardPanel span="full" subtitle="tap a figure to open its list" decision="Unblock delayed trucks and high-priority alerts first; then prices and stock that miss target." {...fr} title={r.title} rows={() => [...kpiRows(), ...bulletRows().slice(1), ...excRows().slice(1)]} filename="executive-overview" owner="Directors">
    <div class="exec">
      <div class="exec-main">
        <KpiScorecard items={kpis} label="Executive overview" />
        {#if d.bullets?.length}
          <div class="bullets">
            {#each d.bullets as b}
              {#if b.value != null}
                <Meter label={b.label} value={b.value} max={b.max} target={b.target} tone={bulletTone(b.status)} format={bulletFmt(b)} note={b.note} />
              {:else}
                <p class="caption">{b.label}: no data yet</p>
              {/if}
            {/each}
          </div>
        {/if}
      </div>
      <aside class="exec-side" aria-label="Exceptions">
        <div class="side-head">
          <h4>Exceptions</h4>
          <p class="caption">By severity, then due time. Assign an owner on every open item.</p>
        </div>
        <ExceptionList items={d.exceptions} max={6} moreHref="#/dashboards/admin" label="Delayed trucks and high-priority alerts" />
        {#if !d.exceptions?.length}<p class="caption">Nothing urgent right now.</p>{/if}
        <a class="btn btn-ghost btn-sm golink" href="#/dashboards/admin">Open the alerts centre <ArrowRight size={14} /></a>
      </aside>
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
    {#if why}<p class="caption">{why}</p>{/if}
    {#if d.estimated}<p class="caption">Part of the cost of units sold is estimated (products with no landed cost yet).</p>{/if}
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
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Truck</th><th class="hide-sm">Provider</th><th class="num">Trips</th><th class="num">Total</th><th class="num">Per case</th><th></th></tr></thead>
      <tbody>{#each ltTop as x}<tr><td><b>{x.truck}</b></td><td class="hide-sm small">{x.provider}</td><td class="num">{x.trips}</td><td class="num">{money(x.total)}</td><td class="num">{money2(x.perCase)}</td>
        <td>{#if x.aboveAverage}<StatusBadge status="warn" label="Above average" />{:else if x.notRecorded}<StatusBadge status="none" label="Price not recorded" />{/if}</td></tr>{/each}</tbody>
    </table></div>
    <p class="caption">Average {money2(d.avgPerCase)} per case.</p>
  </DashboardPanel>
{:else if key === 'selling-price'}
  <DashboardPanel span={span ?? 1} subtitle="margin at today's prices against the target" decision="Raise prices, or stop selling, on lines below target." {...fr} title={r.title} rows={spRows} filename="selling-price-margin" drill={{ label: 'Open the target-margin calculator', href: '#/selling-prices' }}>
    {#if d}
      <div class="gauge-row">
        <Gauge label="Average margin at today's prices" value={Math.max(0, d.avgMargin ?? 0)} max={Math.max(0.4, d.target * 1.5)} target={d.target} tone={(d.avgMargin ?? 0) >= d.target ? 'success' : 'warning'} format={(n) => pctF(n)} />
        <div class="small"><p><b>{d.below}</b> of {d.products} priced products below the {pctF(d.target, 0)} target.</p>
          {#if d.worst?.length}<ul class="plain">{#each d.worst as w}<li>{w.label}: {pctF(w.margin)} → price {money2(w.needed)}</li>{/each}</ul>{/if}</div>
      </div>
    {/if}
  </DashboardPanel>
{:else if key === 'fast-slow'}
  <DashboardPanel span={span ?? 2} subtitle="sales speed against days of stock · bubble = stock value" decision="Move or stop buying the slow, overstocked products." {...fr} title={r.title} rows={fsRows} filename="fast-slow-products" {drill}>
    <QuadrantScatter label="Products by sales speed and days of stock" points={d.points ?? []} {groups} xLabel="Sales speed (cases/day)" yLabel="Days of stock" xThreshold={d.xThreshold ?? undefined} yThreshold={d.yThreshold}
      quadrants={{ topLeft: { label: 'Slow & overstocked', status: 'bad' }, topRight: { label: 'Fast, well stocked', status: 'good' }, bottomLeft: { label: 'Slow, little stock', status: 'none' }, bottomRight: { label: 'Fast & running low', status: 'warn' } }}
      formatX={(n) => `${n}/day`} formatY={(n) => `${n} d`} sizeLabel="Stock value {currency.code}" onselect={() => go('#/stock')} />
    {#if d.noSales?.length}<p class="caption">{d.noSales.length} product{d.noSales.length === 1 ? '' : 's'} with stock and no sales in the period (not plotted): {d.noSales.slice(0, 4).map((x: any) => x.label).join(', ')}{d.noSales.length > 4 ? '…' : ''}</p>{/if}
  </DashboardPanel>
{/if}

<style>
  .bridge { display: flex; flex-direction: column; gap: 6px; margin-bottom: var(--space-4); }
  .track { height: 8px; border-radius: 4px; background: var(--surface-sunken); overflow: hidden; }
  .fill { display: block; height: 100%; border-radius: 4px; }
  .fill.sales { width: 100%; background: var(--viz-1); }
  .fill.costs { background: var(--viz-2); }
  .fill.profit { background: var(--viz-3); }
  .bullets { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--space-4); margin-top: var(--space-5); }
  .golink { margin-top: var(--space-3); }
  .gauge-row { display: flex; gap: var(--space-4); align-items: center; flex-wrap: wrap; }
  .plain { margin: var(--space-2) 0 0; padding-left: 18px; }
  .exec { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(280px, 1fr); gap: var(--space-5); align-items: start; }
  .exec-side { border: 1px solid var(--border); border-radius: var(--radius-md); padding: var(--space-4); background: var(--surface-sunken); }
  .side-head h4 { margin: 0 0 4px; font-size: 15px; }
  .split { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4); align-items: start; }
  .cap-line { margin: 0 0 var(--space-2); font-size: 12px; font-weight: 600; color: var(--text-muted); }
  .cap-line.cost { margin-top: var(--space-4); }
  @media (max-width: 1100px) { .exec, .split { grid-template-columns: 1fr; } }
  @media (max-width: 600px) { .hide-sm { display: none; } }
</style>
