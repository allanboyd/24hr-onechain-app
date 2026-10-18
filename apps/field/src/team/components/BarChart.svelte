<script lang="ts">
  // Light SVG column chart for phones: one series (optionally a faint comparison behind it), short labels,
  // the latest value called out. Tap a bar to read its value.
  let { labels, values, compare, format = (n: number) => String(Math.round(n)), max: fixedMax, height = 160, label, compareLabel = 'Last year', tone = 'var(--t-accent)' }:
    { labels: string[]; values: (number | null)[]; compare?: (number | null)[]; format?: (n: number) => string; max?: number; height?: number; label: string; compareLabel?: string; tone?: string } = $props();
  const max = $derived(fixedMax ?? Math.max(1, ...values.map((v) => v ?? 0), ...(compare ?? []).map((v) => v ?? 0)));
  const n = $derived(values.length);
  const last = $derived(values.findLastIndex((v) => v != null));
  let pick = $state<number | null>(null);
  const shown = $derived(pick ?? last);
  const W = 320, B = 22;
  const bw = $derived(W / Math.max(1, n));
  const y = (v: number) => (height - B) * (1 - v / max) + 2;
</script>
<figure class="chart">
  {#if shown >= 0}
    <figcaption><span class="lab">{labels[shown]}</span><strong>{values[shown] == null ? '—' : format(values[shown]!)}</strong>{#if compare?.[shown] != null}<span class="cmp">{compareLabel}: {format(compare[shown]!)}</span>{/if}</figcaption>
  {/if}
  <svg viewBox="0 0 {W} {height}" role="img" aria-label={label}>
    {#each [0.5, 1] as g}<line x1="0" x2={W} y1={y(max * g)} y2={y(max * g)} class="grid" />{/each}
    {#each values as v, i}
      {@const x = i * bw}
      {#if compare?.[i] != null}<rect x={x + bw * 0.12} y={y(compare[i]!)} width={bw * 0.76} height={Math.max(0, height - B - y(compare[i]!) + 2)} rx="3" class="cmpbar" />{/if}
      {#if v != null}<rect x={x + bw * 0.22} y={y(v)} width={bw * 0.56} height={Math.max(1, height - B - y(v) + 2)} rx="4" fill={tone} opacity={i === shown ? 1 : 0.55} />{/if}
      <rect x={x} y="0" width={bw} height={height} fill="transparent" role="button" tabindex="-1" aria-label="{labels[i]}: {v == null ? 'no data' : format(v)}" onclick={() => (pick = i)} onkeydown={() => {}} />
      {#if n <= 12 || i % 2 === n % 2}<text x={x + bw / 2} y={height - 6} class:on={i === shown}>{labels[i]}</text>{/if}
    {/each}
  </svg>
</figure>
<style>
  .chart { margin: 0; display: flex; flex-direction: column; gap: 8px; }
  figcaption { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .lab { font: 600 13px var(--ff-body); color: var(--text-muted); }
  strong { font: 800 22px var(--ff-display); font-variant-numeric: tabular-nums; }
  .cmp { font-size: 13px; color: var(--text-subtle); }
  svg { width: 100%; height: auto; display: block; overflow: visible; }
  .grid { stroke: var(--border); stroke-dasharray: 3 4; stroke-width: 1; }
  .cmpbar { fill: var(--border); opacity: .7; }
  text { font: 600 10px var(--ff-body); fill: var(--text-subtle); text-anchor: middle; }
  text.on { fill: var(--text); font-weight: 800; }
</style>
