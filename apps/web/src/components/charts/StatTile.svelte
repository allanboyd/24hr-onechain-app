<script lang="ts">
  // label · value · delta vs a named period · optional sparkline. Pure SVG (entry-safe). Clickable when `onclick` is set.
  let { label, value, delta, deltaLabel = 'vs previous period', upIsGood = true, trend, hint, onclick, active = false }: {
    label: string; value: string; /** fraction, e.g. 0.12 = +12% */ delta?: number | null; deltaLabel?: string; upIsGood?: boolean;
    trend?: number[]; hint?: string; onclick?: () => void; active?: boolean;
  } = $props();
  const W = 96, H = 28;
  const path = $derived.by(() => {
    if (!trend || trend.length < 2) return '';
    const max = Math.max(...trend), min = Math.min(...trend), span = max - min || 1;
    return trend.map((v, i) => `${i ? 'L' : 'M'}${((i / (trend.length - 1)) * (W - 4) + 2).toFixed(1)},${(H - 3 - ((v - min) / span) * (H - 6)).toFixed(1)}`).join('');
  });
  const end = $derived.by(() => {
    if (!trend || trend.length < 2) return null;
    const max = Math.max(...trend), min = Math.min(...trend), span = max - min || 1, v = trend.at(-1)!;
    return { x: W - 2, y: H - 3 - ((v - min) / span) * (H - 6) };
  });
  const good = $derived(delta == null ? null : delta === 0 ? null : (delta > 0) === upIsGood);
</script>
<svelte:element this={onclick ? 'button' : 'div'} class="card kpi tile" class:pick={!!onclick} class:on={active} {onclick} type={onclick ? 'button' : undefined} role={onclick ? undefined : 'group'} aria-label={onclick ? `${label}: ${value}` : undefined}>
  <div class="overline">{label}</div>
  <div class="row between" style="align-items:flex-end;flex-wrap:nowrap">
    <div class="value">{value}</div>
    {#if path}<svg width={W} height={H} aria-hidden="true"><path d={path} fill="none" stroke="var(--viz-other)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />{#if end}<circle cx={end.x} cy={end.y} r="3.5" fill="var(--viz-1)" stroke="var(--surface)" stroke-width="2" />{/if}</svg>{/if}
  </div>
  <div class="delta">
    {#if delta != null && isFinite(delta)}<span class="d" class:good={good === true} class:bad={good === false}>{delta > 0 ? '▲' : delta < 0 ? '▼' : '●'} {Math.abs(Math.round(delta * 100))}%</span> {deltaLabel}{:else if hint}{hint}{/if}
    {#if delta != null && hint}<br>{hint}{/if}
  </div>
</svelte:element>
<style>
  .tile { display: flex; flex-direction: column; gap: 2px; min-width: 0; text-align: left; font: inherit; color: inherit; }
  .tile .value { font-size: 26px; line-height: 34px; font-variant-numeric: normal; }
  .pick { cursor: pointer; } .pick:hover { border-color: var(--border-strong); }
  .on { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  .d { font-weight: 600; color: var(--text-muted); }
  .d.good { color: var(--success); } .d.bad { color: var(--danger); }
</style>
