<script lang="ts" module>
  export type MapPoint = { id: string; lat: number; lng: number; label: string; state: 'done' | 'next' | 'todo' | 'place'; border?: boolean };
  export type MapTruck = { id: string; lat: number; lng: number; label: string; late?: boolean };
</script>
<script lang="ts">
  // Full-screen background map. Leaflet + OSM tiles are lazy-loaded (separate chunk), so the app shell paints first.
  // Colours come from design tokens; tiles are dimmed in dark mode. If tiles can't load (offline), markers still show.
  import { onDestroy } from 'svelte';
  let { points = [], route = [], trucks = [], padBottom = 280 }: { points?: MapPoint[]; route?: [number, number][]; trucks?: MapTruck[]; padBottom?: number } = $props();

  let el: HTMLDivElement;
  let L: typeof import('leaflet') | null = null;
  let map: import('leaflet').Map | null = null;
  let layer: import('leaflet').LayerGroup | null = null;
  let ready = $state(false);
  const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

  async function init() {
    const mod = await import('leaflet');
    // @ts-ignore — CSS side-effect import
    await import('leaflet/dist/leaflet.css');
    L = ((mod as any).default ?? mod) as typeof import('leaflet');
    map = L.map(el, { zoomControl: false, attributionControl: true }).setView([-1.3, 33], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(map);
    layer = L.layerGroup().addTo(map);
    ready = true;
  }
  $effect(() => { init(); });
  onDestroy(() => map?.remove());

  $effect(() => {
    // Redraw whenever inputs change.
    const pts = points, rt = route, tr = trucks, pad = padBottom;
    if (!ready || !L || !map || !layer) return;
    layer.clearLayers();
    const all: [number, number][] = [];
    if (rt.length > 1) {
      L.polyline(rt, { color: css('--primary'), weight: 5, opacity: 0.75 }).addTo(layer);
      all.push(...rt);
    }
    for (const p of pts) {
      const color = p.state === 'done' ? css('--success') : p.state === 'next' ? css('--accent') : p.state === 'place' ? css('--primary') : css('--text-subtle');
      const r = p.state === 'next' || p.state === 'place' ? 9 : 6;
      L.circleMarker([p.lat, p.lng], { radius: r, color: css('--surface'), weight: 2, fillColor: color, fillOpacity: 1 })
        .bindTooltip(p.label, { direction: 'top', permanent: p.state === 'next' || p.state === 'place', className: 'map-tip' }).addTo(layer);
      all.push([p.lat, p.lng]);
    }
    for (const t of tr) {
      const icon = L.divIcon({ className: '', html: `<div class="truck-pin${t.late ? ' late' : ''}"><span>${t.label.replace(/</g, '&lt;')}</span></div>`, iconSize: [0, 0] });
      L.marker([t.lat, t.lng], { icon, keyboard: false }).addTo(layer);
      all.push([t.lat, t.lng]);
    }
    if (all.length === 1) map.setView(all[0], 11);
    else if (all.length) map.fitBounds(L.latLngBounds(all), { paddingTopLeft: [36, 96], paddingBottomRight: [36, pad + 24], maxZoom: 12 });
  });
</script>
<div class="map" bind:this={el} aria-label="Map" role="img"></div>
<style>
  .map { position: fixed; inset: 0; z-index: 0; background: var(--surface-sunken); }
  :global(.map .leaflet-control-attribution) { font-size: 10px; margin-bottom: 0; }
  :global(:root[data-theme='dark'] .map .leaflet-tile-pane) { filter: brightness(.62) contrast(1.15) saturate(.6) hue-rotate(180deg) invert(1); }
  @media (prefers-color-scheme: dark) { :global(:root:not([data-theme='light']) .map .leaflet-tile-pane) { filter: brightness(.62) contrast(1.15) saturate(.6) hue-rotate(180deg) invert(1); } }
  :global(.map-tip) { font: 600 12px var(--ff-body); border-radius: 6px; padding: 2px 6px; }
  :global(.truck-pin) { position: absolute; transform: translate(-50%, -100%); white-space: nowrap; }
  :global(.truck-pin span) { display: inline-block; background: var(--primary); color: var(--text-on-primary); font: 700 12px var(--ff-body); padding: 4px 8px; border-radius: 8px; box-shadow: var(--elevation-2); }
  :global(.truck-pin.late span) { background: var(--danger-solid); color: var(--text-on-danger); }
</style>
