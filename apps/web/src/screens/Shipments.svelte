<script lang="ts">
  import { watch } from '../lib/load.svelte';
  import ErrorState from '../components/ErrorState.svelte';
  // TR-02: list of active and closed shipments with position, next checkpoint and ETA.
  import { lookup, ref, shipments, tracking, type Leg, type Shipment, type User } from '@btw/api';
  import { Badge, ago, fmtDateTime, hoursLabel, router } from '@btw/ui';
  import Clock from '@lucide/svelte/icons/clock';
  let { user }: { user: User } = $props();
  const r = ref();
  let list = $state<Shipment[] | null>(null);
  let chip = $state<'active' | 'all' | 'Delayed' | 'At border' | 'no-checkin' | 'Acknowledged'>('active');
  let route = $state(''); let company = $state('');
  async function load() { list = await shipments.list(); }
  const w = watch(load);

  const activeLeg = (sh: Shipment): Leg => sh.legs.find((l) => l.status !== 'Acknowledged') ?? sh.legs.at(-1)!;
  const scoped = $derived((list ?? []).filter((sh) => !user.roles.includes('receiver') || user.roles.includes('director') || user.warehouseIds.includes(sh.warehouseId)));
  const atBorder = (sh: Shipment) => activeLeg(sh).status === 'At border';
  const noCheckin = (sh: Shipment) => !!tracking.overdue(activeLeg(sh));
  const chips = $derived([
    { key: 'active', label: 'On the road', n: scoped.filter((s) => s.status !== 'Acknowledged').length },
    { key: 'Delayed', label: 'Delayed', n: scoped.filter((s) => s.status === 'Delayed').length },
    { key: 'At border', label: 'At border', n: scoped.filter(atBorder).length },
    { key: 'no-checkin', label: 'No check-in', n: scoped.filter(noCheckin).length },
    { key: 'Acknowledged', label: 'Delivered', n: scoped.filter((s) => s.status === 'Acknowledged').length },
    { key: 'all', label: 'All', n: scoped.length },
  ] as const);
  const rows = $derived(scoped.filter((sh) =>
    (chip === 'all' || (chip === 'active' ? sh.status !== 'Acknowledged' : chip === 'At border' ? atBorder(sh) : chip === 'no-checkin' ? noCheckin(sh) : sh.status === chip))
    && (!company || sh.receivingCompanyId === company) && (!route || sh.legs.some((l) => l.routeId === route))));

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

<div class="page-head">
  <div><div class="overline crumb">Logistics</div><h1>Shipments & legs</h1>
    <p class="muted small">Every truck from loading to acknowledgement. Position comes from checkpoint check-ins (driver app, SMS, geofence or office).</p></div>
  <a class="btn btn-secondary" href="#/tracking">Map view</a>
</div>
<ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />

<div class="chips" role="tablist" aria-label="Quick filters">
  {#each chips as c}
    <button role="tab" aria-selected={chip === c.key} class:warn={c.key === 'no-checkin' && c.n > 0} onclick={() => (chip = c.key)}>{c.label} <span class="n">{c.n}</span></button>
  {/each}
</div>
<div class="filters">
  <label class="field"><span>Route</span><select class="select" bind:value={route}><option value="">All routes</option>{#each r.routes as rt}<option value={rt.id}>{rt.name}</option>{/each}</select></label>
  <label class="field"><span>Receiving company</span><select class="select" bind:value={company}><option value="">All</option>{#each r.receivingCompanies as c}<option value={c.id}>{c.name}</option>{/each}</select></label>
</div>

<div class="card flush table-wrap wide-only">
  <table class="table">
    <thead><tr><th>Shipment</th><th>Truck</th><th>Route · leg</th><th>Last check-in</th><th>Next checkpoint</th><th>Status</th><th>ETA</th></tr></thead>
    <tbody>
      {#if !list}{#each Array(3) as _}<tr><td colspan="7"><div class="skeleton"></div></td></tr>{/each}{/if}
      {#each rows as sh (sh.id)}
        {@const leg = activeLeg(sh)}
        {@const eta = shipments.eta(leg)}
        {@const w = where(leg)}
        {@const dw = tracking.dwell(leg)}
        {@const od = tracking.overdue(leg)}
        <tr class="clickable" onclick={() => router.go(`/shipments/${sh.id}`)}>
          <td><a class="mono" href="#/shipments/{sh.id}">{sh.ref}</a><div class="caption">PO <span class="mono">{lookup.poRef(sh.poId)}</span> · Truck {sh.truckNo}</div><div class="caption">→ {lookup.company(sh.receivingCompanyId)?.name} · {lookup.warehouse(sh.warehouseId)?.name}</div></td>
          <td><strong class="nowrap">{lookup.truck(leg.truckId)?.reg}</strong><div class="caption">{lookup.driver(leg.driverId)?.name}</div></td>
          <td class="small">{lookup.route(leg.routeId)?.name}<div class="caption">Leg {leg.seq} of {sh.legs.length}</div></td>
          <td class="small">{w.cur}<div class="caption">{w.last}</div>
            {#if dw}<Badge tone={dw.over ? 'warning' : 'neutral'}><Clock size={12} />{hoursLabel(dw.hours)} here · plan {hoursLabel(dw.plannedDwellHours)}</Badge>{/if}</td>
          <td class="small">{w.next}{#if od}<div><Badge tone="danger">No check-in · {hoursLabel(od.hours)} overdue</Badge></div>{:else if w.nextPlanned && sh.status !== 'Acknowledged'}<div class="caption">planned {fmtDateTime(w.nextPlanned)}</div>{/if}</td>
          <td><Badge status={sh.status} /></td>
          <td>{#if sh.status !== 'Acknowledged'}<Badge status={eta.state}>{eta.state}{eta.state !== 'On time' ? ` ${hoursLabel(eta.hours)}` : ''}</Badge><div class="caption nowrap">{fmtDateTime(eta.eta)}</div>{:else}<span class="caption">Delivered</span>{/if}</td>
        </tr>
      {:else}{#if list}<tr><td colspan="7" class="empty">No shipments match these filters. <button class="btn btn-ghost btn-sm" onclick={() => { chip = 'all'; route = ''; company = ''; }}>Clear filters</button></td></tr>{/if}{/each}
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
  {:else}{#if list}<li class="empty">No shipments match</li>{/if}{/each}
</ul>

<style>
  .chips { display: flex; gap: var(--space-2); flex-wrap: wrap; margin-bottom: var(--space-4); }
  .chips button { display: inline-flex; align-items: center; gap: var(--space-2); height: 32px; padding: 0 var(--space-3); border-radius: var(--radius-md); border: 1px solid var(--border-strong); background: var(--surface); color: var(--text); font: 600 13px var(--ff-body); cursor: pointer; }
  .chips button[aria-selected='true'] { background: var(--primary); border-color: var(--primary); color: var(--text-on-primary); }
  .chips .n { font-variant-numeric: tabular-nums; background: var(--surface-sunken); color: var(--text-muted); border-radius: var(--radius-sm); padding: 1px 6px; font-size: 12px; }
  .chips button[aria-selected='true'] .n { background: transparent; color: inherit; }
  .chips button.warn:not([aria-selected='true']) .n { background: var(--danger-subtle); color: var(--danger); }
  .nowrap, .mono { white-space: nowrap; }
  .cards { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-3); }
  .cards a.card { display: flex; flex-direction: column; gap: var(--space-1); color: inherit; text-decoration: none; padding: var(--space-4); }
  .narrow-only { display: none; }
  @media (max-width: 760px) { .wide-only { display: none; } .narrow-only { display: flex; } }
</style>
