<script lang="ts">
  // Purchasing (Kabonge, directors) and Loading (loaders, Testfie, Kabonge, directors) — docs/15: PO pipeline, ordered vs
  // loaded vs delivered, open orders, plan vs actual, today's loading list (no prices), loading status, dispatched today.
  import type { DashKey, DashResult } from '@btw/api';
  import { DashboardPanel, StageBars, GroupedBars, GapTable, StatusBadge, type Stage } from '../../../components/dashboard';
  import PlanUsedTile from '../../../components/PlanUsedTile.svelte';
  import { frame, money, cvRow, n0, pctF, day, dayTime, currency } from '../fmt.svelte';
  import FileText from '@lucide/svelte/icons/file-text';
  import Camera from '@lucide/svelte/icons/camera';
  let { key, r, link, span }: { key: DashKey; r?: DashResult; link?: string; span?: 1 | 2 | 'full' } = $props();
  const d = $derived((r?.data ?? {}) as any);
  const fr = $derived(frame(r));
  const drill = $derived(link ? { label: 'Open the list', href: link } : undefined);
  const hidden = $derived(!!r?.pricesHidden);

  // pipeline: click a stage → its orders listed beneath
  let stage = $state<string | null>(null);
  const stages = $derived((d.stages ?? []).map((s: any) => ({ label: s.label, count: s.count, value: hidden || s.value == null ? undefined : s.value })) as Stage[]);
  const items = $derived(stage ? (d.stages ?? []).find((s: any) => s.label === stage)?.items ?? [] : []);
  const stageRows = () => [['Stage', 'Orders', ...(hidden ? [] : [`Value (${currency.code})`])], ...(d.stages ?? []).map((s: any) => [s.label, s.count, ...(hidden ? [] : [cvRow(s.value)])])];
  // ordered / loaded / delivered
  const cats = $derived((d.rows ?? []).map((x: any) => x.ref));
  const series = $derived([{ name: 'Ordered', values: (d.rows ?? []).map((x: any) => x.ordered) }, { name: 'Loaded', values: (d.rows ?? []).map((x: any) => x.loaded) }, { name: 'Delivered', values: (d.rows ?? []).map((x: any) => x.delivered) }]);
  const oldRows = () => [['Order', 'Ordered (cases)', 'Loaded (cases)', 'Delivered (cases)'], ...(d.rows ?? []).map((x: any) => [x.ref, x.ordered, x.loaded ?? '', x.delivered ?? ''])];
  const openRow = (x: any) => (location.hash = `/pos/${x.id}`);
  const tone = (s: string) => (s === 'bad' ? 'Over 7 days' : s === 'warn' ? '3–7 days' : 'Under 3 days');
  // loading list
  const chip = (s: string) => (s === 'Loaded' ? 'good' : s === 'Ready to load' ? 'warn' : 'none');
  const groupsOf = (rows: any[]) => [...new Set(rows.map((x) => x.from))].map((f) => ({ from: f, rows: rows.filter((x) => x.from === f) }));
</script>

