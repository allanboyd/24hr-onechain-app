<script lang="ts">
  // docs/14 B-07 (roles document §6.2–6.4): the combined performance report — directors only. Four levels (product,
  // warehouse, company incl. the receiving companies Asie / Yonas, whole business): quantity received, goods / truck /
  // warehouse cost, landed cost and per case (landed cost v2, B-06), selling price, sold, revenue, cost of units sold,
  // profit, margin, stock on hand; profit bridge; landed cost per truck; fast / slow products; the target-margin helper.
  import { lookup, reports, ref, type PerformanceReport, type PerfLevel, type PerfRow, type User } from '@btw/api';
  import { fmtNum } from '@btw/ui';
  import { priceForMargin } from '@btw/api/money';
  import { DashboardGrid, DashboardPanel, StackedBarH, StatusBadge, Waterfall } from '../components/dashboard';
  import { watch } from '../lib/load.svelte';
  import { companyLabel } from '../lib/companies';
  let { user: _user }: { params?: any; user: User } = $props();

  const PERIODS = [['last-30', 'Last 30 days'], ['last-90', 'Last 90 days'], ['this-quarter', 'This quarter'], ['last-quarter', 'Last quarter'], ['ytd', 'Year to date'], ['last-12m', 'Last 12 months']] as const;
  const LEVELS: [PerfLevel, string][] = [['product', 'Product'], ['warehouse', 'Warehouse'], ['company', 'Company (BTW, Nihna, Kivu)'], ['receiving', 'Receiving company (Asie, Yonas)'], ['business', 'Whole business']];
  let period = $state<(typeof PERIODS)[number][0]>('last-90');
  let level = $state<PerfLevel>('product');
  let warehouseId = $state('');
  let target = $state(20);
  let rep = $state<PerformanceReport | null>(null);
  const range = $derived(reports.resolvePeriod(period, Date.now()));
  const w = watch(async () => { rep = await reports.performance({ level, from: range.from, to: range.to, warehouseId: warehouseId || undefined, targetMargin: target / 100 }); }, () => [period, level, warehouseId, target]);

  const usd = (n: number) => `USD ${fmtNum(n)}`;
  const usd2 = (n: number) => `USD ${fmtNum(n, 2)}`;
  const pct = (n: number | null) => (n === null ? '—' : `${fmtNum(n * 100, 1)} %`);
  const nameOf = (r: PerfRow) => level === 'product' ? `${lookup.product(r.productId!)?.brand ?? r.productId} · ${lookup.product(r.productId!)?.pack ?? ''}`
    : level === 'warehouse' ? lookup.warehouse(r.warehouseId!)?.name ?? r.key : level === 'company' ? companyLabel(r.entityId) : level === 'receiving' ? lookup.company(r.receivingCompanyId!)?.name ?? r.key : 'Whole business';
  const rows = $derived(rep?.rows ?? []);
  const maxRev = $derived(Math.max(1, ...rows.map((r) => r.revenue)));
  const maxProfit = $derived(Math.max(1, ...rows.map((r) => Math.abs(r.profit))));
  const marginStatus = (m: number | null) => (m === null ? 'none' : m >= target / 100 ? 'good' : m >= 0 ? 'warn' : 'bad');
  const periodLabel = $derived(range.label);
  const filterText = $derived(`Level: ${LEVELS.find(([k]) => k === level)?.[1]}${warehouseId ? ` · ${lookup.warehouse(warehouseId)?.name}` : ''} · target margin ${target} %`);

  const tableRows = () => [
    ['Name', 'Qty received', 'Goods cost', 'Truck cost', 'Warehouse expenses', 'Total landed cost', 'Landed per case', 'Selling price', 'Qty sold', 'Revenue', 'Cost of units sold', 'Profit', 'Margin %', 'Stock on hand', `Price for ${target} %`],
    ...rows.map((r) => [nameOf(r), r.qtyReceived, r.goodsCost, r.truckCost, r.warehouseCost, r.landedCost, r.landedPerUnit ?? '', r.sellingPrice ?? '', r.qtySold, r.revenue, r.cogs, r.profit, r.margin === null ? '' : Math.round(r.margin * 1000) / 10, r.stockOnHand, r.priceForTarget ?? '']),
  ];
  const steps = $derived(rep?.waterfall ?? []);
  // landed cost per case composition (product level): top 10 by cases received
  const comp = $derived.by(() => {
    const xs = [...rows].filter((r) => r.qtyReceived > 0).sort((a, b) => b.qtyReceived - a.qtyReceived).slice(0, 10);
    return { cats: xs.map(nameOf), parts: [{ name: 'Goods', values: xs.map((r) => r.goodsCost / r.qtyReceived) }, { name: 'Truck', values: xs.map((r) => r.truckCost / r.qtyReceived) }, { name: 'Warehouse', values: xs.map((r) => r.warehouseCost / r.qtyReceived) }] };
  });

  // target-margin helper (§6.4): price needed = landed cost per case ÷ (1 − target margin)
  let pick = $state('');
  $effect(() => { if (rows.length && !rows.some((r) => r.key === pick)) pick = (rows.find((r) => r.landedPerUnit !== null) ?? rows[0]).key; });
  const helper = $derived(rows.find((r) => r.key === pick) ?? rows.find((r) => r.landedPerUnit !== null) ?? null);
  const unitOf = (r: PerfRow) => r.landedPerUnit ?? (r.qtySold ? r.cogs / r.qtySold : null);
  const needed = $derived(helper && unitOf(helper) !== null ? priceForMargin(unitOf(helper)!, target / 100) : null);
  const trucks = $derived(rep?.byTruck ?? []);
  const truckRows = () => [['Shipment', 'Truck', 'Warehouse', 'Company', 'Received', 'Good cases', 'Goods', 'Truck', 'Warehouse', 'Total', 'Per case'], ...trucks.map((t) => [t.ref, lookup.truck(t.truckId)?.reg ?? '', lookup.warehouse(t.warehouseId)?.name ?? '', companyLabel(t.entityId), t.at.slice(0, 10), t.good, t.goods, t.truck, t.warehouse, t.total, t.perUnit ?? ''])];
  const whs = ref().warehouses;
  const fsRows = () => [['Product', 'Speed (cases/day)', 'Days of stock', 'Held'], ...(rep?.fast ?? []).map((x) => [`Fast: ${lookup.product(x.productId)?.brand}`, x.perDay, x.cover ?? '', x.held]), ...(rep?.slow ?? []).map((x) => [`Slow: ${lookup.product(x.productId)?.brand}`, x.perDay, x.cover ?? 'no sales', x.held])];
