<script lang="ts">
  import { untrack } from 'svelte';
  // Receive (AK-01..05, MA-03): one tap when everything is fine; otherwise adjust per brand. Then photo, name, signature, slide.
  import { lookup, type Leg, type User } from '@btw/api';
  import { SignaturePad } from '@btw/ui';
  import { cases, cpShort } from '../lib';
  import Sheet from './Sheet.svelte';
  import Stepper from './Stepper.svelte';
  import PhotoInput from './PhotoInput.svelte';
  import SlideToConfirm from './SlideToConfirm.svelte';
  import CheckCircle from '@lucide/svelte/icons/circle-check';
  type Line = { productId: string; expected: number; received: number; damaged: number; remarks: string };
  let { leg, user, isFinal, onsubmit, onclose }: { leg: Leg; user: User; isFinal: boolean; onsubmit: (d: { lines: Line[]; receiverName: string; signature: string; photos: string[] }) => Promise<void>; onclose: () => void } = $props();
  let step = $state<'check' | 'adjust' | 'sign'>('check');
  let lines = $state<Line[]>(untrack(() => leg.lines.map((l) => ({ productId: l.productId, expected: l.loadedQty, received: l.loadedQty, damaged: 0, remarks: '' }))));
  let photos = $state<string[]>([]);
  let name = $state((() => { try { return localStorage.getItem('btw-receiver-name') ?? ''; } catch { return ''; } })());
  let signature = $state('');
  let error = $state('');
  let busy = $state(false);
  const truck = $derived(lookup.truck(leg.truckId));
  const expected = $derived(lines.reduce((a, l) => a + l.expected, 0));
  const good = $derived(lines.reduce((a, l) => a + l.received - l.damaged, 0));
  const issue = $derived(lines.some((l) => l.received !== l.expected || l.damaged > 0));
  const missingRemark = $derived(lines.some((l) => (l.received !== l.expected || l.damaged > 0) && !l.remarks.trim()));
  function allOk() { lines.forEach((l) => { l.received = l.expected; l.damaged = 0; l.remarks = ''; }); step = 'sign'; }
  async function confirm() {
    error = '';
    if (!name.trim()) { error = 'Write your name'; return; }
    if (!signature) { error = 'Sign in the box'; return; }
    busy = true;
    try { localStorage.setItem('btw-receiver-name', name.trim()); } catch { /* ignore */ }
    try { await onsubmit({ lines: $state.snapshot(lines), receiverName: name.trim(), signature, photos: $state.snapshot(photos) }); }
    catch (e) { error = (e as Error).message; } finally { busy = false; }
  }
</script>
<Sheet modal title={step === 'sign' ? 'Confirm & sign' : `Receive ${truck?.reg}`} {onclose}>
  {#if step === 'check'}
    <p class="subline">{cases(expected)} expected at {cpShort(leg.toId)}. Count them, then:</p>
    <ul class="cargo">{#each lines as l}{@const p = lookup.product(l.productId)}<li><span>{p?.brand} <span class="caption">{p?.pack}</span></span><strong>{l.expected}</strong></li>{/each}</ul>
    <button class="btn btn-accent btn-lg btn-block" onclick={allOk}><CheckCircle size={22} />Everything arrived OK</button>
    <button class="btn btn-secondary btn-lg btn-block" onclick={() => (step = 'adjust')}>Something is short or damaged</button>
  {:else if step === 'adjust'}
    {#each lines as l, i}
      {@const p = lookup.product(l.productId)}
      {@const off = l.received !== l.expected || l.damaged > 0}
      <section class="adj" class:off>
        <div class="row"><strong>{p?.brand}</strong><span class="caption">{p?.pack} · expected {l.expected}</span></div>
        <label class="field"><span>Received</span><Stepper bind:value={lines[i].received} label="{p?.brand} received" /></label>
        <label class="field"><span>Damaged</span><Stepper bind:value={lines[i].damaged} max={l.received} label="{p?.brand} damaged" /></label>
        {#if off}<label class="field"><span>What happened?</span><input class="input" bind:value={lines[i].remarks} placeholder="e.g. 6 crates crushed" aria-invalid={!l.remarks.trim()} /></label>{/if}
      </section>
    {/each}
    <label class="field"><span>Photos of the damage</span><PhotoInput bind:names={photos} label="Add photo" /></label>
    <button class="btn btn-primary btn-lg btn-block" disabled={missingRemark} onclick={() => (step = 'sign')}>{missingRemark ? 'Say what happened for each line' : 'Next'}</button>
  {:else}
    <div class="summary" class:issue>
      <strong>{cases(good)} in good condition</strong>
      <span class="caption">{issue ? `${expected - good} short or damaged — the office will get a discrepancy report` : 'Matches what was loaded'}</span>
      <span class="caption">{isFinal ? 'Goes into stock now' : 'Transfer point: goods continue on the next truck'}</span>
    </div>
    {#if !issue}<label class="field"><span>Photo (optional)</span><PhotoInput bind:names={photos} label="Add photo" /></label>{/if}
    <label class="field"><span>Your name</span><input class="input" bind:value={name} autocomplete="name" placeholder={user.name} /></label>
    <div class="field"><span>Signature</span><SignaturePad bind:value={signature} height={150} /></div>
    {#if error}<p class="error-box" role="alert">{error}</p>{/if}
    <SlideToConfirm label={busy ? 'Sending…' : 'Confirm receipt'} disabled={busy} onconfirm={confirm} />
    <button class="text-btn" onclick={() => (step = issue ? 'adjust' : 'check')}>Back</button>
  {/if}
</Sheet>
<style>
  .cargo { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
  .cargo li { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--border); font-size: 17px; }
  .cargo strong { font-variant-numeric: tabular-nums; }
  .adj { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-3); border-radius: var(--radius-lg); border: 1px solid var(--border); }
  .adj.off { border-color: var(--warning-solid); background: var(--warning-subtle); }
  .row { display: flex; justify-content: space-between; align-items: baseline; gap: var(--space-2); }
  .summary { display: flex; flex-direction: column; gap: 2px; padding: var(--space-3); border-radius: var(--radius-lg); background: var(--success-subtle); color: var(--success); }
  .summary.issue { background: var(--warning-subtle); color: var(--warning); }
  .summary strong { font: 800 20px var(--ff-display); }
  .summary .caption { color: inherit; }
  .error-box { margin: 0; padding: 10px 12px; border-radius: var(--radius-md); background: var(--danger-subtle); color: var(--danger); font-weight: 600; }
</style>
