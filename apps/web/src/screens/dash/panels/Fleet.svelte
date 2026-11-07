<script lang="ts">
  // Fleet (Testfie, directors) — docs/15: live fleet board (Kanban, stale cards faded), delayed trucks, truck issues,
  // driver status updates (timeline + last-update badges), border and stop analysis ★4 (route × stop heatmap).
  import type { DashKey, DashResult } from '@btw/api';
  import { DashboardPanel, KanbanBoard, StatusBadge, SEVERITY, STATUS, type KanbanCard } from '../../../components/dashboard';
  import { BarChart, Heatmap } from '../../../components/charts';
  import { frame, day, dayTime, n0 } from '../fmt.svelte';
  import { ago } from '../../../components/dashboard';
  let { key, r, link, span }: { key: DashKey; r: DashResult; link?: string; span?: 1 | 2 | 'full' } = $props();
  const d = $derived(r.data as any);
  const fr = $derived(frame(r));
  const drill = $derived(link ? { label: 'Open the full screen', href: link } : undefined);
  const go = (h: string) => (location.hash = h.replace(/^#/, ''));

  const cards = $derived(key === 'fleet-board' ? (d.cards ?? []).map((c: any): KanbanCard & { shipmentId?: string } => ({
    id: c.id, column: c.column, title: c.title, group: c.group, subtitle: c.subtitle + (c.reexport ? ' · re-export' : ''),
    meta: `${c.where}${c.eta ? ` · ETA ${day(c.eta)}` : ''}${c.lastUpdate ? ` · update ${ago(c.lastUpdate)}` : ''}`, status: c.status, statusLabel: c.statusLabel, stale: c.stale, shipmentId: c.shipmentId,
  })) : []);
  const boardRows = () => [['Truck', 'Status', 'Route', 'Driver · provider', 'Where', 'ETA', 'Last update', 'Stale'], ...(d.cards ?? []).map((c: any) => [c.title, c.statusLabel, c.group, c.subtitle, c.where, c.eta ?? '', c.lastUpdate ?? '', c.stale ? 'Yes' : ''])];
  // heatmap
  const hm = $derived.by(() => {
    if (key !== 'border-stops') return null;
    const routes: string[] = d.routes ?? [], stops: string[] = d.stops ?? [];
    const cell = (rt: string, st: string) => (d.cells ?? []).find((x: any) => x.route === rt && x.stop === st);
    return { routes, stops, values: routes.map((rt) => stops.map((st) => cell(rt, st)?.avgDays ?? null)), text: routes.map((rt) => stops.map((st) => { const c = cell(rt, st); return c ? `${c.avgDays.toFixed(1)} d · ${c.trips} trip${c.trips === 1 ? '' : 's'}` : ''; })) };
  });
  const sevMax = $derived(Math.max(1, ...((d?.rows ?? []) as any[]).map((x) => x.daysLate ?? 0)));
</script>

{#if key === 'fleet-board'}
  <DashboardPanel span={span ?? 'full'} title="Where is every truck?" subtitle="by status, grouped by route · faded = no recent update" decision="Act on delayed and faded (silent) trucks first." {...fr} staleAfter={12 * 60} freshness="synced" rows={boardRows} filename="live-fleet" {drill}>
    <KanbanBoard columns={d.columns} {cards} oncard={(c) => { const x = cards.find((y: any) => y.id === c.id); if (x?.shipmentId) go(`#/shipments/${x.shipmentId}`); }} />
  </DashboardPanel>
{:else if key === 'delayed-trucks'}
  <DashboardPanel span={span ?? 1} title="Which trucks are late, and who acts?" subtitle="by days late" decision="Give every late truck an owner and a next step." {...fr} rows={() => [['Truck', 'Shipment', 'Route', 'Where', 'Days late', 'Reason', 'Owner', 'Severity'], ...(d.rows ?? []).map((x: any) => [x.truck, x.ref, x.route, x.where, x.daysLate, x.reason, x.owner ?? 'Not assigned', x.severity])]} filename="delayed-trucks" {drill} emptyText="No truck is late">
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Truck</th><th>Days late</th><th class="hide-sm">Reason</th><th>Owner</th></tr></thead>
      <tbody>{#each d.rows ?? [] as x}
        {@const sv = SEVERITY[x.severity as keyof typeof SEVERITY]}
        <tr class="clickable" onclick={() => go(`#/shipments/${x.shipmentId}`)}>
          <td><b>{x.truck}</b><div class="caption">{x.route}</div></td>
          <td><div class="sev"><span style:width="{(x.daysLate / sevMax) * 100}%" style:background={STATUS[sv.status as keyof typeof STATUS].fill}></span></div><span class="small"><sv.icon size={13} aria-hidden="true" /> {x.daysLate} d · {sv.label}</span></td>
          <td class="small hide-sm">{x.reason}<div class="caption">{x.where}</div></td>
          <td class="small">{x.owner ?? 'Owner not assigned'}</td></tr>
      {/each}</tbody>
    </table></div>
  </DashboardPanel>
{:else if key === 'truck-issues'}
  <DashboardPanel span={span ?? 1} title="What is open, and which trucks repeat?" subtitle="open issues · repeats by truck and provider" decision="Fix repeats on the same truck or provider." {...fr} rows={() => [['Truck', 'Provider', 'Where', 'What happened', 'Reported', 'Days stopped'], ...(d.open ?? []).map((x: any) => [x.truck, x.provider, x.place, x.reason, x.at, x.daysStopped])]} filename="truck-issues" {drill}>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Truck</th><th>What · where</th><th class="num">Days stopped</th></tr></thead>
      <tbody>{#each d.open ?? [] as x}<tr class="clickable" onclick={() => go(`#/shipments/${x.shipmentId}`)}><td><b>{x.truck}</b><div class="caption">{x.provider}</div></td><td class="small">{x.reason}<div class="caption">{x.place} · {dayTime(x.at)}</div></td><td class="num"><StatusBadge status={x.daysStopped >= 1 ? 'bad' : 'warn'} label="{x.daysStopped} d" /></td></tr>
      {:else}<tr><td colspan="3" class="caption">No open issue.</td></tr>{/each}</tbody>
    </table></div>
    {#if d.byTruck?.length}
      <h4 class="overline">Issues in the period · {d.reported} reported{d.avgDaysToFix != null ? ` · fixed in ${d.avgDaysToFix} d on average` : ''}</h4>
      <BarChart label="Issues by truck in the period" horizontal categories={d.byTruck.map((x: any) => x.label)} series={[{ name: 'Issues', values: d.byTruck.map((x: any) => x.value), slot: 3 }]} format={(n) => n0(n)} />
      <BarChart label="Issues by transport provider in the period" horizontal categories={d.byProvider.map((x: any) => x.label)} series={[{ name: 'Issues', values: d.byProvider.map((x: any) => x.value), slot: 4 }]} format={(n) => n0(n)} />
    {/if}
  </DashboardPanel>
{:else if key === 'driver-updates'}
  <DashboardPanel span={span ?? 1} title="Which trucks have gone quiet?" subtitle="feed of the last 48 hours · last update per truck" decision="Call every truck past the red quiet gap." {...fr} staleAfter={6 * 60} freshness="synced" rows={() => [['Time', 'Truck', 'Update', 'Source'], ...(d.feed ?? []).map((x: any) => [x.at, x.truck, x.text, x.source])]} filename="driver-updates" {drill}>
    {#if d.trucks?.length}
      <div class="badges" aria-label="Last update per truck on the road">
        {#each d.trucks as x}<a href="#/shipments/{x.shipmentId}" class="tb"><b>{x.truck}</b><StatusBadge status={x.status} label={x.hours == null ? 'No update yet' : `${x.hours} h ago`} />{#if !x.hasApp}<span class="caption">no app</span>{/if}</a>{/each}
      </div>
      <p class="caption">Amber after {d.gap.amber} h, red after {d.gap.red} h without an update.</p>
    {/if}
    <ol class="feed">
      {#each (d.feed ?? []).slice(0, 25) as x}<li class:issue={x.kind === 'issue'}><span class="caption t">{dayTime(x.at)}</span><span><b>{x.truck}</b> {x.text}</span><span class="caption">{x.source}</span></li>{/each}
    </ol>
  </DashboardPanel>
{:else if key === 'border-stops' && hm}
  <DashboardPanel span={span ?? 2} title="Where do trucks wait?" subtitle="average days at each border by route · trips in each cell" decision="Plan extra days on the slowest cells." {...fr} rows={() => [['Route', 'Stop', 'Average days', 'Trips'], ...(d.cells ?? []).map((x: any) => [x.route, x.stop, x.avgDays, x.trips])]} filename="border-stop-heatmap" {drill}>
    <Heatmap label="Average days at each stop by route" rows={hm.routes} cols={hm.stops} values={hm.values} text={hm.text} format={(n) => `${n.toFixed(1)} d`} />
    {#if d.slowest?.length}<p class="caption">Slowest (3+ trips): {d.slowest.map((x: any) => `${x.stop} on ${x.route} ${x.avgDays.toFixed(1)} d (${x.trips})`).join(' · ')}. Fewer than {d.minTrips} trips is not a stable pattern.</p>{/if}
  </DashboardPanel>
{/if}

<style>
  .sev { height: 6px; background: var(--surface-sunken); border-radius: 3px; max-width: 140px; margin-bottom: 3px; }
  .sev span { display: block; height: 100%; border-radius: 3px; }
  .small :global(svg) { vertical-align: -2px; }
  h4.overline { margin: var(--space-4) 0 var(--space-1); }
  .badges { display: flex; flex-wrap: wrap; gap: var(--space-2); }
  .tb { display: inline-flex; align-items: center; gap: var(--space-2); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 4px 8px; color: var(--text); text-decoration: none; }
  .feed { list-style: none; margin: var(--space-3) 0 0; padding: 0; max-height: 360px; overflow-y: auto; }
  .feed li { display: grid; grid-template-columns: 110px minmax(0, 1fr) auto; gap: var(--space-2); padding: 6px 0; border-top: 1px solid var(--border); font-size: var(--fs-body-sm); }
  .feed li.issue { color: var(--danger); }
  @media (max-width: 600px) { .hide-sm { display: none; } .feed li { grid-template-columns: 1fr; } }
</style>
