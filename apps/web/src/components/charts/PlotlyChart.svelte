<script lang="ts" module>
  // Plotly loads on first use only (≈490 KB gz, never in the web entry). Cached for every chart after that.
  let mod: Promise<any> | null = null;
  export const loadPlotly = () => (mod ??= import('plotly.js-cartesian-dist-min').then((m) => m.default ?? m));
</script>
<script lang="ts">
  import { onMount } from 'svelte';
  import { readTheme, themeTick, watchTheme, type Theme } from './theme.svelte';

  export interface PlotPoint { x: any; y: any; label?: string; curveNumber: number; pointIndex: number; seriesName?: string; customdata?: any }
  let { spec, height = 260, label, filename = 'chart', zoom = true, onselect }: {
    /** Builds Plotly traces + layout overrides from the current theme (re-run on theme change). */
    spec: (t: Theme, ctx: { narrow: boolean }) => { data: any[]; layout?: Record<string, any> };
    height?: number; label: string; filename?: string; zoom?: boolean;
    onselect?: (p: PlotPoint) => void;
  } = $props();

  let el = $state<HTMLDivElement>();
  let Plotly = $state<any>(null);
  let failed = $state(false);
  let narrow = $state(false); // < 560px: charts shorten labels
  onMount(() => {
    watchTheme();
    let alive = true;
    loadPlotly().then((p) => { if (alive) Plotly = p; }).catch(() => (failed = true));
    return () => { alive = false; if (el && Plotly) Plotly.purge(el); };
  });

  function merge(a: Record<string, any>, b: Record<string, any> = {}) {
    const out = { ...a };
    for (const [k, v] of Object.entries(b)) out[k] = v && typeof v === 'object' && !Array.isArray(v) && typeof a[k] === 'object' ? merge(a[k], v) : v;
    return out;
  }
  $effect(() => {
    if (!Plotly || !el) return;
    themeTick.v; // re-render on light/dark change
    const t = readTheme();
    const s = spec(t, { narrow });
    const config = {
      displaylogo: false, responsive: true, displayModeBar: 'hover', scrollZoom: false,
      modeBarButtons: zoom ? [['zoom2d', 'pan2d', 'resetScale2d', 'toImage']] : [['toImage']],
      toImageButtonOptions: { format: 'png', filename, scale: 2 },
    };
    Plotly.react(el, s.data, merge({ height }, s.layout), config);
  });
  // click → drill-down
  $effect(() => {
    if (!Plotly || !el || !onselect) return;
    const node = el as any;
    const h = (ev: any) => {
      const p = ev?.points?.[0]; if (!p) return;
      onselect({ x: p.x, y: p.y, label: p.label, curveNumber: p.curveNumber, pointIndex: p.pointIndex ?? p.pointNumber, seriesName: p.data?.name, customdata: p.customdata });
    };
    node.on?.('plotly_click', h);
    return () => node.removeListener?.('plotly_click', h);
  });
  // resize with the container
  $effect(() => {
    if (!Plotly || !el) return;
    const ro = new ResizeObserver((es) => { const w = es[0]?.contentRect.width ?? 0; if (w) narrow = w < 560; Plotly.Plots.resize(el); });
    ro.observe(el);
    return () => ro.disconnect();
  });
</script>

<div class="plot" style:min-height="{height}px" role="img" aria-label={label}>
  {#if !Plotly && !failed}<div class="skeleton" style:height="{height - 16}px"></div>{/if}
  {#if failed}<p class="caption" style="padding:var(--space-4)">Chart could not load — use “View data”.</p>{/if}
  <div bind:this={el} class:clickable={!!onselect}></div>
</div>

<style>
  .plot { position: relative; width: 100%; min-width: 0; }
  .plot .skeleton { margin: 8px 0; border-radius: var(--radius-md); }
  .clickable :global(.plotly .cursor-crosshair), .clickable :global(.plotly .cursor-pointer) { cursor: pointer; }
  .plot :global(.modebar) { background: transparent !important; }
  .plot :global(.modebar-btn path) { fill: var(--text-subtle) !important; }
  .plot :global(.modebar-btn:hover path), .plot :global(.modebar-btn.active path) { fill: var(--text) !important; }
  .plot :global(.rangeselector .button rect) { rx: 4; }
</style>
