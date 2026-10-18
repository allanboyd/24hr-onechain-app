<script lang="ts">
  // Tiny inline sparkline (no chart library): area + line + last point. Nulls are skipped.
  let { values, color = 'var(--t-accent)', height = 36, label = '' }: { values: (number | null)[]; color?: string; height?: number; label?: string } = $props();
  const W = 120;
  const geo = $derived.by(() => {
    const pts = values.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] != null && Number.isFinite(p[1]));
    if (pts.length < 2) return null;
    const ys = pts.map((p) => p[1]); const lo = Math.min(...ys), hi = Math.max(...ys); const span = hi - lo || 1;
    const n = Math.max(1, values.length - 1);
    const xy = pts.map(([i, v]) => [(i / n) * W, height - 3 - ((v - lo) / span) * (height - 8)] as const);
    const line = xy.map(([x, y], k) => `${k ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
    return { line, area: `${line}L${xy.at(-1)![0].toFixed(1)},${height}L${xy[0][0].toFixed(1)},${height}Z`, last: xy.at(-1)! };
  });
  const id = `sp${Math.random().toString(36).slice(2, 8)}`;
</script>
{#if geo}
  <svg viewBox="0 0 {W} {height}" preserveAspectRatio="none" style:height="{height}px" role="img" aria-label={label || 'trend'}>
    <defs><linearGradient {id} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color={color} stop-opacity=".28" /><stop offset="1" stop-color={color} stop-opacity="0" /></linearGradient></defs>
    <path d={geo.area} fill="url(#{id})" />
    <path d={geo.line} fill="none" stroke={color} stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />
  </svg>
{/if}
<style>svg { width: 100%; display: block; overflow: visible; }</style>
