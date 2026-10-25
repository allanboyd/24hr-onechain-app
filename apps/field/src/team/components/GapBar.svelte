<script lang="ts">
  // Ordered → loaded → delivered for one order (or all open orders): one bar, numbers in words beside it.
  import { num } from '../fmt';
  import type { Gap } from '../glance';
  let { gap, compact = false }: { gap: Gap; compact?: boolean } = $props();
  const max = $derived(Math.max(1, gap.ordered, gap.loaded));
  const w = (n: number) => `${Math.min(100, (n / max) * 100)}%`;
</script>
<div class="gb" role="img" aria-label="Ordered {gap.ordered}, loaded {gap.loaded}, delivered {gap.delivered} cases">
  <div class="track"><span class="ld" style:width={w(gap.loaded)}></span><span class="dl" style:width={w(gap.delivered)}></span></div>
  <div class="legend" class:compact>
    <span><i class="k o"></i>Ordered <b>{num(gap.ordered)}</b></span>
    <span><i class="k l"></i>Loaded <b>{num(gap.loaded)}</b></span>
    <span><i class="k d"></i>Delivered <b>{num(gap.delivered)}</b></span>
  </div>
</div>
<style>
  .gb { display: flex; flex-direction: column; gap: 6px; }
  .track { position: relative; height: 10px; border-radius: 5px; background: var(--surface-sunken); overflow: hidden; }
  .track span { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 5px; }
  .ld { background: color-mix(in srgb, var(--t-accent) 45%, transparent); }
  .dl { background: var(--t-accent); }
  .legend { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 13px; color: var(--text-muted); }
  .legend.compact { font-size: 12px; gap: 2px 10px; }
  .legend b { color: var(--text); font-variant-numeric: tabular-nums; }
  .k { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 4px; vertical-align: 1px; }
  .k.o { background: var(--surface-sunken); box-shadow: inset 0 0 0 1px var(--border-strong); } .k.l { background: color-mix(in srgb, var(--t-accent) 45%, transparent); } .k.d { background: var(--t-accent); }
</style>
