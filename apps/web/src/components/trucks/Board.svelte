<script lang="ts">
  // Truck desk · Board: every truck by where it is now. Status counts on top (the shared metric registry, so they equal
  // Home and the Shipments page), filters in the address, the truck list (cards on phones); a click opens the drawer.
  import { lookup, ref, type Shipment, type User } from '@btw/api';
  import { ON_ROAD, TRUCK_STATES, waitLabel, type DeskKpis, type TruckRow, type TruckState } from '@btw/api/trucks';
  import { Badge, ago, fmtDateTime, fmtNum } from '@btw/ui';
  import { SummaryStrip, DataTable, queryFilters, tableQuery, type Column, type SummaryTile } from '../page';
  import { company, GROUP } from '../../lib/company.svelte';
  import { companyLabel } from '../../lib/companies';
  import CompanyMark from '../CompanyMark.svelte';
  import ExportMenu from '../ExportMenu.svelte';
  import { infoOf } from '../../lib/tiles';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  let { user, rows, ships, k, loaded, onopen }: {
    user: User; rows: TruckRow[]; ships: Shipment[]; k: DeskKpis; loaded: boolean; onopen: (x: TruckRow) => void;
  } = $props();

  const r = ref();
  // filters in the address: #/trucks?show=delayed&provider=pr-ets (`state` also takes any truck state, as before)
  const f = queryFilters({ show: '', state: '', provider: '', route: '', lp: '', q: '' });
  // V3-8 batch 2: search and the State / Provider / Route filters sit in the table (kept in the address, as before);
  // the loading point and the idle-trucks fold stay in its toolbar
  const tq = tableQuery(f, { search: 'q', filters: { state: 'state', provider: 'provider', route: 'route' } });
  function clearAll() { f.clear(); }

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
  // the strip (Show) and the loading point choose the rows; the table applies search + its filters on top
  const list = $derived(rows.filter((x) => { const v = f.values; return (!v.show || SHOW[v.show]?.(x) !== false) && (!v.lp || atPoint(x, v.lp)); }));
  // idle trucks (no trip, no queue) fold away unless asked for, so the board opens on the trucks that are moving
  let showIdle = $state(false);
  const foldIdle = $derived(!showIdle && !f.values.state && !f.values.q.trim());
  const idleCount = $derived(foldIdle ? list.filter((x) => x.state === 'Idle').length : 0);
  const shown = $derived(foldIdle ? list.filter((x) => x.state !== 'Idle') : list);

  const routeName = (id?: string | null) => (id ? r.routes.find((x) => x.id === id)?.name ?? id : '-');
  const searchExtra = (x: TruckRow) => `${x.truck.trailer} ${x.shipmentRef ?? ''} ${x.driver?.name ?? ''} ${x.provider?.name ?? ''}`;
  const columns = $derived<Column<TruckRow>[]>([
    { key: 'truck', label: 'Truck', sticky: true, mobile: 'title', value: (x) => x.truck.reg, cell: truckCell },
    ...(company.active === GROUP ? [{ key: 'company', label: 'Company', value: (x: TruckRow) => (x.entityId ? companyLabel(x.entityId) : '-'), cell: companyCell, hideBelow: 900, filter: 'select' as const }] : []),
    { key: 'state', label: 'State', value: (x) => stateLabel(x.state), cell: stateCell, filter: 'select', filterValue: (x) => x.state, filterLabel: (v) => stateLabel(v as TruckState), mobile: 'aside' },
    { key: 'where', label: 'Where now', value: (x) => x.where, cell: whereCell, class: 'small' },
    { key: 'eta', label: 'ETA', sortValue: (x) => (x.eta && x.state !== 'Waiting' && x.state !== 'Idle' ? x.eta.eta : ''), value: (x) => (x.eta && x.state !== 'Waiting' && x.state !== 'Idle' ? fmtDateTime(x.eta.eta) : '-'), cell: etaCell, class: 'small', hideBelow: 900 },
    { key: 'driver', label: 'Driver', value: (x) => x.driver?.name ?? '-', cell: driverCell, class: 'small', hideBelow: 1000 },
    { key: 'provider', label: 'Provider', value: (x) => x.provider?.name ?? '-', filter: 'select', filterValue: (x) => x.truck.providerId, filterLabel: (id) => lookup.provider(id)?.name ?? id, class: 'small', hideBelow: 1100 },
    { key: 'route', label: 'Route', value: (x) => routeName(x.routeId), filter: 'select', filterValue: (x) => x.routeId ?? '', filterLabel: routeName, class: 'small', hideBelow: 1300 },
    { key: 'issues', label: 'Issues', sortValue: (x) => x.issues.length, value: (x) => x.issues[0]?.reason ?? '-', cell: issuesCell, class: 'small' },
    { key: 'days', label: 'Days since move', align: 'right', sortValue: (x) => x.daysSinceMove ?? -1, value: (x) => (x.daysSinceMove == null ? '-' : String(x.daysSinceMove)), cell: daysCell },
  ]);
  const exportTrucks = () => [['Truck', 'Trailer', 'Provider', 'Driver', 'State', 'Where', 'Position source', 'Last position at', 'Shipment', 'ETA', 'ETA state', 'Open issues', 'Queue', 'Queue position', 'Waiting (h)', 'Days since last move'],
    ...list.map((x) => [x.truck.reg, x.truck.trailer, x.provider?.name ?? '', x.driver?.name ?? '', stateLabel(x.state), x.where, x.position?.source ?? '', x.position?.at ?? '', x.shipmentRef ?? '', x.eta?.eta ?? '', x.eta ? `${x.eta.state}${x.eta.hours ? ` ${x.eta.hours} h` : ''}` : '', x.issues.map((i) => `${i.reason} (${i.place})`).join('; '), x.loadingPointId ? lpName(x.loadingPointId) : '', x.queuePosition ?? '', x.waitingHours !== undefined ? Math.round(x.waitingHours * 10) / 10 : '', x.daysSinceMove ?? ''])];
