<script lang="ts">
  import { untrack } from 'svelte';
  // Hand-over (giver → driver): used at a loading point (LD-01..04, §17.5) and when sending a transfer leg on (DS-02).
  // Truck + driver, cases per brand (prefilled), document photos, agreed transport price, then ONE slide.
  import { lookup, ref } from '@btw/api';
  import { cases } from '../lib';
  import Sheet from './Sheet.svelte';
  import Stepper from './Stepper.svelte';
  import PhotoInput from './PhotoInput.svelte';
  import SlideToConfirm from './SlideToConfirm.svelte';
  type Line = { key: string; productId: string; qty: number };
  type TruckOpt = { truckId: string; driverId: string; note?: string };
  let { title, subtitle = '', trucks, lines, editable = true, askPrice = true, qtyLabel = 'ordered', onsubmit, onclose }: {
    title: string; subtitle?: string; qtyLabel?: string; trucks: TruckOpt[]; lines: Line[]; editable?: boolean; askPrice?: boolean;
    onsubmit: (d: { truckId: string; driverId: string; qty: Record<string, number>; price: number; photos: string[] }) => Promise<void>; onclose: () => void;
  } = $props();
  const drivers = ref().drivers;
  // The sheet mounts fresh each time it opens, so the initial props are the starting values.
  let truckId = $state(untrack(() => trucks[0]?.truckId ?? ''));
  let driverId = $state(untrack(() => trucks[0]?.driverId ?? ''));
  let qty = $state<Record<string, number>>(untrack(() => Object.fromEntries(lines.map((l) => [l.key, l.qty]))));
  let price = $state<number | null>(null);
  let photos = $state<string[]>([]);
  let error = $state('');
  let choosing = $state(false);
  let tried = $state(false);
  let busy = $state(false);
  const truck = $derived(lookup.truck(truckId));
  const total = $derived(Object.values(qty).reduce((a, b) => a + (b || 0), 0));
  const ordered = $derived(lines.reduce((a, l) => a + l.qty, 0));
  const over = $derived(!!truck && total > truck.capacityCases);
  const priceMissing = $derived(askPrice && !(price && price > 0));
  function pickTruck(t: TruckOpt) { truckId = t.truckId; driverId = t.driverId; }
  async function go() {
    tried = true; error = '';
    if (over) { error = `Too many cases for ${truck?.reg}: ${total} of ${truck?.capacityCases}`; return; }
    if (priceMissing) { error = 'Enter the agreed transport price'; return; }
    busy = true;
    try { await onsubmit({ truckId, driverId, qty: $state.snapshot(qty), price: price ?? 0, photos: $state.snapshot(photos) }); }
    catch (e) { error = (e as Error).message; }
    finally { busy = false; }
  }
</script>
<Sheet modal {title} {onclose}>
  {#if subtitle}<p class="subline">{subtitle}</p>{/if}

  <section class="group">
    <p class="eyebrow">Truck</p>
    <div class="picked">
      <p class="big">{truck?.reg} <span class="caption">· {truck?.trailer} · {lookup.provider(truck?.providerId ?? '')?.name}</span></p>
      {#if trucks.length > 1}<button type="button" class="text-btn" onclick={() => (choosing = !choosing)}>{choosing ? 'Done' : 'Change'}</button>{/if}
    </div>
    {#if choosing}
      <div class="choices">
        {#each trucks as t (t.truckId)}
          <button type="button" class="choice" aria-pressed={t.truckId === truckId} onclick={() => { pickTruck(t); choosing = false; }}>
            <strong>{lookup.truck(t.truckId)?.reg}</strong><span class="caption">{lookup.provider(lookup.truck(t.truckId)?.providerId ?? '')?.name}{t.note ? ` · ${t.note}` : ''}</span>
          </button>
        {/each}
      </div>
    {/if}
    <label class="field"><span>Driver</span>
      <select class="select" bind:value={driverId}>{#each drivers as d (d.id)}<option value={d.id}>{d.name}{d.hasApp ? '' : ' (no app — SMS)'}</option>{/each}</select></label>
  </section>

  <section class="group">
    <p class="eyebrow">Cases loaded · {cases(total)}{#if total !== ordered} <span class="diff">({total > ordered ? '+' : ''}{total - ordered} vs order)</span>{/if}</p>
    {#each lines as l (l.key)}
      {@const p = lookup.product(l.productId)}
      <div class="line">
        <div class="line-name"><strong>{p?.brand}</strong><span class="caption">{p?.pack} · {qtyLabel} {l.qty}</span></div>
        {#if editable}<Stepper bind:value={qty[l.key]} label="{p?.brand} cases" step={10} invalid={over} />{:else}<strong class="num">{l.qty}</strong>{/if}
      </div>
    {/each}
    {#if truck}<p class="caption" class:err={over}>Truck holds {cases(truck.capacityCases)}</p>{/if}
  </section>

  <section class="group">
    <p class="eyebrow">Documents</p>
    <PhotoInput bind:names={photos} label="Delivery note" />
  </section>

  {#if askPrice}
    <label class="field"><span>Agreed transport price (USD)</span>
      <input class="input" type="number" inputmode="decimal" min="0" bind:value={price} placeholder="e.g. 1650" aria-invalid={tried && priceMissing} /></label>
  {/if}

  {#if error}<p class="error-box" role="alert">{error}</p>{/if}
  <SlideToConfirm label={busy ? 'Sending…' : 'Hand over to driver'} disabled={busy} onconfirm={go} />
</Sheet>
<style>
  .group { display: flex; flex-direction: column; gap: var(--space-2); }
  .choices { display: flex; flex-direction: column; gap: var(--space-2); }
  .choice { display: flex; justify-content: space-between; align-items: center; gap: var(--space-2); min-height: 56px; padding: 0 14px; border-radius: var(--radius-md); border: 2px solid var(--border); background: var(--surface); color: var(--text); font: inherit; cursor: pointer; text-align: left; }
  .choice[aria-pressed='true'] { border-color: var(--accent); background: var(--accent-subtle); }
  .big { font: 700 20px var(--ff-display); margin: 0; }
  .picked { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); }
  .line { display: grid; grid-template-columns: 1fr 190px; gap: var(--space-3); align-items: center; }
  .line-name { display: flex; flex-direction: column; min-width: 0; }
  .num { font-size: 20px; text-align: right; font-variant-numeric: tabular-nums; }
  .diff { color: var(--accent-text); text-transform: none; letter-spacing: 0; }
  .err { color: var(--danger); font-weight: 600; }
  .error-box { margin: 0; padding: 10px 12px; border-radius: var(--radius-md); background: var(--danger-subtle); color: var(--danger); font-weight: 600; }
  @media (max-width: 380px) { .line { grid-template-columns: 1fr; } }
</style>
