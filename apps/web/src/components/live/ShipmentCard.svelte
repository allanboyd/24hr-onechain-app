<script lang="ts">
  // V3-15: one shipment as a card: truck and shipment, route, the checkpoint progress bar, where it is and when it was
  // last seen, what is next with the ETA, and a red line when something is wrong.
  import { lookup, type Shipment } from '@btw/api';
  import { Badge, fmtDateTime, hoursLabel } from '@btw/ui';
  import Progress from './Progress.svelte';
  import { activeLeg, view } from './legs';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  let { sh, selected = false, onselect, onhover }: { sh: Shipment; selected?: boolean; onselect: (id: string) => void; onhover?: (id: string | null) => void } = $props();
  const leg = $derived(activeLeg(sh));
  const v = $derived(view(sh));
  const truck = $derived(lookup.truck(leg.truckId));
</script>

<button type="button" class="sc tone-{v.tone}" class:sel={selected} aria-pressed={selected} onclick={() => onselect(sh.id)}
  onmouseenter={() => onhover?.(sh.id)} onmouseleave={() => onhover?.(null)} onfocus={() => onhover?.(sh.id)}>
  <div class="top">
    <span class="reg">{truck?.reg ?? '-'}</span>
    <span class="ref mono">{sh.ref}</span>
    <span class="grow"></span>
    <Badge status={sh.status} />
  </div>
  <div class="route">{lookup.route(leg.routeId)?.name ?? ''}</div>
  <Progress {v} />
  <div class="now">
    <span><strong>{v.where}</strong> <span class="muted">· {v.last}</span></span>
  </div>
  {#if !v.delivered && v.next}
    <div class="next">Next <strong>{v.next}</strong> · <span class:bad={v.eta.state === 'Late'}>ETA {fmtDateTime(v.eta.eta)}{v.eta.state !== 'On time' ? ` · ${v.eta.state.toLowerCase()} ${hoursLabel(v.eta.hours)}` : ''}</span></div>
  {/if}
  {#if v.problem}<div class="prob"><TriangleAlert size={14} aria-hidden="true" />{v.problem}</div>{/if}
</button>

<style>
  .sc { all: unset; box-sizing: border-box; display: flex; flex-direction: column; gap: 7px; width: 100%; padding: 12px 14px; border-radius: 12px; border: 1px solid var(--border); background: var(--surface); cursor: pointer; transition: border-color .15s, box-shadow .15s, transform .15s; }
  .sc:hover { border-color: var(--border-strong, var(--border)); box-shadow: 0 2px 10px rgb(0 0 0 / .06); }
  .sc.sel { border-color: var(--primary); box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary) 25%, transparent); }
  .sc:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
  .tone-bad { border-left: 0; background: linear-gradient(var(--surface), var(--surface)) padding-box; }
  .top { display: flex; align-items: center; gap: 8px; }
  .reg { font-weight: 700; font-size: 15px; } .ref { font-size: 12px; color: var(--text-muted); } .grow { flex: 1; }
  .route { font-size: 13px; color: var(--text-muted); margin-top: -3px; }
  .now, .next { font-size: 13px; } .muted { color: var(--text-muted); }
  .next { color: var(--text-muted); } .next strong { color: var(--text); }
  .bad { color: var(--danger); font-weight: 600; }
  .prob { display: flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 600; color: var(--danger); background: var(--danger-subtle); border-radius: 8px; padding: 5px 8px; }
  .tone-warn .prob { color: var(--warning); background: var(--warning-subtle, var(--surface-sunken)); }
</style>
