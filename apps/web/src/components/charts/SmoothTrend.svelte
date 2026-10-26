<script lang="ts" module>
  export interface TrendSeries { name: string; values: (number | null)[]; /** CSS colour */ color: string; /** soft area under the line */ area?: boolean; hidden?: boolean }
</script>
<script lang="ts">
  // Calm trend chart (pure SVG, no Plotly): smooth lines for a few series on one value axis, light gridlines, a hover rule with
  // a tooltip listing every visible series, keyboard stepping. Hidden series keep their slot (legend toggles live in the card).
  import { compact } from './scale';
  let { labels, series, format = compact, xLabel = (s: string) => s, tipLabel, height = 260, label }: {
    labels: string[]; series: TrendSeries[]; format?: (n: number) => string;
    /** short axis text for a label */ xLabel?: (s: string) => string; /** longer text in the tooltip */ tipLabel?: (s: string) => string;
    height?: number; label: string;
  } = $props();
  let w = $state(640);
  let hover = $state<number | null>(null);
  const pad = { l: 52, r: 12, t: 12, b: 28 };
  const shown = $derived(series.filter((s) => !s.hidden));
  const max = $derived.by(() => {
    const m = Math.max(0, ...shown.flatMap((s) => s.values.filter((v): v is number => v != null)));
    if (!m) return 1;
    const step = 10 ** Math.floor(Math.log10(m)); const n = m / step;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * step;
  });
  const min = $derived(Math.min(0, ...shown.flatMap((s) => s.values.filter((v): v is number => v != null))));
  const ticks = $derived(Array.from({ length: 5 }, (_, i) => min + ((max - min) * i) / 4));
  const iw = $derived(Math.max(10, w - pad.l - pad.r)), ih = $derived(height - pad.t - pad.b);
  const x = (i: number) => pad.l + (labels.length > 1 ? (i / (labels.length - 1)) * iw : iw / 2);
  const y = (v: number) => pad.t + ih - ((v - min) / (max - min || 1)) * ih;
  // monotone cubic (Fritsch–Carlson): smooth without overshooting the data
  function path(vals: (number | null)[]): string {
    let d = ''; let run: [number, number][] = [];
    const flush = () => {
      if (run.length === 1) d += `M${run[0][0]},${run[0][1]}h0.1`;
      else if (run.length > 1) {
        const n = run.length; const dx = run.slice(1).map((p, i) => p[0] - run[i][0]); const m = run.slice(1).map((p, i) => (p[1] - run[i][1]) / (dx[i] || 1));
        const tg = run.map((_, i) => (i === 0 ? m[0] : i === n - 1 ? m[n - 2] : m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2));
        for (let i = 0; i < n - 1; i++) { const a = m[i] ? tg[i] / m[i] : 0, b = m[i] ? tg[i + 1] / m[i] : 0, s = a * a + b * b; if (s > 9) { const k = 3 / Math.sqrt(s); tg[i] = k * a * m[i]; tg[i + 1] = k * b * m[i]; } }
        d += `M${run[0][0].toFixed(1)},${run[0][1].toFixed(1)}`;
        for (let i = 0; i < n - 1; i++) { const h = dx[i] / 3; d += `C${(run[i][0] + h).toFixed(1)},${(run[i][1] + tg[i] * h).toFixed(1)} ${(run[i + 1][0] - h).toFixed(1)},${(run[i + 1][1] - tg[i + 1] * h).toFixed(1)} ${run[i + 1][0].toFixed(1)},${run[i + 1][1].toFixed(1)}`; }
      }
      run = [];
    };
    vals.forEach((v, i) => { if (v == null) flush(); else run.push([x(i), y(v)]); });
    flush();
    return d;
  }
  const areaOf = (vals: (number | null)[]) => {
    const idx = vals.map((v, i) => (v == null ? -1 : i)).filter((i) => i >= 0);
    if (idx.length < 2) return '';
    return `${path(vals)}L${x(idx.at(-1)!).toFixed(1)},${y(Math.max(0, min))}L${x(idx[0]).toFixed(1)},${y(Math.max(0, min))}Z`;
  };
  // ~6 evenly spaced x labels
  const xt = $derived.by(() => { const n = labels.length; const k = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 90)))); return labels.map((_, i) => i).filter((i) => i % k === 0 || (i === n - 1 && n - 1 - (Math.floor((n - 1) / k) * k) > k / 2)); });
  function move(e: PointerEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const px = e.clientX - r.left; if (!labels.length) return;
    hover = Math.max(0, Math.min(labels.length - 1, Math.round(((px - pad.l) / iw) * (labels.length - 1))));
  }
  function key(e: KeyboardEvent) {
    if (e.key === 'ArrowRight') hover = Math.min(labels.length - 1, (hover ?? labels.length - 2) + 1);
    else if (e.key === 'ArrowLeft') hover = Math.max(0, (hover ?? labels.length) - 1);
    else if (e.key === 'Escape') hover = null; else return;
    e.preventDefault();
  }
  const tipX = $derived(hover === null ? 0 : x(hover));
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="st" bind:clientWidth={w} style:height="{height}px" role="application" aria-label="{label} — use the left and right arrow keys to read each point" tabindex="0" onpointermove={move} onpointerleave={() => (hover = null)} onkeydown={key} onblur={() => (hover = null)}>
  <svg width={w} {height} aria-hidden="true">
    {#each ticks as tv}
      <line x1={pad.l} x2={w - pad.r} y1={y(tv)} y2={y(tv)} class="grid" class:zero={tv === 0} />
      <text x={pad.l - 10} y={y(tv)} dy="0.32em" text-anchor="end" class="ax">{format(tv)}</text>
    {/each}
    {#each xt as i}<text x={x(i)} y={height - 8} text-anchor={i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'middle'} class="ax">{xLabel(labels[i])}</text>{/each}
    {#each series as s}
      {#if !s.hidden}
        {#if s.area}<path d={areaOf(s.values)} fill={s.color} opacity="0.08" />{/if}
        <path d={path(s.values)} fill="none" stroke={s.color} stroke-width="2.25" stroke-linejoin="round" stroke-linecap="round" />
      {/if}
    {/each}
    {#if hover !== null}
      <line x1={tipX} x2={tipX} y1={pad.t} y2={pad.t + ih} class="rule" />
      {#each shown as s}{#if s.values[hover] != null}<circle cx={tipX} cy={y(s.values[hover]!)} r="4.5" fill={s.color} stroke="var(--surface)" stroke-width="2" />{/if}{/each}
    {/if}
  </svg>
  {#if hover !== null}
    <div class="tip" style:left="{tipX}px" class:flip={tipX > w * 0.62} role="status">
      <b>{(tipLabel ?? xLabel)(labels[hover])}</b>
      {#each shown as s}<span><i style:background={s.color}></i>{s.name}<em>{s.values[hover] == null ? 'No data yet' : format(s.values[hover]!)}</em></span>{/each}
    </div>
  {/if}
</div>

<style>
  .st { position: relative; width: 100%; min-width: 0; }
  svg { display: block; overflow: visible; }
  .st { outline: none; touch-action: pan-y; }
  .st:focus-visible { outline: 2px solid var(--focus-ring, var(--primary)); outline-offset: 4px; border-radius: 4px; }
  .grid { stroke: var(--viz-grid); stroke-width: 1; stroke-dasharray: 3 4; }
  .grid.zero { stroke-dasharray: none; }
  .ax { fill: var(--text-subtle); font-size: 11px; font-variant-numeric: tabular-nums; }
  .rule { stroke: var(--viz-axis); stroke-width: 1; }
  .tip { position: absolute; top: 4px; transform: translateX(12px); pointer-events: none; display: flex; flex-direction: column; gap: 2px; min-width: 150px;
    background: var(--surface-raised); border: 1px solid var(--border); border-radius: var(--radius-md); box-shadow: var(--elevation-2); padding: 8px 10px; font-size: 12px; z-index: 5; }
  .tip.flip { transform: translateX(calc(-100% - 12px)); }
  .tip b { font-size: 12px; margin-bottom: 2px; }
  .tip span { display: flex; align-items: center; gap: 6px; color: var(--text-muted); }
  .tip i { width: 8px; height: 8px; border-radius: 50%; flex: none; }
  .tip em { margin-left: auto; padding-left: 12px; font-style: normal; font-weight: 600; color: var(--text); font-variant-numeric: tabular-nums; }
</style>
