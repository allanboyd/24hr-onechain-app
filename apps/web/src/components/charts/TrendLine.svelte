<script lang="ts">
  // Mini trend line for KPI tiles (pure SVG, entry-safe). Gaps (null) break the line; the last point is marked.
  let { values, width = 96, height = 28, label }: { values: (number | null)[]; width?: number; height?: number; /** text alternative; omit when the tile states the trend */ label?: string } = $props();
  const pts = $derived.by(() => {
    const nums = values.filter((v): v is number => v != null);
    if (nums.length < 2) return [];
    const max = Math.max(...nums), min = Math.min(...nums), span = max - min || 1;
    return values.map((v, i) => (v == null ? null : { x: (i / (values.length - 1)) * (width - 6) + 3, y: height - 4 - ((v - min) / span) * (height - 8) }));
  });
  const d = $derived(pts.reduce((acc, p, i) => (p ? acc + `${i && pts[i - 1] ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}` : acc), ''));
  const last = $derived([...pts].reverse().find((p) => p));
</script>
{#if d}
  <svg {width} {height} viewBox="0 0 {width} {height}" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : 'true'} class="trend">
    <path {d} fill="none" stroke="var(--viz-other)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
    {#if last}<circle cx={last.x} cy={last.y} r="3.5" fill="var(--viz-1)" stroke="var(--surface)" stroke-width="2" />{/if}
  </svg>
{/if}
<style>.trend { display: block; flex: none; overflow: visible; }</style>
