<script lang="ts">
  // V3-15: the checkpoint progress bar. One dot per checkpoint (loading point → borders → warehouse): passed, here, next,
  // still to come; the line between them fills as the truck moves. Red when the truck is late.
  import type { LegView } from './legs';
  let { v, labels = true }: { v: LegView; labels?: boolean } = $props();
  const pct = $derived(v.total > 1 ? Math.min(100, (Math.max(0, v.at) / (v.total - 1)) * 100) : 0);
</script>

<div class="pg" class:late={v.late} class:done={v.delivered} role="img" aria-label="{v.done} of {v.total} checkpoints passed{v.next ? `, next ${v.next}` : ''}">
  <div class="track"><div class="fill" style:width="{v.delivered ? 100 : pct}%"></div></div>
  <div class="dots">
    {#each v.stops as s (s.id + s.planned)}<span class="dot {s.state} {s.kind}" title="{s.name}{s.arrived ? ' · passed' : ''}"></span>{/each}
  </div>
  {#if labels}<div class="ends"><span>{v.stops[0]?.name}</span><span>{v.stops.at(-1)?.name}</span></div>{/if}
</div>

<style>
  .pg { position: relative; padding-top: 2px; }
  .track { position: absolute; left: 5px; right: 5px; top: 7px; height: 3px; border-radius: 3px; background: var(--border); overflow: hidden; }
  .fill { height: 100%; background: var(--primary); border-radius: 3px; transition: width .6s var(--motion-easing, ease); }
  .late .fill { background: var(--danger); } .done .fill { background: var(--success); }
  .dots { position: relative; display: flex; justify-content: space-between; }
  .dot { width: 11px; height: 11px; border-radius: 50%; background: var(--surface); border: 2px solid var(--border-strong, var(--border)); box-sizing: border-box; }
  .dot.done { background: var(--primary); border-color: var(--primary); }
  .late .dot.done { background: var(--danger); border-color: var(--danger); } .pg.done .dot { background: var(--success); border-color: var(--success); }
  .dot.here { width: 15px; height: 15px; margin-top: -2px; background: var(--accent); border-color: var(--surface); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 30%, transparent); animation: pulse 2s infinite; }
  .late .dot.here { background: var(--danger); box-shadow: 0 0 0 3px color-mix(in srgb, var(--danger) 30%, transparent); }
  .dot.next { border-color: var(--primary); }
  .dot.border:not(.done):not(.here) { border-style: dashed; }
  .ends { display: flex; justify-content: space-between; gap: 8px; margin-top: 4px; font-size: 11.5px; color: var(--text-muted); }
  @keyframes pulse { 50% { box-shadow: 0 0 0 6px color-mix(in srgb, var(--accent) 0%, transparent); } }
  @media (prefers-reduced-motion: reduce) { .dot.here { animation: none; } .fill { transition: none; } }
</style>
