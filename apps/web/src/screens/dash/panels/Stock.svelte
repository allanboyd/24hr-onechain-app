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

{#if key === 'incoming'}
  <DashboardPanel span={span ?? 1} title="Incoming deliveries" subtitle="arrived trucks to acknowledge first, then by expected arrival" {...fr} rows={() => [['Shipment', 'Truck', 'From', 'To', 'Expected', 'Status', 'Cases'], ...(d.rows ?? []).map((x: any) => [x.ref, x.truck, x.from, x.warehouse, x.eta, x.toAcknowledge ? 'Arrived — acknowledge' : x.status, x.cases])]} filename="incoming-deliveries" {drill} emptyText="No truck heading to your warehouse">
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
  <DashboardPanel span={span ?? 1} title="Received, damaged, short" subtitle="per delivery · photos and signature" {...fr} rows={() => [['Shipment', 'Warehouse', 'Acknowledged', 'Expected', 'Received good', 'Damaged', 'Short', 'Photos', 'Signed', 'Reasons'], ...(d.rows ?? []).map((x: any) => [x.ref, x.warehouse, x.at, x.expected, x.good, x.damaged, x.short, x.photos, x.signed ? 'Yes' : 'No', x.reasons.join('; ')])]} filename="received-damaged-short" {drill}>
    <StackedBarH label="Cases received good, damaged and short per delivery" categories={(d.rows ?? []).map((x: any) => x.ref)} parts={[{ name: 'Received good', values: (d.rows ?? []).map((x: any) => x.good), slot: 0 }, { name: 'Damaged', values: (d.rows ?? []).map((x: any) => x.damaged), slot: 3 }, { name: 'Short', values: (d.rows ?? []).map((x: any) => x.short), slot: 1 }]} format={(n) => n0(n)} shareLabels={false} onselect={(c) => { const x = d.rows.find((y: any) => y.ref === c); if (x) go(`#/shipments/${x.shipmentId}`); }} />
    <ul class="att">{#each [...(d.rows ?? [])].reverse().slice(0, 6) as x}<li><a href="#/shipments/{x.shipmentId}">{x.ref}</a><span class="caption">{day(x.at)} · {x.warehouse}</span>
      <span class="icons"><span title="Photos"><Camera size={14} aria-hidden="true" /> {x.photos}</span><span title="Signature"><PenLine size={14} aria-hidden="true" /> {x.signed ? 'signed' : 'no signature'}</span>{#if x.damaged + x.short > 0}<StatusBadge status="bad" label="{x.damaged + x.short} lost" />{/if}</span></li>{/each}</ul>
    <p class="caption">Period: {n0(d.totals?.deliveries)} deliveries · {n0(d.totals?.damaged)} damaged · {n0(d.totals?.short)} short of {n0(d.totals?.expected)} cases.</p>
  </DashboardPanel>
{:else if key === 'delivery-losses'}
  <DashboardPanel span={span ?? 1} title="Delivery losses by cause" subtitle="cases short or damaged, ranked" {...fr} rows={() => [['Cause', 'Cases lost', 'Share', 'Cumulative', 'Vital few'], ...paretoRows(d.items ?? []).map((x) => [x.label, x.value, `${(x.share * 100).toFixed(1)}%`, `${(x.cum * 100).toFixed(1)}%`, x.vital ? 'Yes' : 'No'])]} filename="delivery-losses-pareto" {drill}>
    <Pareto label="Delivery losses by cause with cumulative share" items={d.items ?? []} valueLabel="Cases lost" format={(n) => n0(n)} />
  </DashboardPanel>
{:else if key === 'stock-on-hand'}
  <DashboardPanel span={span ?? 1} title="Stock cover" subtitle="products by days of stock · click a band to list them" {...fr} rows={() => { const c = bandCounts((d.items ?? []).map((x: any) => x.cover)); return [['Days of cover', 'Products'], ...DEFAULT_BANDS.map((b, i) => [b.label, c.counts[i]]), ['No sales (no cover figure)', c.missing]]; }} filename="stock-cover-bands" filterText={band ? `Band ${band.label}` : ''} {drill}>
    <StockCoverBands days={(d.items ?? []).map((x: any) => x.cover)} selected={band?.label ?? null} onselect={(b) => (band = b)} />
  </DashboardPanel>
  <DashboardPanel span={span ?? 1} title="Stock on hand against minimum" subtitle={band ? `band ${band.label}` : 'lowest cover first'} {...fr} rows={() => [['Product', 'Held (cases)', 'Moved out', 'Damaged', 'Short', 'Sold 30 days', 'Days of cover', 'Minimum', 'Slow above', 'State'], ...(d.items ?? []).map((x: any) => [x.label, x.held, x.movedOut, x.damaged, x.short, x.sold30, x.cover ?? 'No data yet', x.min, x.max, coverStatus({ label: x.label, days: x.cover, min: x.min, max: x.max }).label])]} filename="stock-on-hand" empty={!coverItems.length}>
    <StockCoverBars label="Days of stock cover against minimum by product" items={coverItems} onselect={() => go('#/warehouse-stock')} />
    <BarChart label="Cases held, moved out and damaged by product (30 days)" horizontal stacked categories={(d.items ?? []).slice(0, 10).map((x: any) => x.label)} series={[{ name: 'Held', values: (d.items ?? []).slice(0, 10).map((x: any) => Math.max(0, x.held)) }, { name: 'Moved out / sent on', values: (d.items ?? []).slice(0, 10).map((x: any) => x.movedOut), slot: 2 }, { name: 'Damaged', values: (d.items ?? []).slice(0, 10).map((x: any) => x.damaged), slot: 3 }]} format={(n) => n0(n)} />
  </DashboardPanel>
{:else if key === 'stock-in-transit'}
  <DashboardPanel span={span ?? 1} title="Stock in transit" subtitle="expected arrivals · totals per warehouse" {...fr} rows={() => [['Shipment', 'Truck', 'Warehouse', 'Expected', 'Cases', 'Status'], ...(d.rows ?? []).map((x: any) => [x.ref, x.truck, x.warehouse, x.eta, x.cases, x.status])]} filename="stock-in-transit" {drill}>
    <div class="tw">{#each d.byWarehouse ?? [] as w}<div><span class="caption">{w.warehouse}</span><b>{n0(w.cases)}</b><span class="caption">cases · {w.trucks} truck{w.trucks === 1 ? '' : 's'}</span></div>{/each}</div>
    <ol class="tl">
      {#each days as g}
        <li><span class="dot" aria-hidden="true"></span><b class="small">{day(g.day)}</b>
          {#each g.rows as x}<a class="small tr" href="#/shipments/{x.shipmentId}">{x.truck} → {x.warehouse} · {n0(x.cases)} cases {#if x.late}<StatusBadge status="bad" label="late" />{/if}</a>{/each}</li>
      {/each}
    </ol>
  </DashboardPanel>
{:else if key === 'warehouse-expenses'}
  <DashboardPanel span={span ?? 1} title="Warehouse expenses" subtitle="by month and category" {...fr} rows={() => [['Month', ...(d.categories ?? []).map((c: string) => `${c} (${C})`), `Total (${C})`], ...(d.byMonth ?? []).map((m: any) => [m.month, ...d.categories.map((c: string) => cvRow(m.byCategory[c])), cvRow(m.total)])]} filename="warehouse-expenses" {drill}>
    <BarChart label="Warehouse expenses by month and category" stacked categories={(d.byMonth ?? []).map((m: any) => monthLabel(m.month))} series={ranked.map((c: string, i: number) => ({ name: c, values: d.byMonth.map((m: any) => m.byCategory[c] ?? 0), slot: i }))} format={money} onselect={() => go('#/warehouse-expenses')} />
    <Donut label="Share of each expense category" data={(d.byCategory ?? []).map((x: any) => ({ label: x.category, value: x.total }))} format={money} center={money(d.total)} height={220} />
  </DashboardPanel>
{:else if key === 'reexports'}
  <DashboardPanel span={span ?? 1} title="Re-export orders" subtitle="Rwanda → Juba" {...fr} rows={() => [['Order', 'Status', 'From', 'To', 'Cases', 'Truck', 'Loaded', 'Delivered', 'Follow-up'], ...(d.rows ?? []).map((x: any) => [x.ref, x.status, x.from, x.to, x.cases, x.truck ?? '', x.loadedAt ?? '', x.deliveredAt ?? '', x.owner ?? 'Owner not assigned'])]} filename="re-exports" {drill}>
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
  .tw div { display: flex; flex-direction: column; }
  .tw b { font: 700 20px/1.1 var(--ff-display); }
  .tl { list-style: none; margin: 0; padding: 0 0 0 14px; border-left: 2px solid var(--border); }
  .tl li { position: relative; padding: 0 0 var(--space-3) var(--space-2); display: flex; flex-direction: column; gap: 2px; }
  .dot { position: absolute; left: -21px; top: 4px; width: 12px; height: 12px; border-radius: 50%; background: var(--viz-1); border: 2px solid var(--surface); }
  .tr { color: var(--text); }
</style>
