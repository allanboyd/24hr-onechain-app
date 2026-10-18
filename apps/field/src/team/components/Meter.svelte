<script lang="ts">
  // Horizontal "used of planned" bar: ordered vs planned, paid vs owed. Over 100% turns warning.
  let { value, max, label = '', showPct = true }: { value: number; max: number; label?: string; showPct?: boolean } = $props();
  const r = $derived(max > 0 ? value / max : value > 0 ? 1.01 : 0);
</script>
<div class="m" role="meter" aria-valuenow={Math.round(r * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={label || 'progress'}>
  <div class="track"><span class="fill" class:over={r > 1.0001} style:width="{Math.min(100, r * 100)}%"></span></div>
  {#if showPct}<span class="p" class:over={r > 1.0001}>{Math.round(r * 100)}%</span>{/if}
</div>
<style>
  .m { display: flex; align-items: center; gap: 10px; }
  .track { flex: 1; height: 10px; border-radius: 5px; background: var(--surface-sunken); overflow: hidden; }
  .fill { display: block; height: 100%; border-radius: 5px; background: var(--t-accent); transition: width var(--motion-slow) var(--motion-easing); }
  .fill.over { background: var(--warning-solid); }
  .p { font: 700 13px var(--ff-body); font-variant-numeric: tabular-nums; min-width: 40px; text-align: right; color: var(--text-muted); }
  .p.over { color: var(--warning); }
</style>