</script>

<div class="page-head">
  <div><div class="overline crumb">Finance · directors</div><h1>Performance and margins</h1>
    <p class="muted small">What it costs to put each product in the warehouse (goods + truck + a share of the warehouse expenses), what it sells for, and the profit — by product, warehouse, company or the whole business.</p></div>
  <a class="btn btn-secondary" href="#/selling-prices">Selling prices</a>
</div>

<div class="filters">
  <label class="field"><span>Period</span><select class="select" bind:value={period}>{#each PERIODS as [k, l]}<option value={k}>{l}</option>{/each}</select></label>
  <label class="field"><span>Level</span><select class="select" bind:value={level}>{#each LEVELS as [k, l]}<option value={k}>{l}</option>{/each}</select></label>
  <label class="field"><span>Warehouse</span><select class="select" bind:value={warehouseId}><option value="">All warehouses</option>{#each whs as x (x.id)}<option value={x.id}>{x.name}</option>{/each}</select></label>
  <label class="field" style="min-width:120px"><span>Target margin %</span><input class="input num" type="number" min="0" max="90" step="1" bind:value={target} /></label>
</div>

{#if rep}
  <div class="grid-kpi kpis">
    <div class="card kpi"><div class="overline">Revenue</div><div class="display">{usd(rep.totals.revenue)}</div><div class="caption">{fmtNum(rep.totals.qtySold)} cases sold</div></div>
    <div class="card kpi"><div class="overline">Cost of units sold</div><div class="display">{usd(rep.totals.cogs)}</div><div class="caption">landed cost of what was sold</div></div>
    <div class="card kpi"><div class="overline">Profit</div><div class="display">{usd(rep.netProfit)}</div><div class="caption">after {usd(rep.otherCosts)} other costs</div></div>
    <div class="card kpi"><div class="overline">Margin</div><div class="display">{pct(rep.totals.margin)}</div><div class="caption"><StatusBadge status={marginStatus(rep.totals.margin)} label={rep.totals.margin !== null && rep.totals.margin >= target / 100 ? `At or above ${target} %` : `Below ${target} %`} /></div></div>
  </div>
{/if}

<DashboardGrid cols={2}>
  <DashboardPanel title="Profit bridge" subtitle="revenue → goods → truck → warehouse → other → profit" unit="USD" period={periodLabel} updatedAt={rep?.generatedAt} {filterText}
    definition="Revenue of the period less the landed cost of the units sold, split into goods, truck and warehouse parts; Other = warehouse expenses of months with no goods received (not in any landed cost)."
    loading={!rep && !w.error} error={w.error} onretry={w.retry} rows={() => [['Step', 'USD'], ...steps.map((s) => [s.label, s.value])]} filename="profit-bridge">
    <Waterfall label="Profit bridge, USD" steps={steps} format={usd} />
  </DashboardPanel>
  <DashboardPanel title="Landed cost per case" subtitle="goods + truck + warehouse share · top 10 by cases received" unit="USD per case" period={periodLabel} updatedAt={rep?.generatedAt} {filterText}
    definition={rep?.method ?? ''} loading={!rep && !w.error} error={w.error} onretry={w.retry} filename="landed-cost-per-case"
    rows={() => [['Name', 'Goods', 'Truck', 'Warehouse'], ...comp.cats.map((c, i) => [c, ...comp.parts.map((p) => Math.round(p.values[i] * 100) / 100)])]}>
    <StackedBarH label="Landed cost per case, USD" categories={comp.cats} parts={comp.parts} format={usd2} />
  </DashboardPanel>

  <DashboardPanel span="full" title="Combined performance" subtitle="{LEVELS.find(([k]) => k === level)?.[1]} · in-cell bars: revenue and profit" unit="USD · cases" period={periodLabel} updatedAt={rep?.generatedAt} {filterText}
    definition={rep?.method ?? ''} loading={!rep && !w.error} error={w.error} onretry={w.retry} rows={tableRows} filename="combined-performance">
    <div class="table-wrap">
      <table class="table perf">
        <thead><tr><th>{LEVELS.find(([k]) => k === level)?.[1]}</th><th class="num">Received</th><th class="num">Goods</th><th class="num">Truck</th><th class="num">Warehouse</th><th class="num">Landed</th><th class="num">Per case</th><th class="num">Selling price</th><th class="num">Sold</th><th>Revenue</th><th class="num">Cost of sold</th><th>Profit</th><th class="num">Margin</th><th class="num">On hand</th><th class="num">Price for {target} %</th></tr></thead>
        <tbody>
          {#each rows as r (r.key)}
            <tr class:picked={helper?.key === r.key} onclick={() => (pick = r.key)}>
              <td><strong>{nameOf(r)}</strong>{#if r.estimated}<div class="caption">cost estimated (no receipts yet)</div>{/if}</td>
              <td class="num">{fmtNum(r.qtyReceived)}</td><td class="num">{fmtNum(r.goodsCost)}</td><td class="num">{fmtNum(r.truckCost)}</td><td class="num">{fmtNum(r.warehouseCost)}</td>
              <td class="num">{fmtNum(r.landedCost)}</td><td class="num">{r.landedPerUnit === null ? '—' : fmtNum(r.landedPerUnit, 2)}</td><td class="num">{r.sellingPrice === null ? '—' : fmtNum(r.sellingPrice, 2)}</td>
              <td class="num">{fmtNum(r.qtySold)}</td>
              <td class="bar"><span class="fill rev" style="width:{(r.revenue / maxRev) * 100}%"></span><span class="v">{fmtNum(r.revenue)}</span></td>
              <td class="num">{fmtNum(r.cogs)}</td>
              <td class="bar"><span class="fill" class:neg={r.profit < 0} style="width:{(Math.abs(r.profit) / maxProfit) * 100}%"></span><span class="v">{r.profit < 0 ? '−' : ''}{fmtNum(Math.abs(r.profit))}</span></td>
              <td class="num"><StatusBadge status={marginStatus(r.margin)} label={pct(r.margin)} size={12} /></td>
              <td class="num">{fmtNum(r.stockOnHand)}</td><td class="num">{r.priceForTarget === null ? '—' : fmtNum(r.priceForTarget, 2)}</td>
            </tr>
          {/each}
        </tbody>
        {#if rep && rows.length > 1}
          <tfoot><tr><th>Total</th><th class="num">{fmtNum(rep.totals.qtyReceived)}</th><th class="num">{fmtNum(rep.totals.goodsCost)}</th><th class="num">{fmtNum(rep.totals.truckCost)}</th><th class="num">{fmtNum(rep.totals.warehouseCost)}</th><th class="num">{fmtNum(rep.totals.landedCost)}</th><th class="num">{rep.totals.landedPerUnit === null ? '—' : fmtNum(rep.totals.landedPerUnit, 2)}</th><th></th><th class="num">{fmtNum(rep.totals.qtySold)}</th><th class="num">{fmtNum(rep.totals.revenue)}</th><th class="num">{fmtNum(rep.totals.cogs)}</th><th class="num">{fmtNum(rep.totals.profit)}</th><th class="num">{pct(rep.totals.margin)}</th><th class="num">{fmtNum(rep.totals.stockOnHand)}</th><th></th></tr></tfoot>
        {/if}
      </table>
    </div>
    <p class="caption">Goods moved between our own warehouses (Gisenyi → Goma, re-exports to Juba) count once in company and business totals; their extra truck and warehouse costs stay. Click a row for the target-margin helper.</p>
  </DashboardPanel>

  <DashboardPanel title="Target-margin helper" subtitle="price needed = landed cost per case ÷ (1 − target margin)" unit="USD per case" period={periodLabel}
    definition="Uses the landed cost per case of the row picked in the table (this period's receipts; else the cost of what was sold)." empty={!helper} emptyText="Pick a row in the table">
    {#if helper}
      {@const unit = unitOf(helper)}
      <div class="helper">
        <label class="field"><span>Row</span><select class="select" bind:value={pick}>{#each rows as r (r.key)}<option value={r.key}>{nameOf(r)}</option>{/each}</select></label>
        <label class="field"><span>Target margin %</span><input class="input num" type="number" min="0" max="90" bind:value={target} /></label>
        <dl>
          <dt>Landed cost per case</dt><dd>{unit === null ? '—' : usd2(unit)}</dd>
          <dt>Selling price now</dt><dd>{helper.sellingPrice === null ? (helper.avgSalePrice === null ? '—' : `${usd2(helper.avgSalePrice)} (average sold)`) : usd2(helper.sellingPrice)}</dd>
          <dt>Margin at that price</dt><dd>{helper.marginAtPrice === null ? pct(helper.margin) : pct(helper.marginAtPrice)}</dd>
          <dt class="strong">Price for {target} %</dt><dd class="strong">{needed === null ? '—' : usd2(needed)}</dd>
        </dl>
        {#if level === 'product' || level === 'warehouse'}<a class="btn btn-primary btn-sm" href="#/selling-prices{helper.productId ? `?product=${helper.productId}` : ''}">Set a selling price</a>{/if}
      </div>
    {/if}
  </DashboardPanel>

  <DashboardPanel title="Fast and slow products" subtitle="cases sold per day · days of stock" unit="cases" period={periodLabel} updatedAt={rep?.generatedAt}
    definition="Speed = cases sold per day in the period. Days of stock = stock on hand ÷ speed (no sales = slowest)." loading={!rep && !w.error} rows={fsRows} filename="fast-slow">
    <div class="fs">
      <div><h3 class="small">Fastest</h3><ol>{#each rep?.fast ?? [] as x (x.productId)}<li><span class="grow">{lookup.product(x.productId)?.brand}</span><span class="num">{fmtNum(x.perDay, 1)}/day</span><StatusBadge status="good" label={x.cover === null ? '—' : `${x.cover} d`} size={12} /></li>{/each}</ol></div>
      <div><h3 class="small">Slowest</h3><ol>{#each rep?.slow ?? [] as x (x.productId)}<li><span class="grow">{lookup.product(x.productId)?.brand}</span><span class="num">{fmtNum(x.held)} held</span><StatusBadge status={x.cover === null || x.cover > 60 ? 'bad' : 'warn'} label={x.cover === null ? 'no sales' : `${x.cover} d`} size={12} /></li>{/each}</ol></div>
    </div>
  </DashboardPanel>

  <DashboardPanel span="full" title="Landed cost per truck" subtitle="received in the period, newest first" unit="USD" period={periodLabel} updatedAt={rep?.generatedAt}
    definition="Each shipment's goods cost, its truck costs (all legs) and the warehouse share at the warehouse that received it, ÷ good cases received." loading={!rep && !w.error} rows={truckRows} filename="landed-cost-per-truck">
    <div class="table-wrap" style="max-height:420px">
      <table class="table">
        <thead><tr><th>Shipment</th><th>Truck</th><th>Warehouse</th><th>Company</th><th>Received</th><th class="num">Good cases</th><th class="num">Goods</th><th class="num">Truck</th><th class="num">Warehouse</th><th class="num">Total</th><th class="num">Per case</th></tr></thead>
        <tbody>{#each trucks.slice(0, 150) as t (t.shipmentId)}<tr><td><a href="#/shipments/{t.shipmentId}">{t.ref}</a>{#if t.reexport}<div class="caption">re-export</div>{:else if t.transfer}<div class="caption">transfer</div>{/if}</td><td>{lookup.truck(t.truckId)?.reg ?? '—'}</td><td>{lookup.warehouse(t.warehouseId)?.name}</td><td>{companyLabel(t.entityId)}</td><td class="small">{t.at.slice(0, 10)}</td><td class="num">{fmtNum(t.good)}</td><td class="num">{fmtNum(t.goods)}</td><td class="num">{fmtNum(t.truck)}</td><td class="num">{fmtNum(t.warehouse)}</td><td class="num">{fmtNum(t.total)}</td><td class="num">{t.perUnit === null ? '—' : fmtNum(t.perUnit, 2)}</td></tr>{/each}</tbody>
      </table>
    </div>
  </DashboardPanel>
</DashboardGrid>

<style>
  .kpis { margin-bottom: var(--space-4); display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--space-3); }
  .perf td:first-child { min-width: 200px; }
  .perf tbody tr { cursor: pointer; }
  .perf tr.picked td { background: var(--surface-sunken); }
  .bar { position: relative; min-width: 120px; }
  .bar .fill { position: absolute; left: 4px; top: 25%; height: 50%; border-radius: 3px; background: var(--viz-1, var(--primary)); opacity: 0.28; max-width: calc(100% - 8px); }
  .bar .fill.rev { background: var(--viz-2, var(--accent)); }
  .bar .fill.neg { background: var(--danger); }
  .bar .v { position: relative; display: block; text-align: right; font-variant-numeric: tabular-nums; }
  .helper { display: grid; gap: var(--space-3); }
  dl { display: grid; grid-template-columns: 1fr auto; gap: 6px var(--space-4); margin: 0; }
  dd { margin: 0; text-align: right; font-variant-numeric: tabular-nums; }
  .strong { font-weight: 700; font-size: 1.1em; }
  .fs { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4); }
  .fs ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .fs li { display: flex; align-items: center; gap: var(--space-2); }
  @media (max-width: 640px) { .fs { grid-template-columns: 1fr; } }
</style>
