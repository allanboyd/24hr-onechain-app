<script lang="ts">
  // Half-circle gauge for a single rate (e.g. on-time %). Pure SVG; value in the centre in the system sans.
  let { label, value, max = 1, target, format = (n: number) => `${Math.round(n * 100)}%`, tone = 'accent' }: {
    label: string; value: number; max?: number; target?: number; format?: (n: number) => string; tone?: 'accent' | 'success' | 'warning' | 'danger';
  } = $props();
  const R = 52, CX = 64, CY = 60;
  const arc = (f: number) => { const a = Math.PI * (1 - f); return `${CX + R * Math.cos(a)},${CY - R * Math.sin(a)}`; };
  const f = $derived(max > 0 ? Math.min(1, Math.max(0, value / max)) : 0);
  const fill = $derived({ accent: 'var(--viz-1)', success: 'var(--success)', warning: 'var(--warning-solid)', danger: 'var(--danger)' }[tone]);
  const tf = $derived(target != null && max > 0 ? Math.min(1, target / max) : null);
</script>
<figure class="gauge" role="meter" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
  <svg viewBox="0 0 128 72" width="100%" style="max-width:220px">
    <path d="M{arc(0)} A{R},{R} 0 0 1 {arc(1)}" fill="none" stroke="var(--surface-sunken)" stroke-width="12" stroke-linecap="round" />
    {#if f > 0}<path d="M{arc(0)} A{R},{R} 0 0 1 {arc(f)}" fill="none" stroke={fill} stroke-width="12" stroke-linecap="round" />{/if}
    {#if tf != null}{@const a = Math.PI * (1 - tf)}<line x1={CX + (R - 9) * Math.cos(a)} y1={CY - (R - 9) * Math.sin(a)} x2={CX + (R + 9) * Math.cos(a)} y2={CY - (R + 9) * Math.sin(a)} stroke="var(--text)" stroke-width="2" />{/if}
    <text x={CX} y={CY - 4} text-anchor="middle" style="font: 700 20px var(--ff-display); fill: var(--text)">{format(value)}</text>
  </svg>
  <figcaption class="small muted">{label}{#if target != null}{' · '}target {format(target)}{/if}</figcaption>
</figure>
<style>.gauge { margin: 0; display: flex; flex-direction: column; align-items: center; gap: 2px; text-align: center; }</style>
