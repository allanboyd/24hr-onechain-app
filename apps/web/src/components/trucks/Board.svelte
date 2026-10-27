<script lang="ts">
  // Truck desk · Board: every truck by where it is now. Status counts on top (the shared metric registry, so they equal
  // Home and the Shipments page), filters in the address, the truck list (cards on phones); a click opens the drawer.
  import { lookup, ref, type Shipment, type User } from '@btw/api';
  import { ON_ROAD, TRUCK_STATES, waitLabel, type DeskKpis, type TruckRow, type TruckState } from '@btw/api/trucks';
  import { Badge, ago, fmtDateTime, fmtNum } from '@btw/ui';
  import { SummaryStrip, FilterBar, EmptyState, queryFilters, type SummaryTile } from '../page';
  import CompanyCell from '../CompanyCell.svelte';
  import ExportMenu from '../ExportMenu.svelte';
  import { infoOf } from '../../lib/tiles';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import SearchX from '@lucide/svelte/icons/search-x';
  let { user, rows, ships, k, loaded, onopen }: {
    user: User; rows: TruckRow[]; ships: Shipment[]; k: DeskKpis; loaded: boolean; onopen: (x: TruckRow) => void;
  } = $props();

  const r = ref();
  // filters in the address: #/trucks?show=delayed&provider=pr-ets (`state` also takes any truck state, as before)
  const f = queryFilters({ show: '', state: '', provider: '', route: '', lp: '', q: '' });
  let search = $state(f.values.q);
  $effect(() => { if (search !== f.values.q) f.set('q', search); });
  function clearAll() { f.clear(); search = ''; }

  const count = (s: TruckState) => rows.filter((x) => x.state === s).length;
  const tone = (s: TruckState) => TRUCK_STATES.find((x) => x.state === s)!.tone;
  const stateLabel = (s: TruckState) => TRUCK_STATES.find((x) => x.state === s)!.label;
  const lpName = (id?: string) => { const s = id ? lookup.supplier(id) : undefined; return s ? `${s.code} ${s.city}` : '—'; };

  // docs/18: on the road / delayed / at a border are the registry definitions (roadState), the same as Home
  const SHOW: Record<string, (x: TruckRow) => boolean> = {
    road: (x) => ON_ROAD.includes(x.state), delayed: (x) => x.state === 'Delayed', border: (x) => x.state === 'At border', waiting: (x) => x.state === 'Waiting',
  };
  const tiles = $derived<SummaryTile[]>([
    { key: 'road', label: 'On the road', value: loaded ? k.onRoad : null, sub: `${k.loading} loading`, info: infoOf('onRoad') },
    { key: 'delayed', label: 'Delayed', value: loaded ? k.delayed : null, status: k.delayed ? 'bad' : undefined, statusLabel: k.delayed ? 'Needs action' : undefined, sub: k.openIssues ? `${k.openIssues} open issue${k.openIssues === 1 ? '' : 's'}` : undefined, info: infoOf('delayed') },
    { key: 'border', label: 'At a border', value: loaded ? count('At border') : null, info: infoOf('atBorder') },
    { key: 'waiting', label: 'Waiting to load', value: loaded ? k.inQueue : null, status: k.longWaits ? 'warn' : undefined, statusLabel: k.longWaits ? `${k.longWaits} over a day` : undefined, sub: k.inQueue ? `avg ${waitLabel(k.avgWaitHours)}` : undefined, info: infoOf('trucksWaiting') },
  ]);

  const myPoints = $derived(r.suppliers.filter((s) => !user.roles.includes('truck_planner') || !user.loadingPointIds.length || user.loadingPointIds.includes(s.id) || user.roles.some((x) => ['director', 'admin', 'planner', 'fleet', 'operations'].includes(x))));
  const usedProviders = $derived(r.providers.filter((p) => rows.some((x) => x.truck.providerId === p.id)));
  const usedRoutes = $derived(r.routes.filter((rt) => rows.some((x) => x.routeId === rt.id)));
  const atPoint = (x: TruckRow, lp: string) => x.loadingPointId === lp
    || (x.state === 'Loading' && lookup.checkpoint(r.suppliers.find((s) => s.id === lp)?.checkpointId ?? '')?.id === (x.legId ? ships.find((s) => s.id === x.shipmentId)?.legs.find((l) => l.id === x.legId)?.fromId : undefined));
  const list = $derived(rows.filter((x) => {
    const v = f.values;
    return (!v.show || SHOW[v.show]?.(x) !== false) && (!v.state || x.state === v.state) && (!v.provider || x.truck.providerId === v.provider)
      && (!v.lp || atPoint(x, v.lp)) && (!v.route || x.routeId === v.route)
      && (!v.q.trim() || `${x.truck.reg} ${x.truck.trailer} ${x.provider?.name ?? ''} ${x.driver?.name ?? ''} ${x.shipmentRef ?? ''} ${x.where}`.toLowerCase().includes(v.q.trim().toLowerCase()));
  }));
  const active = $derived(['show', 'state', 'provider', 'route', 'lp'].filter((x) => f.values[x as 'show']).length);
  // idle trucks (no trip, no queue) fold away unless asked for, so the board opens on the trucks that are moving
  let showIdle = $state(false);
  const foldIdle = $derived(!showIdle && !f.values.state && !f.values.q.trim());
  const idleCount = $derived(foldIdle ? list.filter((x) => x.state === 'Idle').length : 0);
  const shown = $derived(foldIdle ? list.filter((x) => x.state !== 'Idle') : list);

  const exportTrucks = () => [['Truck', 'Trailer', 'Provider', 'Driver', 'State', 'Where', 'Position source', 'Last position at', 'Shipment', 'ETA', 'ETA state', 'Open issues', 'Queue', 'Queue position', 'Waiting (h)', 'Days since last move'],
    ...list.map((x) => [x.truck.reg, x.truck.trailer, x.provider?.name ?? '', x.driver?.name ?? '', stateLabel(x.state), x.where, x.position?.source ?? '', x.position?.at ?? '', x.shipmentRef ?? '', x.eta?.eta ?? '', x.eta ? `${x.eta.state}${x.eta.hours ? ` ${x.eta.hours} h` : ''}` : '', x.issues.map((i) => `${i.reason} (${i.place})`).join('; '), x.loadingPointId ? lpName(x.loadingPointId) : '', x.queuePosition ?? '', x.waitingHours !== undefined ? Math.round(x.waitingHours * 10) / 10 : '', x.daysSinceMove ?? ''])];
