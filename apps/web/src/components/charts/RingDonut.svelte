<script lang="ts">
  // Part-to-whole ring with a figure in the middle (pure SVG). Small gaps between parts; zero parts are left out of the ring
  // (the legend next to it still lists them). Colours come from the caller (status colours for status bands).
  let { parts, size = 168, thickness = 16, centerLabel = '', centerValue = '', label }: {
    parts: { label: string; value: number; color: string }[]; size?: number; thickness?: number;
    centerLabel?: string; centerValue?: string; label: string;
  } = $props();
  const r = $derived((size - thickness) / 2);
  const C = $derived(2 * Math.PI * r);
  const total = $derived(parts.reduce((a, p) => a + Math.max(0, p.value), 0));
  const arcs = $derived.by(() => {
    const live = parts.filter((p) => p.value > 0);
    const gap = live.length > 1 ? Math.min(4, C * 0.01) : 0;
    let off = 0;
    return live.map((p) => { const len = (p.value / (total || 1)) * C; const a = { ...p, dash: `${Math.max(0.5, len - gap)} ${C}`, offset: -off }; off += len; return a; });
  });
</script>
<div class="ring" style:width="{size}px" style:height="{size}px">
  <svg width={size} height={size} viewBox="0 0 {size} {size}" role="img" aria-label="{label}: {parts.map((p) => `${p.label} ${total ? Math.round((p.value / total) * 100) : 0}%`).join(', ')}">
    <circle cx={size / 2} cy={size / 2} {r} fill="none" stroke="var(--surface-sunken)" stroke-width={thickness} />
    <g transform="rotate(-90 {size / 2} {size / 2})">
      {#each arcs as a}<circle cx={size / 2} cy={size / 2} {r} fill="none" stroke={a.color} stroke-width={thickness} stroke-dasharray={a.dash} stroke-dashoffset={a.offset} stroke-linecap="butt" />{/each}
    </g>
  </svg>
  <div class="mid">{#if centerLabel}<span>{centerLabel}</span>{/if}<b>{centerValue}</b></div>
</div>
<style>
  .ring { position: relative; flex: none; }
  svg { display: block; }
  .mid { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 0 22%; }
  .mid span { font-size: 11px; color: var(--text-muted); line-height: 1.3; }
  .mid b { font-size: 20px; line-height: 1.2; font-variant-numeric: tabular-nums; color: var(--text); }
</style>
