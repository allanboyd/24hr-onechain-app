<script lang="ts">
  // Receiver list tab: every truck coming in, plus the warehouse glance chips.
  import { field, type LegView, type User } from '@btw/api';
  import { Badge, fmtDateTime, hoursLabel } from '@btw/ui';
  import { live } from '../live';
  import { cases, cpShort } from '../lib';
  import CompanyDot from '../components/CompanyDot.svelte';
  import { focus } from './focus.svelte';
  let { user }: { user: User } = $props();
  let incoming = $state<LegView[] | null>(null);
  $effect(() => live(async () => { incoming = (await field.receiver()).incoming; }));
  const arrivedNow = (l: LegView) => l.leg.status === 'Arrived' || !!l.leg.passes.at(-1)?.arrivedAt;
  function open(v: LegView) { focus.legId = v.leg.id; location.hash = '#/'; }
</script>

<div class="page">
  <h1>Incoming</h1>
  {#if incoming}
    {#await import('../team/warehouse/WarehouseGlance.svelte') then m}
      <m.default {user} {incoming} onreceive={open} ontool={(_t: 'expense' | 'stock' | 'reexport') => { location.hash = '#/'; }} />
    {/await}
  {/if}
  {#if !incoming}
    <div class="skeleton" style="height:64px"></div>
  {:else if !incoming.length}
    <p class="muted">No trucks coming. When one is loaded for your warehouse, it appears here.</p>
  {:else}
    <ul class="list">
      {#each incoming as v (v.leg.id)}
        <li>
          <button type="button" onclick={() => open(v)}>
            <CompanyDot entityId={v.shipment.entityId} />
            <span class="grow">
              <strong>{v.truck?.reg ?? 'Truck'}</strong>
              <span class="caption">{cases(v.leg.lines.reduce((a, l) => a + l.loadedQty, 0))} · {v.driver?.name} · {v.shipment.ref}</span>
            </span>
            {#if arrivedNow(v)}<Badge status="Late">Arrived</Badge>
            {:else}<span class="caption">{fmtDateTime(v.eta.eta)}</span><Badge status={v.eta.state}>{v.eta.state}{v.eta.state !== 'On time' ? ` ${hoursLabel(v.eta.hours)}` : ''}</Badge>{/if}
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
  .list button { display: flex; align-items: center; gap: var(--space-2); width: 100%; min-height: 60px; padding: 8px 0; border: 0; border-bottom: 1px solid var(--border); background: none; color: var(--text); font: inherit; text-align: left; cursor: pointer; }
  .grow { display: flex; flex-direction: column; flex: 1; min-width: 0; }
</style>