</script>

<SummaryStrip {tiles} bind:value={f.values.show} param="show" label="Trucks by status" noun="trucks" total={loaded ? rows.length : null} shown={loaded ? list.length : null} />
<DataTable id="truck-board" label="Trucks" noun="trucks" rows={loaded ? shown : null} {columns} rowKey={(x) => x.truck.id} onrowclick={onopen} initialSort={{ key: 'state', dir: 'asc' }} filename="truck-desk" onclear={clearAll}
  searchable searchPlaceholder="Truck, driver, provider, shipment, place" {searchExtra} bind:search={tq.search.get, tq.search.set} bind:filters={tq.filters.get, tq.filters.set}
  emptyTitle={idleCount ? 'Only idle trucks here' : 'No truck matches these filters'}>
  {#snippet toolbar()}
    <label class="lp"><span class="caption">Loading point</span><select class="select" value={f.values.lp} onchange={(e) => f.set('lp', e.currentTarget.value)}><option value="">All</option>{#each myPoints as s}<option value={s.id}>{s.code} {s.city}</option>{/each}</select></label>
    {#if idleCount}<button class="btn btn-ghost btn-sm" onclick={() => (showIdle = true)}>Show {idleCount} idle truck{idleCount === 1 ? '' : 's'}</button>{/if}
    <ExportMenu name="truck-desk" rows={exportTrucks} />
  {/snippet}
</DataTable>

{#snippet truckCell(x: TruckRow)}<strong>{x.truck.reg}</strong><div class="caption">{x.truck.trailer || '-'} · {fmtNum(x.truck.capacityCases)} cases</div>{/snippet}
{#snippet companyCell(x: TruckRow)}{#if x.entityId}<span class="cc"><CompanyMark entityId={x.entityId} size={18} />{companyLabel(x.entityId)}</span>{:else}-{/if}{/snippet}
{#snippet stateCell(x: TruckRow)}<Badge tone={tone(x.state)}>{stateLabel(x.state)}</Badge>{#if x.state === 'Waiting'}<div class="caption">#{x.queuePosition} · {waitLabel(x.waitingHours)}</div>{/if}{/snippet}
{#snippet whereCell(x: TruckRow)}{x.where}{#if x.position}<div class="caption">{x.position.source === 'gps' ? 'GPS' : x.position.source === 'checkpoint' ? 'last check-in' : 'loading point'}{x.position.at ? ` · ${ago(x.position.at)}` : ''}</div>{/if}{/snippet}
{#snippet etaCell(x: TruckRow)}{#if x.eta && x.state !== 'Waiting' && x.state !== 'Idle'}{fmtDateTime(x.eta.eta)}<div class="caption" class:late={x.eta.state === 'Late'}>{x.eta.state}{x.eta.hours ? ` ${x.eta.hours} h` : ''} · to {lookup.checkpoint(x.toId ?? '')?.name ?? ''}</div>{:else}-{/if}{/snippet}
{#snippet driverCell(x: TruckRow)}{x.driver?.name ?? '-'}{#if x.driver && !x.driver.hasApp}<div class="caption">SMS</div>{/if}{/snippet}
{#snippet issuesCell(x: TruckRow)}{#if x.issues.length}<span class="issue"><TriangleAlert size={14} />{x.issues[0].reason}</span>{#if x.issues.length > 1}<div class="caption">+{x.issues.length - 1} more</div>{/if}{:else}-{/if}{/snippet}
{#snippet daysCell(x: TruckRow)}<span class:stale={(x.daysSinceMove ?? 0) >= 7}>{x.daysSinceMove ?? '-'}</span>{/snippet}

<style>
  .late { color: var(--danger); font-weight: 600; }
  .stale { color: var(--warning); font-weight: 600; }
  .issue { display: inline-flex; align-items: center; gap: 4px; color: var(--danger); font-weight: 600; }
  .cc { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; font-size: 13px; }
  .lp { display: inline-flex; align-items: center; gap: 6px; } .lp .select { width: auto; }
</style>
