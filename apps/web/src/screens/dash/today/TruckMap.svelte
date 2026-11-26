<script lang="ts" module>
  import { lookup, type Leg, type Shipment } from '@btw/api';
  import { TRUCK_CASES } from '@btw/api/rules';

  const legNow = (sh: Shipment): Leg | undefined => sh.legs.find((l) => l.status !== 'Acknowledged' && l.status !== 'Cancelled') ?? sh.legs.at(-1);
  /** Green is on time, yellow is delayed, red is loaded past the truck's case limit. */
  export function truckStanding(sh: Shipment): 'On time' | 'Delayed' | 'Over the limit' {
    const leg = legNow(sh);
    if (!leg) return 'On time';
    const loaded = leg.lines.reduce((a, l) => a + l.loadedQty, 0);
    const cap = lookup.truck(leg.truckId)?.capacityCases || TRUCK_CASES;
    if (loaded > cap) return 'Over the limit';
    if (sh.status === 'Delayed') return 'Delayed';
    return 'On time';
  }
</script>

<script lang="ts">
  // Compact map for the Overview. Shows where the trucks are now. Filters come later.
  import { onDestroy } from 'svelte';

  const TRUCK = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>';

  let { items }: { items: Shipment[] } = $props();

  let el = $state<HTMLDivElement>();
  let L: typeof import('leaflet') | null = null;
  let map: import('leaflet').Map | null = null;
  let layer: import('leaflet').LayerGroup | null = null;

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
    const ink = { 'On time': css('--success'), Delayed: css('--warning-solid'), 'Over the limit': css('--danger') };
    const pins: { at: [number, number]; reg: string; standing: string }[] = [];
    for (const sh of items) {
      const leg = legNow(sh);
      const at = leg ? position(leg) : null;
      if (!leg || !at) continue;
      pins.push({ at, reg: lookup.truck(leg.truckId)?.reg ?? 'Truck', standing: truckStanding(sh) });
    }
    pins.sort((a, b) => a.at[1] - b.at[1]);
    const spots = pins.map((p) => p.at);
    pins.forEach((pin, i) => {
      const color = ink[pin.standing as keyof typeof ink] || ink['On time'];
      const lift = 12 + (i % 2) * 18;
      const side = i % 2 === 0 ? '-100%' : '0%';
      const reg = pin.reg.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
      const icon = L!.divIcon({
        className: '',
        iconSize: [0, 0],
        html: `<div style="position:absolute;left:0;top:0;transform:translate(${side},calc(-100% - ${lift}px));background:${css('--surface')};color:${css('--text')};border:1px solid ${css('--border')};display:inline-flex;align-items:center;gap:6px;font:700 12px/1 Inter Variable,system-ui;padding:3px 8px 3px 3px;border-radius:999px;white-space:nowrap;box-shadow:0 2px 6px rgb(0 0 0 / .28)"><span style="display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:${color};color:${pin.standing === 'Delayed' ? css('--primary') : css('--nav-strong')}">${TRUCK}</span>${reg}</div><div style="position:absolute;left:-5px;top:-5px;width:10px;height:10px;border-radius:50%;background:${color};border:2px solid ${css('--surface')}"></div>`,
      });
      L!.marker(pin.at, { icon, title: `${pin.reg}, ${pin.standing}`, zIndexOffset: 500 + i }).addTo(layer!);
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

<div class="wrap">
  <div class="map" bind:this={el}></div>
  <ul class="key">
    <li><i class="ok"></i>On time</li>
    <li><i class="late"></i>Delayed</li>
    <li><i class="over"></i>Over the limit</li>
  </ul>
</div>

<style>
  .wrap { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
  .key { display: flex; flex-wrap: wrap; gap: 12px; margin: 0; padding: 0; list-style: none; font-size: 12px; color: var(--text-muted); }
  .key li { display: inline-flex; align-items: center; gap: 6px; }
  .key i { width: 10px; height: 10px; border-radius: 50%; }
  .ok { background: var(--success); }
  .late { background: var(--warning-solid); }
  .over { background: var(--danger); }
  .map { width: 100%; height: 280px; border-radius: var(--radius-md); overflow: hidden; isolation: isolate; z-index: 0; background: var(--surface-sunken); }
  .map :global(.leaflet-container) { height: 100%; width: 100%; font: inherit; background: var(--surface-sunken); }
  :global([data-theme='dark'] .leaflet-tile-pane) { filter: brightness(.75) contrast(1.1) saturate(.8); }
  @media (prefers-color-scheme: dark) { :global(:root:not([data-theme='light']) .leaflet-tile-pane) { filter: brightness(.75) contrast(1.1) saturate(.8); } }
</style>
