<script lang="ts">
  // Shipments work page (TR-02, docs/17 Phase 1–2): opens on the list with the fleet strip (metric registry, same numbers as
  // Home and the Truck desk), filters in the address, and a Map view toggle (replaces the separate Tracking page).
  // Needs-action default (no filter in the address): truck follow-up roles (Truck desk users) open on Delayed when any truck
  // is delayed; everyone else (receivers, planners) on the trucks on the road.
  import { destinationLabel } from '../lib/planning';
  import CompanyCell from '../components/CompanyCell.svelte';
  import { watch } from '../lib/load.svelte';
  import ErrorState from '../components/ErrorState.svelte';
  import { lookup, ref, shipments, tracking, type Leg, type Shipment, type User } from '@btw/api';
  import { Badge, ago, fmtDateTime, hoursLabel, router } from '@btw/ui';
  import Clock from '@lucide/svelte/icons/clock';
  import MapIcon from '@lucide/svelte/icons/map';
  import ListIcon from '@lucide/svelte/icons/list';
  import SearchX from '@lucide/svelte/icons/search-x';
  import { PageHeader, SummaryStrip, FilterBar, EmptyState, queryFilters, readQuery, type SummaryTile } from '../components/page';
  import { chainOf, fromLabel } from '../lib/journey';
  import { shipmentTiles, infoOf } from '../lib/tiles';
  import { can } from '../lib/features';
  const stopsOf = (id: string) => lookup.route(id)?.stops ?? [];
  let { user }: { user: User } = $props();
  const r = ref();
  let list = $state<Shipment[] | null>(null);
  async function load() { list = await shipments.list(); }
  const w = watch(load);
  const f = queryFilters({ show: '', route: '', company: '', q: '', view: '' });
  let search = $state(f.values.q);
  $effect(() => { if (search !== f.values.q) f.set('q', search); });

  const activeLeg = (sh: Shipment): Leg => sh.legs.find((l) => l.status !== 'Acknowledged') ?? sh.legs.at(-1)!;
  const scoped = $derived((list ?? []).filter((sh) => !user.roles.includes('receiver') || user.roles.includes('director') || user.warehouseIds.includes(sh.warehouseId)));
  // docs/18: the same figures as Home and the phone (metrics registry); each tile filters the list to its figure
  const fig = $derived(shipmentTiles(scoped, stopsOf));
  const TEST: Record<string, (s: Shipment) => boolean> = { road: (s) => fig.is.road(s), delayed: (s) => fig.is.delayed(s), border: (s) => fig.is.border(s), noCheckin: (s) => fig.is.noCheckin(s), delivered: (s) => fig.is.delivered(s) };
  const tiles = $derived<SummaryTile[]>([
    { key: 'road', label: 'On the road', value: list ? fig.onRoad : null, sub: `${fig.delivered} delivered`, info: infoOf('onRoad') },
    { key: 'delayed', label: 'Delayed', value: list ? fig.delayed : null, status: fig.delayed ? 'bad' : undefined, statusLabel: fig.delayed ? 'Needs action' : undefined, info: infoOf('delayed') },
    { key: 'border', label: 'At a border', value: list ? fig.atBorder : null, info: infoOf('atBorder') },
    { key: 'noCheckin', label: 'No check-in', value: list ? fig.noCheckin : null, status: fig.noCheckin ? 'warn' : undefined, statusLabel: fig.noCheckin ? 'Call the driver' : undefined, info: infoOf('noCheckin') },
  ]);
  let defaulted = false;
  $effect(() => {
    if (defaulted || !list) return;
    defaulted = true;
    if (['show', 'q', 'route', 'company'].some((k) => readQuery(k))) return;
    f.set('show', can(user, 'trucks') && fig.delayed ? 'delayed' : 'road');
  });
  const rows = $derived(scoped.filter((sh) => (!f.values.show || f.values.show === 'all' || TEST[f.values.show]?.(sh))
    && (!f.values.company || sh.receivingCompanyId === f.values.company) && (!f.values.route || sh.legs.some((l) => l.routeId === f.values.route))
    && (!f.values.q || `${sh.ref} ${sh.truckNo} ${lookup.poRef(sh.poId)} ${sh.legs.map((l) => `${lookup.truck(l.truckId)?.reg} ${lookup.driver(l.driverId)?.name}`).join(' ')}`.toLowerCase().includes(f.values.q.toLowerCase()))));
  const map = $derived(f.values.view === 'map');
  const active = $derived((f.values.show && f.values.show !== 'all' ? 1 : 0) + (f.values.route ? 1 : 0) + (f.values.company ? 1 : 0));
  function clearAll() { f.clear(['show', 'route', 'company', 'q']); f.set('show', 'all'); search = ''; }

  function where(leg: Leg) {
    const i = leg.passes.reduce((a, p, k) => (p.arrivedAt ? k : a), -1);
    const at = i >= 0 ? leg.passes[i] : undefined;
    const next = leg.passes[i + 1];
    const short = (id?: string) => lookup.checkpoint(id ?? '')?.name?.split(' (')[0];
    const src: Record<string, string> = { driver: 'driver', geofence: 'geofence', 'gps-provider': 'GPS', sms: 'SMS', office: 'office' };
    return {
      cur: at ? `${at.departedAt ? 'Left' : 'At'} ${short(at.checkpointId)}` : 'At loading point',
      last: at ? `${ago(at.departedAt ?? at.arrivedAt)} · via ${src[at.source ?? 'office']}` : 'Not dispatched',
      next: next ? short(next.checkpointId) : '—',
      nextPlanned: next?.plannedAt,
    };
  }