</script>

<SummaryStrip {tiles} bind:value={f.values.show} param="show" label="Trucks by status" />
<FilterBar bind:search placeholder="Truck, driver, provider, shipment, place" {active} onclear={clearAll}>
  <label class="field"><span>State</span><select class="select" value={f.values.state} onchange={(e) => f.set('state', e.currentTarget.value)}><option value="">All states</option>{#each TRUCK_STATES as s}{#if count(s.state) || f.values.state === s.state}<option value={s.state}>{s.label} ({count(s.state)})</option>{/if}{/each}</select></label>
  <label class="field"><span>Provider</span><select class="select" value={f.values.provider} onchange={(e) => f.set('provider', e.currentTarget.value)}><option value="">All providers</option>{#each usedProviders as p}<option value={p.id}>{p.name}</option>{/each}</select></label>
  <label class="field"><span>Route</span><select class="select" value={f.values.route} onchange={(e) => f.set('route', e.currentTarget.value)}><option value="">All routes</option>{#each usedRoutes as rt}<option value={rt.id}>{rt.name}</option>{/each}</select></label>
  <label class="field"><span>Loading point</span><select class="select" value={f.values.lp} onchange={(e) => f.set('lp', e.currentTarget.value)}><option value="">All</option>{#each myPoints as s}<option value={s.id}>{s.code} {s.city}</option>{/each}</select></label>
  {#snippet end()}{#if loaded}<span class="caption">{list.length} of {rows.length} trucks</span>{/if}<ExportMenu name="truck-desk" rows={exportTrucks} />{/snippet}
</FilterBar>

<div class="card flush table-wrap desktop">
  <table class="table">
    <thead><tr><th>Truck</th><CompanyCell head /><th>State</th><th>Where now</th><th>ETA</th><th>Driver</th><th>Provider</th><th>Issues</th><th class="num">Days since move</th></tr></thead>
    <tbody>
      {#each shown as x (x.truck.id)}
        <tr class="click" tabindex="0" onclick={() => onopen(x)} onkeydown={(e) => e.key === 'Enter' && onopen(x)}>
          <td class="truck"><strong>{x.truck.reg}</strong><div class="caption">{x.truck.trailer || '—'} · {fmtNum(x.truck.capacityCases)} cases</div></td>
          <CompanyCell entityId={x.entityId} />
          <td><Badge tone={tone(x.state)}>{stateLabel(x.state)}</Badge>{#if x.state === 'Waiting'}<div class="caption">#{x.queuePosition} · {waitLabel(x.waitingHours)}</div>{/if}</td>
          <td class="small">{x.where}{#if x.position}<div class="caption">{x.position.source === 'gps' ? 'GPS' : x.position.source === 'checkpoint' ? 'last check-in' : 'loading point'}{x.position.at ? ` · ${ago(x.position.at)}` : ''}</div>{/if}</td>
          <td class="small">{#if x.eta && x.state !== 'Waiting' && x.state !== 'Idle'}{fmtDateTime(x.eta.eta)}<div class="caption" class:late={x.eta.state === 'Late'}>{x.eta.state}{x.eta.hours ? ` ${x.eta.hours} h` : ''} · to {lookup.checkpoint(x.toId ?? '')?.name ?? ''}</div>{:else}—{/if}</td>
          <td class="small">{x.driver?.name ?? '—'}{#if x.driver && !x.driver.hasApp}<div class="caption">SMS</div>{/if}</td>
          <td class="small">{x.provider?.name ?? '—'}</td>
          <td class="small">{#if x.issues.length}<span class="issue"><TriangleAlert size={14} />{x.issues[0].reason}</span>{#if x.issues.length > 1}<div class="caption">+{x.issues.length - 1} more</div>{/if}{:else}—{/if}</td>
          <td class="num" class:stale={(x.daysSinceMove ?? 0) >= 7}>{x.daysSinceMove ?? '—'}</td>
        </tr>
      {:else}
        <tr><td colspan="9">{#if !loaded}<div class="skeleton"></div>{:else if idleCount}<EmptyState title="Only idle trucks here" compact />{:else if active || f.values.q}<EmptyState title="No truck matches these filters" icon={SearchX} compact><button class="btn btn-secondary btn-sm" onclick={clearAll}>Clear filters</button></EmptyState>{:else}<EmptyState title="No trucks yet" compact />{/if}</td></tr>
      {/each}
    </tbody>
  </table>
</div>
{#if idleCount}<div class="idle"><button class="btn btn-ghost btn-sm" onclick={() => (showIdle = true)}>Show {idleCount} idle truck{idleCount === 1 ? '' : 's'}</button></div>{/if}

<ul class="cards mobile">
  {#each shown as x (x.truck.id)}
    <li><button type="button" class="card rowcard" onclick={() => onopen(x)}>
      <span class="row between"><strong>{x.truck.reg}</strong><Badge tone={tone(x.state)}>{stateLabel(x.state)}</Badge></span>
      <span class="small">{x.where}{#if x.state === 'Waiting'} · waiting {waitLabel(x.waitingHours)}{/if}</span>
      <span class="caption">{x.provider?.name ?? '—'} · {x.driver?.name ?? 'no driver'}{#if x.eta && x.state !== 'Waiting' && x.state !== 'Idle'} · ETA {fmtDateTime(x.eta.eta)}{/if}</span>
      {#if x.issues.length}<span class="issue small"><TriangleAlert size={14} />{x.issues[0].reason}{x.issues.length > 1 ? ` +${x.issues.length - 1}` : ''}</span>{/if}
    </button></li>
  {:else}
    {#if loaded && !idleCount}<li><EmptyState title="No truck matches these filters" icon={SearchX} compact><button class="btn btn-secondary btn-sm" onclick={clearAll}>Clear filters</button></EmptyState></li>{/if}
  {/each}
</ul>
{#if idleCount}<div class="idle mobile-only"><button class="btn btn-ghost btn-sm" onclick={() => (showIdle = true)}>Show {idleCount} idle truck{idleCount === 1 ? '' : 's'}</button></div>{/if}

<style>
  tr.click { cursor: pointer; }
  .truck { white-space: nowrap; }
  .idle { display: flex; justify-content: center; padding: var(--space-2) 0; }
  .mobile-only { display: none; }
  tr.click:hover, tr.click:focus-visible { background: var(--surface-sunken); outline: none; }
  .late { color: var(--danger); font-weight: 600; }
  .stale { color: var(--warning); font-weight: 600; }
  .issue { display: inline-flex; align-items: center; gap: 4px; color: var(--danger); font-weight: 600; }
  .cards { list-style: none; margin: 0; padding: 0; display: none; flex-direction: column; gap: var(--space-2); }
  .rowcard { display: flex; flex-direction: column; align-items: stretch; gap: var(--space-1); width: 100%; padding: var(--space-3) var(--space-4); text-align: left; font: inherit; color: inherit; cursor: pointer; }
  @media (max-width: 700px) { .desktop, .idle:not(.mobile-only) { display: none; } .cards { display: flex; } .idle.mobile-only { display: flex; } }
</style>
