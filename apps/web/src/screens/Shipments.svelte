<script lang="ts">
  // Shipments work page (TR-02, docs/17 Phase 1–2): opens on the list with the fleet strip (metric registry, same numbers as
  // Home and the Truck desk), filters in the address, and a Map view toggle (replaces the separate Tracking page).
  // Needs-action default (no filter in the address): truck follow-up roles (Truck desk users) open on Delayed when any truck
  // is delayed; everyone else (receivers, planners) on the trucks on the road.
  import { destinationLabel } from '../lib/planning';
  import CompanyMark from '../components/CompanyMark.svelte';
  import { company, GROUP } from '../lib/company.svelte';
  import { companyLabel } from '../lib/companies';
  import { watch } from '../lib/load.svelte';
  import ErrorState from '../components/ErrorState.svelte';
  import { lookup, ref, shipments, tracking, type Leg, type Shipment, type User } from '@btw/api';
  import { Badge, ago, fmtDateTime, hoursLabel, router } from '@btw/ui';
  import Clock from '@lucide/svelte/icons/clock';
  import MapIcon from '@lucide/svelte/icons/map';
  import ListIcon from '@lucide/svelte/icons/list';
    import { PageHeader, SummaryStrip, FilterBar, DataTable, queryFilters, readQuery, ts, type Column, type SummaryTile } from '../components/page';
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
  let auto = $state(''); // the needs-action filter the page opened on (the strip says so)
  $effect(() => {
    if (defaulted || !list) return;
    defaulted = true;
    if (['show', 'q', 'route', 'company'].some((k) => readQuery(k))) return;
    const pick = can(user, 'trucks') && fig.delayed ? 'delayed' : 'road';
    if (pick === 'delayed') auto = pick; // "On the road" is the usual view, not an action list
    f.set('show', pick);
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
  // the list's columns (DataTable): sort values are numbers / timestamps, the cells are the snippets below the markup
  const etaOf = (sh: Shipment) => (sh.status === 'Acknowledged' ? null : ts(shipments.eta(activeLeg(sh)).eta));
  const lastAt = (sh: Shipment) => { const l = activeLeg(sh); const p = l.passes.filter((x) => x.arrivedAt).at(-1); return ts(p?.departedAt ?? p?.arrivedAt); };
  const columns = $derived<Column<Shipment>[]>([
    ...(company.active === GROUP ? [{ key: 'company', label: 'Company', value: (sh: Shipment) => companyLabel((sh as { entityId?: string }).entityId ?? ''), cell: companyCell, hideBelow: 960 }] : []),
    { key: 'ref', label: 'Shipment', sticky: true, width: '240px', value: (sh) => sh.ref, cell: refCell },
    { key: 'from', label: 'From', value: (sh) => fromLabel(sh), class: 'small', hideBelow: 1200 },
    { key: 'truck', label: 'Truck', value: (sh) => lookup.truck(activeLeg(sh).truckId)?.reg, cell: truckCell },
    { key: 'route', label: 'Route · leg', value: (sh) => lookup.route(activeLeg(sh).routeId)?.name, cell: routeCell, class: 'small', hideBelow: 960 },
    { key: 'last', label: 'Last check-in', sortValue: lastAt, csv: (sh) => where(activeLeg(sh)).cur, cell: lastCell, class: 'small' },
    { key: 'next', label: 'Next checkpoint', sortValue: (sh) => ts(where(activeLeg(sh)).nextPlanned), csv: (sh) => where(activeLeg(sh)).next, cell: nextCell, class: 'small' },
    { key: 'status', label: 'Status', value: (sh) => sh.status, cell: statusCell },
    { key: 'eta', label: 'ETA', sortValue: etaOf, csv: (sh) => (sh.status === 'Acknowledged' ? 'Delivered' : shipments.eta(activeLeg(sh)).eta), cell: etaCell },
  ]);
</script>

<PageHeader overline="Logistics" title="Shipments" description="Every truck from loading to signed delivery." analysis="fleet"
  info="Position comes from checkpoint check-ins: the driver app, SMS, a geofence or the office. A truck whose next check-in is more than 3 hours overdue shows under No check-in. The Map view shows the trucks of the list below on a map.">
  {#snippet secondary()}
    {#if map}<button class="btn btn-secondary" onclick={() => f.set('view', '')}><ListIcon size={16} aria-hidden="true" />List view</button>
    {:else}<button class="btn btn-secondary" onclick={() => f.set('view', 'map')}><MapIcon size={16} aria-hidden="true" />Map view</button>{/if}
  {/snippet}
</PageHeader>
<ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />
<SummaryStrip {tiles} bind:value={f.values.show} param="show" label="Shipments summary" allValue="all" noun="shipments" total={list ? scoped.length : null} shown={list ? rows.length : null} {auto} labels={{ delivered: 'Delivered' }} />
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
<DataTable id="shipments" label="Shipments" noun="shipments" rows={list ? rows : null} {columns} rowKey={(sh) => sh.id} onrowclick={(sh) => router.go(`/shipments/${sh.id}`)}
  initialSort={{ key: 'eta', dir: 'asc' }} filename="shipments" onclear={clearAll} card={phoneCard} />
{/if}

{#snippet companyCell(sh: Shipment)}{@const id = (sh as { entityId?: string }).entityId}<span class="cc"><CompanyMark entityId={id ?? null} size={18} />{id ? companyLabel(id) : '—'}</span>{/snippet}
{#snippet refCell(sh: Shipment)}
  {@const chain = chainOf(list ?? [], sh)}
  <a class="mono" href="#/shipments/{sh.id}">{sh.ref}</a><div class="caption">PO <span class="mono">{lookup.poRef(sh.poId)}</span> · Truck {sh.truckNo}</div><div class="caption">→ {lookup.company(sh.receivingCompanyId)?.name} · {destinationLabel(sh.warehouseId)}</div>
  {#if chain.length > 1}<Badge tone="info">Shipment {chain.findIndex((c) => c.id === sh.id) + 1} of {chain.length}</Badge>{/if}
{/snippet}
{#snippet truckCell(sh: Shipment)}{@const leg = activeLeg(sh)}<strong class="nowrap">{lookup.truck(leg.truckId)?.reg}</strong><div class="caption">{lookup.driver(leg.driverId)?.name}</div>{/snippet}
{#snippet routeCell(sh: Shipment)}{@const leg = activeLeg(sh)}{lookup.route(leg.routeId)?.name}<div class="caption">Leg {leg.seq} of {sh.legs.length}</div>{/snippet}
{#snippet lastCell(sh: Shipment)}
  {@const leg = activeLeg(sh)}{@const w = where(leg)}{@const dw = tracking.dwell(leg)}
  {w.cur}<div class="caption">{w.last}</div>
  {#if dw}<Badge tone={dw.over ? 'warning' : 'neutral'}><Clock size={12} />{hoursLabel(dw.hours)} here · plan {hoursLabel(dw.plannedDwellHours)}</Badge>{/if}
{/snippet}
{#snippet nextCell(sh: Shipment)}
  {@const leg = activeLeg(sh)}{@const w = where(leg)}{@const od = tracking.overdue(leg)}
  {w.next}{#if od}<div><Badge tone="danger">No check-in · {hoursLabel(od.hours)} overdue</Badge></div>{:else if w.nextPlanned && sh.status !== 'Acknowledged'}<div class="caption">planned {fmtDateTime(w.nextPlanned)}</div>{/if}
{/snippet}
{#snippet statusCell(sh: Shipment)}<Badge status={sh.status} />{/snippet}
{#snippet etaCell(sh: Shipment)}
  {@const eta = shipments.eta(activeLeg(sh))}
  {#if sh.status !== 'Acknowledged'}<Badge status={eta.state}>{eta.state}{eta.state !== 'On time' ? ` ${hoursLabel(eta.hours)}` : ''}</Badge><div class="caption nowrap">{fmtDateTime(eta.eta)}</div>{:else}<span class="caption">Delivered</span>{/if}
{/snippet}
<!-- Phone layout: one card per truck -->
{#snippet phoneCard(sh: Shipment)}
  {@const leg = activeLeg(sh)}{@const eta = shipments.eta(leg)}{@const w = where(leg)}{@const od = tracking.overdue(leg)}
  <div class="row between"><strong>{lookup.truck(leg.truckId)?.reg}</strong><Badge status={sh.status} /></div>
  <div class="small">{lookup.route(leg.routeId)?.name} · leg {leg.seq}/{sh.legs.length}</div>
  <div class="caption"><a class="mono" href="#/shipments/{sh.id}">{sh.ref}</a> · {w.cur} · {w.last}</div>
  <div class="row between">
    {#if sh.status !== 'Acknowledged'}<Badge status={eta.state}>{eta.state}{eta.state !== 'On time' ? ` ${hoursLabel(eta.hours)}` : ''}</Badge><span class="caption">ETA {fmtDateTime(eta.eta)}</span>{:else}<span class="caption">Delivered</span>{/if}
  </div>
  {#if od}<Badge tone="danger">No check-in at {w.next} · {hoursLabel(od.hours)} overdue</Badge>{/if}
{/snippet}

<style>
  .nowrap, .mono { white-space: nowrap; }
  .cc { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; font-size: 13px; }
</style>
