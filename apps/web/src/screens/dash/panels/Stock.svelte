<script lang="ts">
  // Deliveries and Warehouse (Asie, Yonas, directors) — docs/15: incoming deliveries, received / damaged / short per delivery,
  // delivery losses Pareto ★5, stock on hand ★6 (cover bands + bars against minimum), stock in transit (timeline of
  // expected arrivals), warehouse expenses (monthly columns + category share), re-export orders. Quantities only for receivers.
  import type { DashKey, DashResult } from '@btw/api';
  import { DashboardPanel, StackedBarH, Pareto, paretoRows, StockCoverBars, StockCoverBands, StatusBadge, bandCounts, DEFAULT_BANDS, coverStatus, type CoverBand } from '../../../components/dashboard';
  import { BarChart, Donut } from '../../../components/charts';
  import { frame, money, cvRow, n0, day, dayTime, monthLabel, currency } from '../fmt.svelte';
  import Camera from '@lucide/svelte/icons/camera';
  import PenLine from '@lucide/svelte/icons/pen-line';
  let { key, r, link, span }: { key: DashKey; r: DashResult; link?: string; span?: 1 | 2 | 'full' } = $props();
  const d = $derived(r.data as any);
  const fr = $derived(frame(r));
  const drill = $derived(link ? { label: 'Open the full screen', href: link } : undefined);
  const go = (h: string) => (location.hash = h.replace(/^#/, ''));
  const C = $derived(currency.code);

  // stock on hand
  let band = $state<CoverBand | null>(null);
  const inBand = (days: number | null, b: CoverBand | null) => { if (!b || days == null) return !b; const i = DEFAULT_BANDS.indexOf(b); const lo = i ? (DEFAULT_BANDS[i - 1].max ?? 0) + 1 : -Infinity; return days >= lo && (b.max == null || days <= b.max); };
  const coverItems = $derived(key === 'stock-on-hand' ? (d.items ?? []).filter((x: any) => inBand(x.cover, band)).slice(0, 15).map((x: any) => ({ label: x.label, days: x.cover, min: x.min, max: x.max })) : []);
  // transit timeline: by day of expected arrival
  const days = $derived(key === 'stock-in-transit' ? [...new Set((d.rows ?? []).map((x: any) => (x.eta ?? '').slice(0, 10)))].map((k) => ({ day: k as string, rows: d.rows.filter((x: any) => (x.eta ?? '').slice(0, 10) === k) })) : []);
  // categories by total (largest first) so the columns and the donut give each category the same colour
  const ranked = $derived(key === 'warehouse-expenses' ? [...(d.byCategory ?? [])].sort((a: any, b: any) => b.total - a.total).map((x: any) => x.category as string) : []);
  const rxTone = (s: string) => (s === 'Delivered' ? 'good' : s === 'Cancelled' ? 'none' : s === 'Open' ? 'none' : 'warn');
</script>

{#if key === 'warehouse-today'}
  <DashboardPanel span={span ?? 'full'} title="What needs my warehouse today?" subtitle="to sign · arriving this week · stock at risk · losses" decision={d.sign?.count ? 'Count and sign every arrived truck before the next count.' : d.stock?.risk ? 'Count the at-risk lines and tell purchasing to reorder.' : 'Prepare space for this week’s arrivals; record any damage with a cause.'} {...fr} rows={() => [['Kind', 'What', 'Detail'], ...(d.sign?.rows ?? []).map((x: any) => ['To sign', x.truck, `${x.ref} · ${x.warehouse} · ${x.cases} cases`]), ...(d.arriving?.rows ?? []).map((x: any) => ['Arriving', x.truck, `${x.ref} · ${x.warehouse} · ${x.eta}`]), ...(d.stock?.items ?? []).map((x: any) => ['Stock', x.label, x.cover == null ? `${x.held} cases · no sales` : `${x.held} cases · ${x.cover} d cover`])]} filename="warehouse-today" {drill} emptyText="Nothing waiting at the warehouse">
    <div class="tw">
      <a href="#/shipments"><span class="caption">To sign</span><b class:hot={d.sign?.count}>{n0(d.sign?.count)}</b><span class="caption">{n0(d.sign?.cases)} cases</span></a>
      <a href="#/shipments"><span class="caption">Arriving (7 d)</span><b>{n0(d.arriving?.trucks)}</b><span class="caption">{n0(d.arriving?.cases)} cases</span></a>
      <a href="#/stock?show=attention"><span class="caption">At risk / low</span><b class:hot={d.stock?.risk}>{n0((d.stock?.risk ?? 0) + (d.stock?.low ?? 0))}</b><span class="caption">{n0(d.stock?.over)} over · {n0(d.stock?.nosales)} no sales</span></a>
      <a href="#/shipments?show=delivered"><span class="caption">Lost (30 d)</span><b class:hot={(d.losses?.damaged ?? 0) + (d.losses?.short ?? 0)}>{n0((d.losses?.damaged ?? 0) + (d.losses?.short ?? 0))}</b><span class="caption">{n0(d.losses?.damaged)} damaged · {n0(d.losses?.short)} short</span></a>
      {#if d.reexports}<a href="#/re-exports"><span class="caption">Re-exports</span><b class:hot={d.reexports.open}>{n0(d.reexports.open)}</b><span class="caption">{n0(d.reexports.noOwner)} without an owner</span></a>{/if}
    </div>
    {#if d.sign?.rows?.length}
      <h4 class="overline">Sign now</h4>
      <ul class="att">{#each d.sign.rows as x}<li><a href="#/shipments/{x.shipmentId}">{x.truck}</a><span class="caption">{x.ref} · {x.warehouse} · {n0(x.cases)} cases</span><StatusBadge status="warn" label="Acknowledge" /></li>{/each}</ul>
    {/if}
    {#if d.arriving?.rows?.length}
      <h4 class="overline">Arriving this week</h4>
      <ul class="att">{#each d.arriving.rows as x}<li><a href="#/shipments/{x.shipmentId}">{x.truck}</a><span class="caption">{x.warehouse} · {day(x.eta)} · {n0(x.cases)} cases</span>{#if x.late}<StatusBadge status="bad" label="late" />{/if}</li>{/each}</ul>
    {/if}
    {#if d.stock?.items?.length}
      <h4 class="overline">Stock that needs a count</h4>
      <ul class="att">{#each d.stock.items as x}<li><a href="#/stock?show=attention">{x.label}</a><span class="caption">{n0(x.held)} cases · {x.cover == null ? 'no sales in 30 days' : `${x.cover} d cover`}</span><StatusBadge status={x.cover == null ? 'none' : x.cover <= 7 ? 'bad' : 'warn'} label={x.cover == null ? 'No sales' : x.cover <= 7 ? 'At risk' : 'Low'} /></li>{/each}</ul>
    {/if}
    {#if d.losses?.topCause}<p class="caption">Top cause of losses (30 days): {d.losses.topCause}.</p>{/if}
    {#if d.reexports?.rows?.length}
      <h4 class="overline">Open re-exports</h4>
      <ul class="att">{#each d.reexports.rows as x}<li><a href="#/re-exports">{x.ref}</a><span class="caption">{n0(x.cases)} cases{x.owner ? ` · ${x.owner}` : ''}</span><StatusBadge status={x.owner ? 'warn' : 'none'} label={x.owner ? x.status : 'Owner not assigned'} /></li>{/each}</ul>
    {/if}
  </DashboardPanel>
{:else if key === 'incoming'}
  <DashboardPanel span={span ?? 1} title="Which trucks wait for my signature?" subtitle="arrived trucks first, then by expected arrival" decision="Sign arrived trucks before the next count." {...fr} rows={() => [['Shipment', 'Truck', 'From', 'To', 'Expected', 'Status', 'Cases'], ...(d.rows ?? []).map((x: any) => [x.ref, x.truck, x.from, x.warehouse, x.eta, x.toAcknowledge ? 'Arrived — acknowledge' : x.status, x.cases])]} filename="incoming-deliveries" {drill} emptyText="No truck heading to your warehouse">
    <ul class="cards">
      {#each d.rows ?? [] as x}
        <li><a class="lcard" href="#/shipments/{x.shipmentId}">
          <div class="row between"><b>{x.truck}</b>{#if x.toAcknowledge}<StatusBadge status="warn" label="Acknowledge" />{:else if x.late}<StatusBadge status="bad" label="{x.late} h late" />{:else}<StatusBadge status="good" label="On time" />{/if}</div>
          <div class="caption">{x.ref} · {x.from} → {x.warehouse}</div>
          <div class="small">Expected {dayTime(x.eta)} · {n0(x.cases)} cases</div></a></li>
      {/each}
    </ul>
  </DashboardPanel>
{:else if key === 'received-damaged-short'}
  <DashboardPanel span={span ?? 1} title="What arrived damaged or short?" subtitle="per delivery · photos and signature" decision="Open any delivery with damage or shortage and record the cause." {...fr} rows={() => [['Shipment', 'Warehouse', 'Acknowledged', 'Expected', 'Received good', 'Damaged', 'Short', 'Photos', 'Signed', 'Reasons'], ...(d.rows ?? []).map((x: any) => [x.ref, x.warehouse, x.at, x.expected, x.good, x.damaged, x.short, x.photos, x.signed ? 'Yes' : 'No', x.reasons.join('; ')])]} filename="received-damaged-short" {drill}>
    <StackedBarH label="Cases received good, damaged and short per delivery" categories={(d.rows ?? []).map((x: any) => x.ref)} parts={[{ name: 'Received good', values: (d.rows ?? []).map((x: any) => x.good), slot: 0 }, { name: 'Damaged', values: (d.rows ?? []).map((x: any) => x.damaged), slot: 3 }, { name: 'Short', values: (d.rows ?? []).map((x: any) => x.short), slot: 1 }]} format={(n) => n0(n)} shareLabels={false} onselect={(c) => { const x = d.rows.find((y: any) => y.ref === c); if (x) go(`#/shipments/${x.shipmentId}`); }} />
    <ul class="att">{#each [...(d.rows ?? [])].reverse().slice(0, 6) as x}<li><a href="#/shipments/{x.shipmentId}">{x.ref}</a><span class="caption">{day(x.at)} · {x.warehouse}</span>
      <span class="icons"><span title="Photos"><Camera size={14} aria-hidden="true" /> {x.photos}</span><span title="Signature"><PenLine size={14} aria-hidden="true" /> {x.signed ? 'signed' : 'no signature'}</span>{#if x.damaged + x.short > 0}<StatusBadge status="bad" label="{x.damaged + x.short} lost" />{/if}</span></li>{/each}</ul>
    <p class="caption">Period: {n0(d.totals?.deliveries)} deliveries · {n0(d.totals?.damaged)} damaged · {n0(d.totals?.short)} short of {n0(d.totals?.expected)} cases.</p>
  </DashboardPanel>
{:else if key === 'delivery-losses'}
  <DashboardPanel span={span ?? 1} title="Which causes drive delivery losses?" subtitle="cases short or damaged, ranked" decision="Fix the vital few causes first." {...fr} rows={() => [['Cause', 'Cases lost', 'Share', 'Cumulative', 'Vital few'], ...paretoRows(d.items ?? []).map((x) => [x.label, x.value, `${(x.share * 100).toFixed(1)}%`, `${(x.cum * 100).toFixed(1)}%`, x.vital ? 'Yes' : 'No'])]} filename="delivery-losses-pareto" {drill}>
    <Pareto label="Delivery losses by cause with cumulative share" items={d.items ?? []} valueLabel="Cases lost" format={(n) => n0(n)} />
  </DashboardPanel>
{:else if key === 'stock-on-hand'}
  <DashboardPanel span={span ?? 1} title="Which stock needs a reorder or a count?" subtitle="products by days of stock · click a band to list them" decision="Reorder at-risk products; count the no-sales lines." {...fr} rows={() => { const c = bandCounts((d.items ?? []).map((x: any) => x.cover)); return [['Days of cover', 'Products'], ...DEFAULT_BANDS.map((b, i) => [b.label, c.counts[i]]), ['No sales (no cover figure)', c.missing]]; }} filename="stock-cover-bands" filterText={band ? `Band ${band.label}` : ''} {drill}>
    <StockCoverBands days={(d.items ?? []).map((x: any) => x.cover)} selected={band?.label ?? null} onselect={(b) => (band = b)} />
  </DashboardPanel>
  <DashboardPanel span={span ?? 1} title="How does each product sit against the minimum?" subtitle={band ? `band ${band.label}` : 'lowest cover first'} decision="Count or write off the lines furthest below minimum." {...fr} rows={() => [['Product', 'Held (cases)', 'Moved out', 'Damaged', 'Short', 'Sold 30 days', 'Days of cover', 'Minimum', 'Slow above', 'State'], ...(d.items ?? []).map((x: any) => [x.label, x.held, x.movedOut, x.damaged, x.short, x.sold30, x.cover ?? 'No data yet', x.min, x.max, coverStatus({ label: x.label, days: x.cover, min: x.min, max: x.max }).label])]} filename="stock-on-hand" empty={!coverItems.length}>
    <StockCoverBars label="Days of stock cover against minimum by product" items={coverItems} onselect={() => go('#/stock?show=attention')} />
    <BarChart label="Cases held, moved out and damaged by product (30 days)" horizontal stacked categories={(d.items ?? []).slice(0, 10).map((x: any) => x.label)} series={[{ name: 'Held', values: (d.items ?? []).slice(0, 10).map((x: any) => Math.max(0, x.held)) }, { name: 'Moved out / sent on', values: (d.items ?? []).slice(0, 10).map((x: any) => x.movedOut), slot: 2 }, { name: 'Damaged', values: (d.items ?? []).slice(0, 10).map((x: any) => x.damaged), slot: 3 }]} format={(n) => n0(n)} />
  </DashboardPanel>
{:else if key === 'stock-in-transit'}
  <DashboardPanel span={span ?? 1} title="What is on the road, and when does it arrive?" subtitle="expected arrivals · totals per warehouse" decision="Prepare the warehouse for the next arrivals." {...fr} rows={() => [['Shipment', 'Truck', 'Warehouse', 'Expected', 'Cases', 'Status'], ...(d.rows ?? []).map((x: any) => [x.ref, x.truck, x.warehouse, x.eta, x.cases, x.status])]} filename="stock-in-transit" {drill}>
    <div class="tw">{#each d.byWarehouse ?? [] as w}<div><span class="caption">{w.warehouse}</span><b>{n0(w.cases)}</b><span class="caption">cases · {w.trucks} truck{w.trucks === 1 ? '' : 's'}</span></div>{/each}</div>
    <ol class="tl">
      {#each days as g}
        <li><span class="dot" aria-hidden="true"></span><b class="small">{day(g.day)}</b>
          {#each g.rows as x}<a class="small tr" href="#/shipments/{x.shipmentId}">{x.truck} → {x.warehouse} · {n0(x.cases)} cases {#if x.late}<StatusBadge status="bad" label="late" />{/if}</a>{/each}</li>
      {/each}
    </ol>
  </DashboardPanel>
{:else if key === 'warehouse-expenses'}
  <DashboardPanel span={span ?? 1} title="What do the warehouses spend?" subtitle="by month and category" decision="Record this month’s rent, salary and utilities if they are missing." {...fr} rows={() => [['Month', ...(d.categories ?? []).map((c: string) => `${c} (${C})`), `Total (${C})`], ...(d.byMonth ?? []).map((m: any) => [m.month, ...d.categories.map((c: string) => cvRow(m.byCategory[c])), cvRow(m.total)])]} filename="warehouse-expenses" {drill}>
    <BarChart label="Warehouse expenses by month and category" stacked categories={(d.byMonth ?? []).map((m: any) => monthLabel(m.month))} series={ranked.map((c: string, i: number) => ({ name: c, values: d.byMonth.map((m: any) => m.byCategory[c] ?? 0), slot: i }))} format={money} onselect={() => go('#/warehouse-expenses')} />
    <Donut label="Share of each expense category" data={(d.byCategory ?? []).map((x: any) => ({ label: x.category, value: x.total }))} format={money} center={money(d.total)} height={220} />
  </DashboardPanel>
{:else if key === 'stock-movements'}
  <DashboardPanel span={span ?? 'full'} title="What came in and went out?" subtitle="last 14 days of the period · running balance" decision="Investigate a day where out far exceeds in, or a line that is not moving." {...fr} rows={() => [['Day', 'In', 'Out', 'Closing'], ...(d.days ?? []).map((x: any) => [x.day, x.in, x.out, x.closing]), ['Kind', 'When', 'Product', 'Warehouse', 'Cases', 'Ref'], ...(d.log ?? []).map((x: any) => [x.kind, x.at, x.product, x.warehouse, x.qty, x.ref])]} filename="stock-movements" {drill} emptyText="No stock movement in this period">
    <div class="tw">
      <div><span class="caption">Opening</span><b>{n0(d.opening)}</b><span class="caption">cases</span></div>
      <div><span class="caption">In</span><b>{n0(d.in)}</b><span class="caption">received · transfer in</span></div>
      <div><span class="caption">Out</span><b class:hot={d.out > d.in}>{n0(d.out)}</b><span class="caption">sold · damaged · sent on</span></div>
      <div><span class="caption">Closing</span><b>{n0(d.closing)}</b><span class="caption">cases</span></div>
    </div>
    <BarChart label="Cases in and out by day" categories={(d.days ?? []).map((x: any) => day(x.day))} series={[{ name: 'In', values: (d.days ?? []).map((x: any) => x.in), slot: 0 }, { name: 'Out', values: (d.days ?? []).map((x: any) => x.out), slot: 1 }]} format={(n) => n0(n)} />
    <div class="table-wrap"><table class="table">
      <thead><tr><th>When</th><th>Kind</th><th>Product</th><th class="hide-sm">Warehouse</th><th class="num">Cases</th></tr></thead>
      <tbody>{#each d.log ?? [] as x}<tr><td class="small">{day(x.at)}</td><td>{x.kind}</td><td>{x.product}</td><td class="hide-sm caption">{x.warehouse}</td><td class="num">{x.dir === 'out' ? '−' : '+'}{n0(x.qty)}</td></tr>{:else}<tr><td colspan="5" class="caption">No moves in this window.</td></tr>{/each}</tbody>
    </table></div>
  </DashboardPanel>
{:else if key === 'reexports'}
  <DashboardPanel span={span ?? 1} title="Which re-exports are stuck?" subtitle="Rwanda → Juba" decision="Assign an owner and load every Open order." {...fr} rows={() => [['Order', 'Status', 'From', 'To', 'Cases', 'Truck', 'Loaded', 'Delivered', 'Follow-up'], ...(d.rows ?? []).map((x: any) => [x.ref, x.status, x.from, x.to, x.cases, x.truck ?? '', x.loadedAt ?? '', x.deliveredAt ?? '', x.owner ?? 'Owner not assigned'])]} filename="re-exports" {drill}>
    <ul class="att">{#each d.rows ?? [] as x}<li><a href="#/re-exports">{x.ref}</a><span class="caption">{x.from} → {x.to} · {n0(x.cases)} cases{x.truck ? ` · ${x.truck}` : ''}</span>
      <span class="icons"><StatusBadge status={rxTone(x.status)} label={x.status} />{#if !x.owner && x.status !== 'Delivered'}<StatusBadge status="warn" label="Owner not assigned" />{/if}</span></li>{/each}</ul>
  </DashboardPanel>
{/if}

<style>
  .cards { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-2); grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }
  .lcard { border: 1px solid var(--border); border-radius: var(--radius-md); padding: var(--space-3); display: flex; flex-direction: column; gap: 4px; color: var(--text); text-decoration: none; }
  .lcard:hover { border-color: var(--primary); }
  .att { list-style: none; margin: var(--space-2) 0 0; padding: 0; }
  .att li { display: flex; flex-wrap: wrap; align-items: center; gap: 4px var(--space-3); padding: 6px 0; border-top: 1px solid var(--border); }
  .icons { display: inline-flex; gap: var(--space-3); align-items: center; margin-left: auto; }
  .icons span { display: inline-flex; align-items: center; gap: 3px; }
  .tw { display: flex; flex-wrap: wrap; gap: var(--space-4); margin-bottom: var(--space-3); }
  .tw div, .tw a { display: flex; flex-direction: column; color: var(--text); text-decoration: none; min-width: 7rem; }
  .tw a:hover { color: var(--primary); }
  .tw b { font: 700 20px/1.1 var(--ff-display); }
  .tw b.hot { color: var(--danger); }
  .overline { margin: var(--space-4) 0 var(--space-1); }
  .tl { list-style: none; margin: 0; padding: 0 0 0 14px; border-left: 2px solid var(--border); }
  .tl li { position: relative; padding: 0 0 var(--space-3) var(--space-2); display: flex; flex-direction: column; gap: 2px; }
  .dot { position: absolute; left: -21px; top: 4px; width: 12px; height: 12px; border-radius: 50%; background: var(--viz-1); border: 2px solid var(--surface); }
  .tr { color: var(--text); }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  @media (max-width: 600px) { .hide-sm { display: none; } }
</style>
