<script lang="ts">
  // Sparkline with a soft area for KPI cards (pure SVG, stretches to its box). Takes the text colour (currentColor), so it
  // reads on a plain card and on an accent card alike. Gaps (null) break the line; the last point is marked.
  let { values, height = 40, label }: { values: (number | null)[] | null | undefined; height?: number; /** text alternative; omit when the card states the trend */ label?: string } = $props();
  const W = 100;
  const pts = $derived.by(() => {
    const vs = values ?? [];
    const nums = vs.filter((v): v is number => v != null);
    if (nums.length < 2) return [];
    const max = Math.max(...nums), min = Math.min(0, ...nums), span = max - min || 1;
    return vs.map((v, i) => (v == null ? null : { x: (i / (vs.length - 1)) * W, y: height - 3 - ((v - min) / span) * (height - 8) }));
  });
  const segs = $derived.by(() => {
    const out: { x: number; y: number }[][] = []; let cur: { x: number; y: number }[] = [];
    for (const p of pts) { if (p) cur.push(p); else if (cur.length) { out.push(cur); cur = []; } }
    if (cur.length) out.push(cur);
    return out;
  });
  const line = (s: { x: number; y: number }[]) => s.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join('');
  const area = (s: { x: number; y: number }[]) => `${line(s)}L${s.at(-1)!.x.toFixed(2)},${height}L${s[0].x.toFixed(2)},${height}Z`;
  const last = $derived([...pts].reverse().find((p) => p));
</script>
{#if segs.length}
<div class="sw">
  <svg class="spark" viewBox="0 0 {W} {height}" preserveAspectRatio="none" style:height="{height}px" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : 'true'}>
    {#each segs as s}
      <path d={area(s)} fill="currentColor" opacity="0.10" />
      <path d={line(s)} fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" opacity="0.85" />
    {/each}
  </svg>
  {#if last}<span class="dot" style:left="{last.x}%" style:top="{(last.y / height) * 100}%" aria-hidden="true"></span>{/if}
</div>
{/if}
<style>
  .sw { position: relative; width: 100%; }
  .spark { display: block; width: 100%; overflow: visible; }
  .dot { position: absolute; width: 7px; height: 7px; margin: -3.5px 0 0 -3.5px; border-radius: 50%; background: currentColor; box-shadow: 0 0 0 2px var(--spark-ring, var(--surface)); }
</style>
