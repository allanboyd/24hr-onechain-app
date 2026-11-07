<script lang="ts">
  // Driver list tab: the working set already on the phone (active trips). Tap one to open it on Now.
  import { field, type LegView, type User } from '@btw/api';
  import { Badge, hoursLabel } from '@btw/ui';
  import { live } from '../live';
  import { cases, destLabel, cpShort } from '../lib';
  import CompanyChip from '../components/CompanyChip.svelte';
  import { focus } from './focus.svelte';
  let { user: _user }: { user: User } = $props();
  let trips = $state<LegView[] | null>(null);
  $effect(() => live(async () => { trips = (await field.driver()).trips; }));
  function open(t: LegView) { focus.legId = t.leg.id; location.hash = '#/'; }
</script>

<div class="page">
  <h1>Your trips</h1>
  <p class="caption">Active trips assigned to you. Finished deliveries stay with the office.</p>
  {#if !trips}
    <div class="skeleton" style="height:64px"></div>
  {:else if !trips.length}
    <p class="muted">No trip right now. When a truck is loaded for you, it appears here.</p>
  {:else}
    <ul class="list">
      {#each trips as t (t.leg.id)}
        <li>
          <button type="button" onclick={() => open(t)}>
            <span class="grow">
              <CompanyChip entityId={t.shipment.entityId} />
              <strong>{t.truck?.reg ?? 'Truck'}</strong>
              <span class="caption">{t.route?.name ?? destLabel(t.leg.toId) ?? cpShort(t.leg.toId)}</span>
              <span class="caption">{cases(t.leg.lines.reduce((a, l) => a + l.loadedQty, 0))}</span>
            </span>
            <Badge status={t.eta.state}>{t.eta.state}{t.eta.state !== 'On time' ? ` ${hoursLabel(t.eta.hours)}` : ''}</Badge>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .page { padding: calc(env(safe-area-inset-top) + 20px) var(--space-5) calc(var(--field-nav, 68px) + 16px); max-width: 560px; margin: 0 auto; display: flex; flex-direction: column; gap: var(--space-3); }
  h1 { font-size: var(--fs-h1); }
  .list { list-style: none; margin: 0; padding: 0; }
  .list button { display: flex; align-items: center; gap: var(--space-3); width: 100%; min-height: 72px; padding: 12px 0; border: 0; border-bottom: 1px solid var(--border); background: none; color: var(--text); font: inherit; text-align: left; cursor: pointer; }
  .grow { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
</style>