{#if key === 'po-pipeline'}
  <DashboardPanel span={span ?? 1} title="Purchase order pipeline" subtitle="orders at each stage · click a stage for its orders" {...fr} rows={stageRows} filename="po-pipeline" {drill} filterText={stage ? `Stage: ${stage}` : ''}>
    <StageBars label="Purchase orders by stage" {stages} formatValue={money} countLabel="orders" onselect={(s) => (stage = stage === s.label ? null : s.label)} />
    {#if stage}
      <div class="row between sel"><b class="small">{stage}: {items.length} order{items.length === 1 ? '' : 's'}</b><button class="btn btn-ghost btn-sm" onclick={() => (stage = null)}>Clear</button></div>
      <ul class="list">{#each items as x}<li><a href={x.href}><b>{x.ref}</b></a><span class="caption">{x.pair} · {day(x.date)}</span><span class="num small">{n0(x.cases)} cases{x.value != null ? ` · ${money(x.value)}` : ''}</span></li>{:else}<li class="caption">No orders at this stage.</li>{/each}</ul>
    {/if}
  </DashboardPanel>
{:else if key === 'ordered-loaded-delivered'}
  <DashboardPanel span={span ?? 1} title="Ordered vs loaded vs delivered" subtitle="per order, with the gap at each step" {...fr} rows={oldRows} filename="ordered-loaded-delivered" {drill}>
    <GroupedBars label="Cases ordered, loaded and delivered per order" categories={cats} {series} unit="cases" format={(n) => n0(n)} onselect={(c) => { const x = d.rows.find((y: any) => y.ref === c); if (x) openRow(x); }} />
    <GapTable categories={cats} {series} itemLabel="Order" unit="cases" onselect={(c) => { const x = d.rows.find((y: any) => y.ref === c); if (x) openRow(x); }} />
  </DashboardPanel>
{:else if key === 'open-orders'}
  <DashboardPanel span={span ?? 1} title="Open orders" subtitle="issued, not fully loaded · oldest first" {...fr} rows={() => [['Order', 'Pair', 'Days waiting', 'Trucks loaded', 'Cases'], ...(d.rows ?? []).map((x: any) => [x.ref, x.pair, x.days, `${x.trucksLoaded}/${x.trucks}`, x.cases])]} filename="open-orders" {drill}>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Order</th><th class="hide-sm">Pair</th><th>Waiting</th><th class="num">Trucks</th></tr></thead>
      <tbody>{#each d.rows ?? [] as x}<tr class="clickable" onclick={() => openRow(x)}><td><b>{x.ref}</b></td><td class="small hide-sm">{x.pair}</td>
        <td><div class="age"><span class="bar" style:width="{Math.min(100, x.days * 7)}%" class:bad={x.status === 'bad'} class:warn={x.status === 'warn'}></span></div><StatusBadge status={x.status} label="{x.days} d · {tone(x.status)}" /></td>
        <td class="num">{x.trucksLoaded}/{x.trucks}</td></tr>{/each}</tbody>
    </table></div>
  </DashboardPanel>
{:else if key === 'plan-vs-actual'}
  <PlanUsedTile />
{:else if key === 'loading-list'}
  <DashboardPanel span={span ?? 1} title="Today's loading list" subtitle="ready · waiting for a truck · loaded today — quantities only" {...fr} rows={() => [['Order', 'Loading point', 'Truck', 'Driver', 'Ordered (cases)', 'Loaded (cases)', 'Status'], ...(d.rows ?? []).map((x: any) => [x.poRef, x.loadingPoint, x.truck, x.driver, x.ordered, x.loaded ?? '', x.status])]} filename="loading-list" drill={{ label: 'Open the queues', href: '#/trucks?tab=queues' }} empty={!(d.rows ?? []).length && !(d.queue ?? []).length} emptyText="Nothing to load today">
    <ul class="cards">
      {#each d.rows ?? [] as x}
        <li class="lcard"><div class="row between"><b>{x.truck ?? 'No truck yet'}</b><StatusBadge status={chip(x.status)} label={x.status} /></div>
          <div class="caption">{x.poRef} · {x.loadingPoint}{x.driver ? ` · ${x.driver}` : ''}</div>
          <div class="small">{x.loaded == null ? `${n0(x.ordered)} cases ordered` : `${n0(x.loaded)} of ${n0(x.ordered)} cases · loaded ${dayTime(x.at)}`}</div></li>
      {/each}
    </ul>
    {#if d.queue?.length}<p class="caption">Waiting in the queue: {d.queue.map((q: any) => `#${q.position} ${q.truck}`).join(' · ')}</p>{/if}
  </DashboardPanel>
{:else if key === 'loading-status'}
  <DashboardPanel span={span ?? 1} title="Loading status" subtitle="loaded of ordered per order · documents and photos" {...fr} rows={() => [['Order', 'Pair', 'Ordered', 'Loaded', 'Trucks loaded', 'Documents', 'Photos', 'Stage'], ...(d.rows ?? []).map((x: any) => [x.ref, x.pair, x.ordered, x.loaded ?? '', `${x.trucksLoaded}/${x.trucks}`, x.docs, x.photos, x.stage])]} filename="loading-status" {drill}>
    <ul class="prog">
      {#each d.rows ?? [] as x}
        <li><a href="#/pos/{x.id}" class="row between"><b>{x.ref}</b><span class="caption">{x.pair}</span></a>
          <div class="meter" role="img" aria-label="{pctF(x.pct, 0)} loaded"><span style:width="{Math.min(100, (x.pct ?? 0) * 100)}%"></span></div>
          <div class="row between caption"><span>{x.loaded === null ? 'Not loaded yet' : `${n0(x.loaded)} of ${n0(x.ordered)} cases (${pctF(x.pct, 0)})`} · trucks {x.trucksLoaded}/{x.trucks}</span>
            <span class="icons"><span title="Documents"><FileText size={14} aria-hidden="true" /> {x.docs}</span><span title="Photos"><Camera size={14} aria-hidden="true" /> {x.photos}</span></span></div></li>
      {/each}
    </ul>
  </DashboardPanel>
{:else if key === 'dispatched-today'}
  <DashboardPanel span={span ?? 1} title="Dispatched today" subtitle="trucks that left in the last 24 hours" {...fr} rows={() => [['Shipment', 'Truck', 'From', 'To', 'Left at', 'Cases'], ...(d.rows ?? []).map((x: any) => [x.ref, x.truck, x.from, x.to, x.at, x.cases])]} filename="dispatched-today" drill={{ label: 'Open shipments', href: '#/shipments' }} emptyText="No truck left in the last 24 hours">
    <div class="tiles2"><div><b>{(d.rows ?? []).length}</b><span class="caption">trucks</span></div><div><b>{n0((d.rows ?? []).reduce((a: number, x: any) => a + x.cases, 0))}</b><span class="caption">cases</span></div></div>
    {#each groupsOf(d.rows ?? []) as g}
      <h4 class="overline">{g.from}</h4>
      <ul class="list">{#each g.rows as x}<li><a href="#/shipments/{x.id}"><b>{x.truck}</b></a><span class="caption">{x.ref} → {x.to}</span><span class="small">{dayTime(x.at)}</span></li>{/each}</ul>
    {/each}
  </DashboardPanel>
{/if}

<style>
  .sel { margin-top: var(--space-2); }
  .list { list-style: none; margin: var(--space-2) 0 0; padding: 0; }
  .list li { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px var(--space-3); padding: var(--space-2) 0; border-top: 1px solid var(--border); }
  .list li .caption { grid-column: 1; }
  .cards { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-2); grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }
  .lcard { border: 1px solid var(--border); border-radius: var(--radius-md); padding: var(--space-3); display: flex; flex-direction: column; gap: 4px; }
  .prog { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-3); }
  .prog a { color: var(--text); text-decoration: none; }
  .meter { height: 8px; background: var(--surface-sunken); border-radius: 4px; overflow: hidden; margin: 4px 0; }
  .meter span { display: block; height: 100%; background: var(--viz-1); }
  .icons { display: inline-flex; gap: var(--space-3); }
  .icons span { display: inline-flex; align-items: center; gap: 3px; }
  .age { height: 4px; background: var(--surface-sunken); border-radius: 2px; margin-bottom: 4px; max-width: 120px; }
  .age .bar { display: block; height: 100%; border-radius: 2px; background: var(--success); }
  .age .bar.warn { background: var(--warning-solid); }
  .age .bar.bad { background: var(--danger); }
  .tiles2 { display: flex; gap: var(--space-6); margin-bottom: var(--space-2); }
  .tiles2 div { display: flex; flex-direction: column; }
  .tiles2 b { font: 700 22px/1.1 var(--ff-display); }
  h4.overline { margin: var(--space-3) 0 0; }
  @media (max-width: 600px) { .hide-sm { display: none; } }
</style>
