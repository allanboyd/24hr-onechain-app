<script lang="ts">
  // Progress / bullet: value against max, optional target tick. Fill carries state (accent → warning → danger).
  let { label, value, max, target, format = (n: number) => String(Math.round(n)), tone = 'accent', note }: {
    label: string; value: number; max: number; target?: number; format?: (n: number) => string;
    tone?: 'accent' | 'success' | 'warning' | 'danger'; note?: string;
  } = $props();
  const p = $derived(max > 0 ? Math.min(1, Math.max(0, value / max)) : 0);
  const tp = $derived(target != null && max > 0 ? Math.min(1, target / max) : null);
  const fill = $derived({ accent: 'var(--viz-1)', success: 'var(--success)', warning: 'var(--warning-solid)', danger: 'var(--danger)' }[tone]);
</script>
<div class="meter" role="meter" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
  <div class="row between small"><span>{label}</span><b class="num">{format(value)}{#if target != null}<span class="muted"> / {format(target)}</span>{/if}</b></div>
  <div class="track"><div class="fill" style:width="{p * 100}%" style:background={fill}></div>{#if tp != null}<div class="target" style:left="{tp * 100}%" title="Target {format(target!)}"></div>{/if}</div>
  {#if note}<div class="caption">{note}</div>{/if}
</div>
<style>
  .meter { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .track { position: relative; height: 10px; border-radius: 5px; background: var(--surface-sunken); }
  .fill { height: 100%; border-radius: 5px; transition: width var(--motion-base) var(--motion-easing); }
  .target { position: absolute; top: -3px; bottom: -3px; width: 2px; background: var(--text); border-radius: 1px; }
</style>
