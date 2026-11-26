<script lang="ts">
  // Compact map for the Overview. Shows where the trucks are now. Filters come later.
  import { lookup, type Leg, type Shipment } from '@btw/api';
  import { onDestroy } from 'svelte';

  let { items }: { items: Shipment[] } = $props();

  let el = $state<HTMLDivElement>();
  let L: typeof import('leaflet') | null = null;
  let map: import('leaflet').Map | null = null;
  let layer: import('leaflet').LayerGroup | null = null;

  const legOf = (sh: Shipment): Leg | undefined => sh.legs.find((l) => l.status !== 'Acknowledged' && l.status !== 'Cancelled') ?? sh.legs.at(-1);
  function position(leg: Leg): [number, number] | null {
    if (leg.lastPing) return [leg.lastPing.lat, leg.lastPing.lng];
    const hit = [...leg.passes].reverse().find((p) => p.arrivedAt) ?? leg.passes[0];
    const cp = hit ? lookup.checkpoint(hit.checkpointId) : undefined;
    return cp ? [cp.lat, cp.lng] : null;
  }
  const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

  function draw() {
    if (!L || !map) return;
    layer?.remove();
    layer = L.layerGroup().addTo(map);
    const pins: { at: [number, number]; reg: string; status: string }[] = [];
    for (const sh of items) {
      const leg = legOf(sh);
      const at = leg ? position(leg) : null;
      if (!leg || !at) continue;
      pins.push({ at, reg: lookup.truck(leg.truckId)?.reg ?? 'Truck', status: sh.status });
    }
    pins.sort((a, b) => a.at[1] - b.at[1]);
    const spots = pins.map((p) => p.at);
    pins.forEach((pin, i) => {
      const bg = css('--primary');
      const fg = css('--nav-strong');
      const lift = 12 + (i % 2) * 18;
      const side = i % 2 === 0 ? '-100%' : '0%';
      const icon = L!.divIcon({
        className: '',
        iconSize: [0, 0],
        html: `<div style="position:absolute;left:0;top:0;transform:translate(${side},calc(-100% - ${lift}px));background:${bg};color:${fg};border:0;display:inline-flex;align-items:center;font:700 12px/1 Inter Variable,system-ui;padding:5px 8px;border-radius:999px;white-space:nowrap;box-shadow:0 2px 6px rgb(0 0 0 / .28)">${pin.reg}</div><div style="position:absolute;left:-5px;top:-5px;width:10px;height:10px;border-radius:50%;background:${bg};border:2px solid ${css('--surface')}"></div>`,
      });
      L!.marker(pin.at, { icon, title: `${pin.reg}, ${pin.status}`, zIndexOffset: 500 + i }).addTo(layer!);
    });
    if (spots.length === 1) map.setView(spots[0], 6);
    else if (spots.length) map.fitBounds(spots, { padding: [36, 48], maxZoom: 6 });
    map.invalidateSize();
  }

  $effect(() => {
    const node = el;
    if (!node) return;
    let dead = false;
    (async () => {
      const mod = await import('leaflet');
      await import('leaflet/dist/leaflet.css');
      if (dead) return;
      L = (mod as { default?: typeof import('leaflet') }).default ?? mod;
      map = L.map(node, { zoomControl: true, attributionControl: false }).setView([-0.8, 32.5], 6);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map);
      if (node.clientWidth > 40) { seen = node.clientWidth; map.invalidateSize(); draw(); }
    })();
    let seen = 0;
    const watchSize = new ResizeObserver(() => {
      if (!map) return;
      const w = node.clientWidth;
      if (w < 40 || w === seen) return;
      seen = w;
      map.invalidateSize();
      draw();
    });
    watchSize.observe(node);
    return () => { dead = true; watchSize.disconnect(); };
  });
  $effect(() => { items; if (map) draw(); });
  onDestroy(() => map?.remove());
</script>

<div class="map" bind:this={el}></div>

<style>
  .map { width: 100%; height: 280px; border-radius: var(--radius-md); overflow: hidden; isolation: isolate; z-index: 0; background: var(--surface-sunken); }
  .map :global(.leaflet-container) { height: 100%; width: 100%; font: inherit; background: var(--surface-sunken); }
  :global([data-theme='dark'] .leaflet-tile-pane) { filter: brightness(.75) contrast(1.1) saturate(.8); }
  @media (prefers-color-scheme: dark) { :global(:root:not([data-theme='light']) .leaflet-tile-pane) { filter: brightness(.75) contrast(1.1) saturate(.8); } }
</style>
