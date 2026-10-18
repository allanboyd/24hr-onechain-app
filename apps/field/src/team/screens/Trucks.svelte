<script lang="ts">
  // Trucks: every shipment as a card (status chips, search) or on the map. Tap → leg timeline.
  import { untrack } from 'svelte';
  import { shipments, type Shipment, type User } from '@btw/api';
  import { Badge } from '@btw/ui';
  import Search from '@lucide/svelte/icons/search';
  import TruckIcon from '@lucide/svelte/icons/truck';
  import MapIcon from '@lucide/svelte/icons/map';
  import List from '@lucide/svelte/icons/list';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import { cpShort, legPosition } from '../../lib';
  import CompanyDot from '../../components/CompanyDot.svelte';
  import { co } from '../company.svelte';
  import { Res, onRefresh } from '../load.svelte';
  import { currentLeg, etaText, truckReg } from '../shipment';
  import Chips from '../components/Chips.svelte';
  import Skeleton from '../components/Skeleton.svelte';
  import Empty from '../components/Empty.svelte';
  import ErrorNote from '../components/ErrorNote.svelte';
  import type { View } from '../routes';
  let { query }: { user: User; view: View; query: URLSearchParams } = $props();

  const r = new Res(() => shipments.list());
  $effect(() => r.live());
  $effect(() => onRefresh(() => r.reload()));

  const FILTERS: Record<string, (s: Shipment) => boolean> = {
    road: (s) => !['Acknowledged', 'Cancelled', 'Planned'].includes(s.status),
    delayed: (s) => s.status === 'Delayed',
    border: (s) => s.legs.some((l) => l.status === 'At border'),
    planned: (s) => s.status === 'Planned',
    delivered: (s) => s.status === 'Acknowledged',
    all: () => true,
  };
  const q0 = untrack(() => ({ f: query.get('f'), map: query.get('view') === 'map' }));
  let f = $state(q0.f && q0.f in FILTERS ? q0.f : 'road');
  let mapView = $state(q0.map);
  let q = $state('');
  const all = $derived(r.data ?? []);
  const chips = $derived([
    { id: 'road', label: 'On the road', count: all.filter(FILTERS.road).length },
    { id: 'delayed', label: 'Delayed', count: all.filter(FILTERS.delayed).length },
    { id: 'border', label: 'At a border', count: all.filter(FILTERS.border).length },
    { id: 'planned', label: 'Planned', count: all.filter(FILTERS.planned).length },
    { id: 'delivered', label: 'Delivered', count: all.filter(FILTERS.delivered).length },
    { id: 'all', label: 'All', count: all.length },
  ]);
  const list = $derived(all.filter(FILTERS[f]).filter((s) => {
    if (!q.trim()) return true;
    const t = q.trim().toLowerCase(); const leg = currentLeg(s);
    return s.ref.toLowerCase().includes(t) || truckReg(leg).toLowerCase().includes(t) || cpShort(leg.toId).toLowerCase().includes(t);
  }));
  const pins = $derived(list.filter((s) => FILTERS.road(s)).map((s) => { const leg = currentLeg(s); const p = legPosition(leg); return { id: s.id, lat: p.lat, lng: p.lng, label: truckReg(leg) || s.ref, late: s.status === 'Delayed' }; }));
  let MapView = $state<any>(null);
  $effect(() => { if (mapView && !MapView) import('../../components/MapView.svelte').then((m) => (MapView = m.default)); });
</script>

{#if mapView}
  {#if MapView}<MapView trucks={pins} padBottom={260} />{/if}
  <div class="map-ui">
    <button class="toggle" onclick={() => (mapView = false)}><List size={18} />List</button>
    <div class="strip">
      {#each list.filter((s) => FILTERS.road(s)) as s (s.id)}
        {@const leg = currentLeg(s)}
        <a class="mini t-press" href="#/trucks/{s.id}"><span class="t-row between"><strong>{truckReg(leg) || s.ref}</strong><Badge status={s.status} /></span><span class="t-meta t-ellipsis">{cpShort(leg.fromId)} → {cpShort(leg.toId)}</span><span class="t-meta">{etaText(leg)}</span></a>
      {:else}<div class="mini"><strong>No trucks on the road</strong></div>{/each}
    </div>
  </div>
{:else}
  <div class="t-row">
    <label class="t-search grow"><Search size={20} /><input type="search" placeholder="Search ref, truck or place" bind:value={q} aria-label="Search trucks" /></label>
    <button class="maptoggle t-press" onclick={() => (mapView = true)} aria-label="Show on map"><MapIcon size={22} /></button>
  </div>
  <Chips options={chips} bind:value={f} label="Truck status" />
  <ErrorNote error={r.error} onretry={() => r.reload()} />
  {#if r.loading}
    <Skeleton rows={6} />
  {:else if list.length}
    <div class="t-list">
      {#each list as s (s.id)}
        {@const leg = currentLeg(s)}
        <a class="t-item" href="#/trucks/{s.id}">
          <span class="t-icon st-{s.status.replace(/\s/g, '')}"><TruckIcon size={22} /></span>
          <span class="t-main">
            <span class="t-line1">{#if co.active === null}<CompanyDot entityId={s.entityId} />{/if}<span class="t-ellipsis">{truckReg(leg) || s.ref}</span><Badge status={s.status} /></span>
            <span class="t-meta t-ellipsis">{cpShort(leg.fromId)} → {cpShort(leg.toId)}</span>
            <span class="t-meta">{s.ref} · {etaText(leg)}</span>
          </span>
          <ChevronRight class="t-chev" size={20} />
        </a>
      {/each}
    </div>
  {:else}
    <Empty title={q ? 'No match' : 'No trucks here'} text={q ? 'Try another reference or truck number.' : 'Nothing in this list right now.'} />
  {/if}
{/if}

<style>
  .grow { flex: 1; min-width: 0; }
  .maptoggle { width: 48px; height: 48px; border-radius: 14px; border: 1px solid var(--t-line); background: var(--t-card); color: var(--text); display: grid; place-items: center; box-shadow: var(--t-shadow); cursor: pointer; flex: none; }
  .t-icon.st-Delayed { background: var(--danger-subtle); color: var(--danger); }
  .t-icon.st-Atborder { background: var(--warning-subtle); color: var(--warning); }
  .t-icon.st-Intransit, .t-icon.st-Dispatched { background: var(--info-subtle); color: var(--info); }
  .t-icon.st-Acknowledged, .t-icon.st-Arrived { background: var(--success-subtle); color: var(--success); }
  .map-ui { position: fixed; left: 0; right: 0; bottom: calc(env(safe-area-inset-bottom) + var(--t-nav) + 12px); z-index: 5; display: flex; flex-direction: column; gap: 10px; pointer-events: none; }
  .map-ui > * { pointer-events: auto; }
  .toggle { align-self: flex-start; margin-left: 16px; height: 44px; padding: 0 16px; border-radius: 22px; border: 0; background: var(--surface); color: var(--text); box-shadow: var(--elevation-2); font: 700 15px var(--ff-body); display: inline-flex; align-items: center; gap: 8px; cursor: pointer; }
  .strip { display: flex; gap: 10px; overflow-x: auto; padding: 4px 16px 6px; scroll-snap-type: x mandatory; scrollbar-width: none; }
  .mini { flex: none; width: 250px; scroll-snap-align: start; display: flex; flex-direction: column; gap: 4px; padding: 12px 14px; border-radius: 18px; background: var(--surface); color: var(--text); text-decoration: none; box-shadow: var(--elevation-3); border: 1px solid var(--t-line); transition: transform var(--motion-fast); }
</style>
