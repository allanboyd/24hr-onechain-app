<script lang="ts">
  import { watch } from '../lib/load.svelte';
  import ErrorState from '../components/ErrorState.svelte';
  // TR-02 / TR-03: active-truck list + map. Leaflet is lazy-loaded so it is not part of the main bundle.
  import { lookup, ref, shipments, tracking, type Leg, type Shipment, type User } from '@btw/api';
  import { Badge, ago, fmtDateTime, hoursLabel } from '@btw/ui';
  import { onDestroy } from 'svelte';
  let { user }: { user: User } = $props();

  const r = ref();
  let list = $state<Shipment[]>([]);
  let el: HTMLDivElement;
  let L: typeof import('leaflet') | null = null;
  let map: import('leaflet').Map | null = null;
  let layer: import('leaflet').LayerGroup | null = null;
  const markers = new Map<string, import('leaflet').Marker>();
  let selected = $state<string | null>(null);

  const active = $derived(list.filter((s) => s.status !== 'Acknowledged')
    .filter((sh) => !user.roles.includes('receiver') || user.roles.includes('director') || user.warehouseIds.includes(sh.warehouseId)));
  const legOf = (sh: Shipment): Leg => sh.legs.find((l) => l.status !== 'Acknowledged') ?? sh.legs.at(-1)!;

  function position(leg: Leg): [number, number] {
    if (leg.lastPing) return [leg.lastPing.lat, leg.lastPing.lng];
    const i = leg.passes.reduce((a, p, k) => (p.arrivedAt ? k : a), 0);
    const cp = lookup.checkpoint(leg.passes[i].checkpointId)!;
    return [cp.lat, cp.lng];
  }
  const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

  function draw() {
    if (!L || !map) return;
    layer?.remove();
    layer = L.layerGroup().addTo(map);
    markers.clear();
    const col = { border: css('--warning-solid'), warehouse: css('--success'), loading: css('--primary'), weighbridge: css('--text-subtle'), town: css('--text-subtle') };
    for (const cp of r.checkpoints) {
      L.circleMarker([cp.lat, cp.lng], { radius: cp.kind === 'town' || cp.kind === 'weighbridge' ? 4 : 6, color: css('--surface'), weight: 1.5, fillColor: col[cp.kind], fillOpacity: 1 })
        .bindTooltip(`${cp.name}${cp.kind === 'border' ? ' · border' : ''}`).addTo(layer);
    }
    for (const sh of active) {
      const leg = legOf(sh);
      const route = lookup.route(leg.routeId)!;
      const pts = route.stops.map((s) => { const c = lookup.checkpoint(s.checkpointId)!; return [c.lat, c.lng] as [number, number]; });
      const late = sh.status === 'Delayed' || shipments.eta(leg).state === 'Late';
      L.polyline(pts, { color: late ? css('--danger') : css('--link'), weight: 3, opacity: 0.55, dashArray: '6 6' }).addTo(layer);
      const eta = shipments.eta(leg);
      const t = lookup.truck(leg.truckId);
      const bg = late ? css('--danger-solid') : css('--accent');
      const fg = late ? css('--text-on-danger') : css('--text-on-accent');
      const gps = !!leg.lastPing;
      // GPS position = solid label; checkpoint-only position = outlined label with a dashed border
      const style = gps ? `background:${bg};color:${fg};border:2px solid ${bg}` : `background:${css('--surface')};color:${css('--text')};border:2px dashed ${bg}`;
      const icon = L.divIcon({ className: '', iconSize: [0, 0], html: `<div style="position:absolute;left:0;top:0;transform:translate(-50%,calc(-100% - 8px));${style};font:700 12px/1 Inter Variable,system-ui;padding:5px 7px;border-radius:4px;white-space:nowrap;box-shadow:0 2px 6px rgb(0 0 0 / .35)">${t?.reg ?? ''}</div><div style="position:absolute;left:-6px;top:-6px;width:12px;height:12px;border-radius:50%;background:${bg};border:2px solid ${css('--surface')};box-shadow:0 1px 3px rgb(0 0 0 / .4)"></div>` });
      const od = tracking.overdue(leg);
      const m = L.marker(position(leg), { icon, zIndexOffset: late ? 1000 : 500, riseOnHover: true, title: `${t?.reg} — ${sh.status}` }).bindPopup(
        `<strong>${t?.reg}</strong> · ${lookup.driver(leg.driverId)?.name}<br>${route.name}<br>${sh.status} · ETA ${eta.state}${eta.state !== 'On time' ? ' ' + hoursLabel(eta.hours) : ''} · ${fmtDateTime(eta.eta)}<br><em>${gps ? `GPS ${ago(leg.lastPing!.at)}` : 'Position = last checkpoint (no GPS)'}</em>${od ? `<br><strong>No check-in · ${hoursLabel(od.hours)} overdue</strong>` : ''}<br><a href="#/shipments/${sh.id}">Open ${sh.ref}</a>`,
      ).addTo(layer);
      markers.set(sh.id, m);
    }
  }

  async function init() {
    const mod = await import('leaflet');
    // @ts-ignore — CSS side-effect import (typed by vite/client)
    await import('leaflet/dist/leaflet.css');
    L = (mod as any).default ?? mod;
    map = L!.map(el, { zoomControl: true, attributionControl: true }).setView([-0.8, 32.5], 6);
    L!.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap contributors' }).addTo(map);
    draw();
  }
  async function load() { list = await shipments.list(); draw(); }
  $effect(() => { init(); });
  const w = watch(load);
  onDestroy(() => map?.remove());

  function focus(sh: Shipment) {
    selected = sh.id;
    const m = markers.get(sh.id);
    if (m && map) { map.setView(m.getLatLng(), 8); m.openPopup(); }
  }
