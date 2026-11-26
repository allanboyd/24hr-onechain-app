<script lang="ts">
  // V3-15: the journey timeline of a leg: each checkpoint with its planned and actual time; where the truck is now is
  // highlighted, the next one shows its planned time and the ETA.
  import { fmtDateTime, hoursLabel } from '@btw/ui';
  import type { LegView } from './legs';
  let { v }: { v: LegView } = $props();
  const KIND: Record<string, string> = { loading: 'loading point', border: 'border', warehouse: 'warehouse', weighbridge: 'weighbridge', town: 'town' };
</script>

<ol class="jr">
  {#each v.stops as s, i (s.id + s.planned)}
    <li class={s.state}>
      <span class="mk" aria-hidden="true"></span>
      <div class="tx">
        <div class="nm"><strong>{s.name}</strong> <span class="kd">{KIND[s.kind] ?? s.kind}</span>{#if s.state === 'here'}{' '}<span class="now">{v.delivered ? 'delivered' : 'now'}</span>{/if}</div>
        {#if s.arrived}<div class="tm">arrived {fmtDateTime(s.arrived)}{s.departed ? ` · left ${fmtDateTime(s.departed)}` : ''}</div>
        {:else}<div class="tm">planned {fmtDateTime(s.planned)}{#if s.state === 'next' && !v.delivered} · <span class:bad={v.eta.state === 'Late'}>ETA {fmtDateTime(v.eta.eta)}{v.eta.state !== 'On time' ? ` (${v.eta.state.toLowerCase()} ${hoursLabel(v.eta.hours)})` : ''}</span>{/if}</div>{/if}
      </div>
    </li>
  {/each}
</ol>

<style>
  .jr { list-style: none; margin: 0; padding: 0; }
  li { position: relative; display: flex; gap: 12px; padding: 0 0 14px; }
  li:not(:last-child)::before { content: ''; position: absolute; left: 6px; top: 16px; bottom: 0; width: 2px; background: var(--border); }
  li.done:not(:last-child)::before { background: var(--primary); }
  .mk { flex: none; width: 14px; height: 14px; margin-top: 2px; border-radius: 50%; border: 2px solid var(--border-strong, var(--border)); background: var(--surface); box-sizing: border-box; }
  .done .mk { background: var(--primary); border-color: var(--primary); }
  .here .mk { background: var(--accent); border-color: var(--accent); box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 25%, transparent); }
  .next .mk { border-color: var(--primary); }
  .tx { min-width: 0; }
  .nm { font-size: 14px; } .kd { font-size: 12px; color: var(--text-muted); }
  .now { font-size: 11px; font-weight: 700; color: var(--accent); text-transform: uppercase; letter-spacing: .04em; }
  .tm { font-size: 12.5px; color: var(--text-muted); margin-top: 1px; }
  .later .nm { color: var(--text-muted); }
  .bad { color: var(--danger); font-weight: 600; }
</style>
