<script lang="ts">
  // V3-15: the live map for Shipments (and the Truck desk board). Trucks are small dots coloured by state; their
  // registration shows when zoomed in, on hover, or for the picked truck, so labels don't pile up when zoomed out.
  // Picking a truck (here or on its card) flies the map to it and draws its route: the part done solid, the rest dashed.
  // Leaflet loads lazily (not in any entry chunk).
  import { lookup, ref, type Shipment } from '@btw/api';
  import { onDestroy } from 'svelte';
  import { activeLeg, view } from './legs';
  // padRight: room the page keeps over the map on the right (the journey panel), so a picked route is framed beside it
  let { items, selected = null, hover = null, onselect, padRight = 0 }: { items: Shipment[]; selected?: string | null; hover?: string | null; onselect: (id: string | null) => void; padRight?: number } = $props();

  const r = ref();
  let el: HTMLDivElement;
  let L: typeof import('leaflet') | null = null;
  let map: import('leaflet').Map | null = null;
  let base: import('leaflet').LayerGroup | null = null, trucks: import('leaflet').LayerGroup | null = null, route: import('leaflet').LayerGroup | null = null;
  let ready = $state(false), zoom = $state(6), fitted = false;
  const LABEL_ZOOM = 8;

  const active = $derived(items.filter((s) => s.status !== 'Acknowledged'));
  const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  function position(sh: Shipment): [number, number] {
    const leg = activeLeg(sh);
    if (leg.lastPing) return [leg.lastPing.lat, leg.lastPing.lng];
    const i = Math.max(0, leg.passes.reduce((a, p, k) => (p.arrivedAt ? k : a), -1));
    const cp = lookup.checkpoint(leg.passes[i]?.checkpointId ?? leg.fromId);
    return cp ? [cp.lat, cp.lng] : [-1, 33];
  }

  function drawBase() {
    if (!L || !map) return;
    base?.remove(); base = L.layerGroup().addTo(map);
    const col: Record<string, string> = { border: css('--warning-solid'), warehouse: css('--success'), loading: css('--primary'), weighbridge: css('--text-subtle'), town: css('--text-subtle') };
    for (const cp of r.checkpoints) {
      L.circleMarker([cp.lat, cp.lng], { radius: cp.kind === 'town' || cp.kind === 'weighbridge' ? 3 : 5, color: css('--surface'), weight: 1.5, fillColor: col[cp.kind] ?? col.town, fillOpacity: 0.9 })
        .bindTooltip(`${esc(cp.name)}${cp.kind === 'border' ? ' · border' : ''}`).addTo(base);
    }
  }
  function drawTrucks() {
    if (!L || !map) return;
    trucks?.remove(); trucks = L.layerGroup().addTo(map);
    for (const sh of active) {
      const v = view(sh), reg = lookup.truck(activeLeg(sh).truckId)?.reg ?? '';
      const sel = sh.id === selected, hov = sh.id === hover, dim = !!selected && !sel;
      const colour = v.tone === 'bad' ? css('--danger') : v.tone === 'warn' ? css('--warning-solid') : css('--primary');
      const showLabel = sel || hov || zoom >= LABEL_ZOOM;
      const dot = `<span style="display:block;width:${sel ? 18 : 14}px;height:${sel ? 18 : 14}px;border-radius:50%;background:${colour};border:3px solid ${css('--surface')};box-shadow:0 1px 4px rgb(0 0 0/.35)${sel ? `,0 0 0 6px ${colour}33` : ''}"></span>`;
      const label = showLabel ? `<span style="position:absolute;left:50%;bottom:calc(100% + 4px);transform:translateX(-50%);white-space:nowrap;background:${sel ? colour : css('--surface')};color:${sel ? '#fff' : css('--text')};border:1px solid ${colour};border-radius:999px;padding:3px 8px;font:700 11.5px/1 Inter Variable,system-ui;box-shadow:0 1px 3px rgb(0 0 0/.2)">${esc(reg)}</span>` : '';
      const icon = L.divIcon({ className: '', iconSize: [0, 0], html: `<div style="position:absolute;transform:translate(-50%,-50%);opacity:${dim ? 0.45 : 1}">${label}${dot}</div>` });
      L.marker(position(sh), { icon, zIndexOffset: sel ? 2000 : v.tone === 'bad' ? 1000 : 500, keyboard: true, title: `${reg} · ${sh.status}` })
        .on('click', () => onselect(sh.id)).bindTooltip(showLabel ? '' : esc(reg), { direction: 'top', offset: [0, -8] }).addTo(trucks);
    }
  }
  function drawRoute() {
    if (!L || !map) return;
    route?.remove(); route = L.layerGroup().addTo(map);
    const sh = active.find((s) => s.id === selected) ?? items.find((s) => s.id === selected);
    if (!sh) return;
    const v = view(sh);
    const pts = v.stops.map((s) => { const c = lookup.checkpoint(s.id); return c ? ([c.lat, c.lng] as [number, number]) : null; }).filter((x): x is [number, number] => !!x);
    const cut = Math.max(0, v.at) + 1;
    const colour = v.late ? css('--danger') : css('--primary');
    if (cut > 1) L.polyline(pts.slice(0, cut), { color: colour, weight: 5, opacity: 0.85 }).addTo(route);
    if (cut < pts.length) L.polyline(pts.slice(Math.max(0, cut - 1)), { color: colour, weight: 4, opacity: 0.6, dashArray: '8 8' }).addTo(route);
    pts.forEach((p, i) => L!.circleMarker(p, { radius: i < cut ? 5 : 4, color: colour, weight: 2, fillColor: i < cut ? colour : css('--surface'), fillOpacity: 1 }).bindTooltip(esc(v.stops[i].name)).addTo(route!));
  }
  function fly() {
    if (!L || !map || !selected) return;
    const sh = items.find((s) => s.id === selected); if (!sh) return;
    // frame the whole route and the truck, beside the panel
    const pts: [number, number][] = [position(sh), ...view(sh).stops.map((s) => { const c = lookup.checkpoint(s.id); return c ? ([c.lat, c.lng] as [number, number]) : null; }).filter((x): x is [number, number] => !!x)];
    map.flyToBounds(L.latLngBounds(pts), { paddingTopLeft: [40, 40], paddingBottomRight: [padRight + 40, 40], maxZoom: 9, duration: 0.8 });
  }
  function fitAll() {
    if (!L || !map || !active.length) return;
    map.fitBounds(L.latLngBounds(active.map(position)).pad(0.25), { maxZoom: 7 });
  }

  async function init() {
    const mod = await import('leaflet');
    // @ts-ignore: CSS side-effect import
    await import('leaflet/dist/leaflet.css');
    L = (mod as any).default ?? mod;
    map = L!.map(el, { zoomControl: false, attributionControl: true }).setView([-0.8, 32.5], 6);
    L!.control.zoom({ position: 'bottomright' }).addTo(map);
    L!.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap contributors' }).addTo(map);
    map.on('zoomend', () => { zoom = map!.getZoom(); });
    map.on('click', () => onselect(null));
    drawBase();
    ready = true;
  }
  $effect(() => { init(); });
  // redraw when the list, the zoom, the picked or hovered truck changes
  $effect(() => { active; zoom; selected; hover; if (ready) { drawTrucks(); drawRoute(); } });
  $effect(() => { if (ready && !fitted && active.length) { fitted = true; fitAll(); } });
  $effect(() => { selected; if (ready) fly(); });
  // stop a running fly-to first: removing the map mid-animation throws "_leaflet_pos" (V3-6 fix)
  onDestroy(() => { if (!map) return; map.stop(); map.off(); map.remove(); map = null; });
  /** the page can ask the map to show every truck again */
  export function showAll() { onselect(null); fitAll(); }
  /** the map was hidden and is shown again (a view switch): let Leaflet measure itself */
  export function resize() { map?.invalidateSize(); }
</script>

<div class="lm" bind:this={el} role="application" aria-label="Map of the trucks"></div>

<style>
  .lm { width: 100%; height: 100%; min-height: 320px; border-radius: inherit; }
  :global(.leaflet-container) { font-family: inherit; }
  :global([data-theme='dark'] .lm .leaflet-tile-pane) { filter: brightness(.75) contrast(1.1) saturate(.8); }
</style>