</script>

<PageHeader overline="Logistics" title="Shipments" description="Every truck from loading to signed delivery." analysis="fleet"
  info="Position comes from checkpoint check-ins: the driver app, SMS, a geofence or the office. A truck whose next check-in is more than 3 hours overdue shows under No check-in. The Map view shows the trucks of the list below on a map.">
  {#snippet secondary()}
    {#if map}<button class="btn btn-secondary" onclick={() => f.set('view', '')}><ListIcon size={16} aria-hidden="true" />List view</button>
    {:else}<button class="btn btn-secondary" onclick={() => f.set('view', 'map')}><MapIcon size={16} aria-hidden="true" />Map view</button>{/if}
  {/snippet}
</PageHeader>
<ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />
<SummaryStrip {tiles} bind:value={f.values.show} param="show" label="Shipments summary" />
<FilterBar bind:search placeholder="Shipment, PO, truck or driver" {active} onclear={clearAll}>
  <label class="field"><span>Show</span><select class="select" value={f.values.show || 'all'} onchange={(e) => f.set('show', e.currentTarget.value)}>
    <option value="road">On the road</option><option value="delayed">Delayed</option><option value="border">At a border</option><option value="noCheckin">No check-in</option><option value="delivered">Delivered</option><option value="all">All shipments</option></select></label>
  <label class="field"><span>Route</span><select class="select" value={f.values.route} onchange={(e) => f.set('route', e.currentTarget.value)}><option value="">All routes</option>{#each r.routes as rt}<option value={rt.id}>{rt.name}</option>{/each}</select></label>
  <label class="field"><span>Receiving company</span><select class="select" value={f.values.company} onchange={(e) => f.set('company', e.currentTarget.value)}><option value="">All</option>{#each r.receivingCompanies as c}<option value={c.id}>{c.name}</option>{/each}</select></label>
  {#snippet end()}{#if list}<span class="caption">{rows.length} of {scoped.length} shipments</span>{/if}{/snippet}
</FilterBar>

{#if map}
  {#await import('../components/ShipmentMap.svelte') then M}<M.default items={rows} />{/await}
{:else}
<div class="card flush table-wrap wide-only">
  <table class="table">
    <thead><tr><CompanyCell head /><th>Shipment</th><th>From</th><th>Truck</th><th>Route · leg</th><th>Last check-in</th><th>Next checkpoint</th><th>Status</th><th>ETA</th></tr></thead>
    <tbody>
      {#if !list}{#each Array(3) as _}<tr><td colspan="9"><div class="skeleton"></div></td></tr>{/each}{/if}
      {#each rows as sh (sh.id)}
        {@const leg = activeLeg(sh)}
        {@const eta = shipments.eta(leg)}
        {@const w = where(leg)}
        {@const dw = tracking.dwell(leg)}
        {@const od = tracking.overdue(leg)}
        {@const chain = chainOf(list ?? [], sh)}
        <tr class="clickable" onclick={() => router.go(`/shipments/${sh.id}`)}><CompanyCell entityId={(sh as { entityId?: string }).entityId} />
          <td><a class="mono" href="#/shipments/{sh.id}">{sh.ref}</a><div class="caption">PO <span class="mono">{lookup.poRef(sh.poId)}</span> · Truck {sh.truckNo}</div><div class="caption">→ {lookup.company(sh.receivingCompanyId)?.name} · {destinationLabel(sh.warehouseId)}</div>
            {#if chain.length > 1}<Badge tone="info">Shipment {chain.findIndex((c) => c.id === sh.id) + 1} of {chain.length}</Badge>{/if}</td>
          <td class="small">{fromLabel(sh)}</td>
          <td><strong class="nowrap">{lookup.truck(leg.truckId)?.reg}</strong><div class="caption">{lookup.driver(leg.driverId)?.name}</div></td>
          <td class="small">{lookup.route(leg.routeId)?.name}<div class="caption">Leg {leg.seq} of {sh.legs.length}</div></td>
          <td class="small">{w.cur}<div class="caption">{w.last}</div>
            {#if dw}<Badge tone={dw.over ? 'warning' : 'neutral'}><Clock size={12} />{hoursLabel(dw.hours)} here · plan {hoursLabel(dw.plannedDwellHours)}</Badge>{/if}</td>
          <td class="small">{w.next}{#if od}<div><Badge tone="danger">No check-in · {hoursLabel(od.hours)} overdue</Badge></div>{:else if w.nextPlanned && sh.status !== 'Acknowledged'}<div class="caption">planned {fmtDateTime(w.nextPlanned)}</div>{/if}</td>
          <td><Badge status={sh.status} /></td>
          <td>{#if sh.status !== 'Acknowledged'}<Badge status={eta.state}>{eta.state}{eta.state !== 'On time' ? ` ${hoursLabel(eta.hours)}` : ''}</Badge><div class="caption nowrap">{fmtDateTime(eta.eta)}</div>{:else}<span class="caption">Delivered</span>{/if}</td>
        </tr>
      {:else}{#if list}<tr><td colspan="9"><EmptyState title="No shipments match these filters" icon={SearchX} compact><button class="btn btn-secondary btn-sm" onclick={clearAll}>Clear filters</button></EmptyState></td></tr>{/if}{/each}
    </tbody>
  </table>
</div>

<!-- Phone layout: one card per truck -->
<ul class="cards narrow-only">
  {#if !list}<li class="card"><div class="skeleton"></div></li>{/if}
  {#each rows as sh (sh.id)}
    {@const leg = activeLeg(sh)}
    {@const eta = shipments.eta(leg)}
    {@const w = where(leg)}
    {@const od = tracking.overdue(leg)}
    <li><a class="card" href="#/shipments/{sh.id}">
      <div class="row between"><strong>{lookup.truck(leg.truckId)?.reg}</strong><Badge status={sh.status} /></div>
      <div class="small">{lookup.route(leg.routeId)?.name} · leg {leg.seq}/{sh.legs.length}</div>
      <div class="caption"><span class="mono">{sh.ref}</span> · {w.cur} · {w.last}</div>
      <div class="row between">
        {#if sh.status !== 'Acknowledged'}<Badge status={eta.state}>{eta.state}{eta.state !== 'On time' ? ` ${hoursLabel(eta.hours)}` : ''}</Badge><span class="caption">ETA {fmtDateTime(eta.eta)}</span>{:else}<span class="caption">Delivered</span>{/if}
      </div>
      {#if od}<Badge tone="danger">No check-in at {w.next} · {hoursLabel(od.hours)} overdue</Badge>{/if}
    </a></li>
  {:else}{#if list}<li><EmptyState title="No shipments match these filters" icon={SearchX} compact><button class="btn btn-secondary btn-sm" onclick={clearAll}>Clear filters</button></EmptyState></li>{/if}{/each}
</ul>

{/if}

<style>
  .nowrap, .mono { white-space: nowrap; }
  .cards { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-3); }
  .cards a.card { display: flex; flex-direction: column; gap: var(--space-1); color: inherit; text-decoration: none; padding: var(--space-4); }
  .narrow-only { display: none; }
  @media (max-width: 760px) { .wide-only { display: none; } .narrow-only { display: flex; } }
</style>