</script>

<div class="page-head">
  <div><div class="overline crumb">Logistics</div><h1>Tracking</h1></div>
  <div class="row small muted">
    <span class="legend"><i style="background:var(--primary)"></i>Loading point</span>
    <span class="legend"><i style="background:var(--warning-solid)"></i>Border</span>
    <span class="legend"><i style="background:var(--success)"></i>Warehouse</span>
    <span class="legend"><i style="background:var(--text-subtle)"></i>Town / weighbridge</span>
    <span class="legend"><b class="tag solid">KDA</b>GPS position</span>
    <span class="legend"><b class="tag dashed">KDA</b>Last checkpoint</span>
  </div>
</div>
<ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />

<div class="layout">
  <aside class="card flush list">
    <header><h3>Active trucks</h3><span class="caption">{active.length}</span></header>
    <ul>
      {#each active as sh (sh.id)}
        {@const leg = legOf(sh)}
        {@const eta = shipments.eta(leg)}
        {@const od = tracking.overdue(leg)}
        {@const dw = tracking.dwell(leg)}
        <li><button class:sel={selected === sh.id} onclick={() => focus(sh)}>
          <div class="row between"><strong>{lookup.truck(leg.truckId)?.reg}</strong><Badge status={sh.status} /></div>
          <div class="small muted">{lookup.route(leg.routeId)?.name}</div>
          <div class="row between">
            <Badge status={eta.state}>{eta.state}{eta.state !== 'On time' ? ` ${hoursLabel(eta.hours)}` : ''}</Badge>
            <span class="caption">{eta.nextCheckpointId ? `Next: ${lookup.checkpoint(eta.nextCheckpointId)?.name?.split(' (')[0]}` : ''}</span>
          </div>
          {#if od}<Badge tone="danger">No check-in · {hoursLabel(od.hours)} overdue</Badge>{:else if dw}<Badge tone={dw.over ? 'warning' : 'neutral'}>{hoursLabel(dw.hours)} at {lookup.checkpoint(dw.checkpointId)?.name?.split(' (')[0]} · plan {hoursLabel(dw.plannedDwellHours)}</Badge>{/if}
          <div class="caption">{leg.lastPing ? `GPS ping ${ago(leg.lastPing.at)}` : 'No GPS — shown at last checkpoint'}</div>
        </button></li>
      {:else}<li class="empty">No trucks on the road</li>{/each}
    </ul>
  </aside>
  <div class="card flush mapcard"><div class="map" bind:this={el}></div></div>
</div>

<style>
  .layout { display: grid; grid-template-columns: 320px minmax(0, 1fr); gap: var(--space-4); height: calc(100vh - 190px); min-height: 480px; }
  .list { display: flex; flex-direction: column; min-height: 0; }
  .list ul { list-style: none; margin: 0; padding: 0; overflow-y: auto; }
  .list li button { all: unset; box-sizing: border-box; display: flex; flex-direction: column; gap: var(--space-1); width: 100%; padding: var(--space-3) var(--space-5); border-bottom: 1px solid var(--border); cursor: pointer; }
  .list li button:hover, .list li button.sel { background: var(--primary-subtle); }
  .list li button:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: -2px; }
  .mapcard { min-height: 0; }
  .map { width: 100%; height: 100%; min-height: 420px; }
  .legend { display: inline-flex; align-items: center; gap: 6px; }
  .tag { font: 700 10px/1 var(--ff-body); padding: 2px 4px; border-radius: var(--radius-sm); }
  .tag.solid { background: var(--accent); color: var(--text-on-accent); border: 1px solid var(--accent); }
  .tag.dashed { background: var(--surface); color: var(--text); border: 1px dashed var(--accent); }
  .legend i { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
  :global(.leaflet-popup-content a) { color: var(--link); }
  :global([data-theme='dark'] .leaflet-tile-pane) { filter: brightness(.75) contrast(1.1) saturate(.8); }
  @media (prefers-color-scheme: dark) { :global(:root:not([data-theme='light']) .leaflet-tile-pane) { filter: brightness(.75) contrast(1.1) saturate(.8); } }
  @media (max-width: 900px) { .layout { grid-template-columns: minmax(0, 1fr); height: auto; } .list ul { max-height: 280px; } .map { height: 60vh; } }
</style>
