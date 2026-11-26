<script lang="ts">
  // V3-12 step 2: a client pays (part of) what a sale still owes. Updates the sale's paid amount and status; Cash and
  // closing counts it on the day it came in.
  import { sales, type ClientPaymentMethod, type Sale } from '@btw/api';
  import { say } from '@btw/ui';
  import Sheet from '../../components/Sheet.svelte';
  import Segmented from './Segmented.svelte';
  import { usdFull } from '../fmt';
  import { haptic } from '../../native';
  let { sale, onclose, ondone }: { sale: Sale; onclose: () => void; ondone: () => void } = $props();
  const balance = $derived(Math.max(0, Math.round((sale.lines.reduce((a, l) => a + l.qty * l.price, 0) - sale.paid) * 100) / 100));
  let amount = $state<number | null>(null);
  let method = $state<ClientPaymentMethod>('Cash');
  let reference = $state('');
  let busy = $state(false), error = $state('');
  const value = $derived(amount ?? balance);
  async function save() {
    error = '';
    if (!(value > 0)) { error = 'Enter the amount received'; return; }
    if (value > balance + 0.005) { error = `That is more than the balance of ${usdFull(balance)}`; return; }
    busy = true;
    try {
      const r = await sales.recordPayment(sale.id, { amount: value, method, reference: reference.trim() || undefined });
      haptic('success'); say(r.sale.status === 'Paid' ? `${sale.ref} is paid` : `${usdFull(value)} received · ${usdFull(balance - value)} still owed`); ondone();
    } catch (e) { error = (e as Error).message; haptic('warning'); } finally { busy = false; }
  }
</script>

<Sheet modal title="Record payment" {onclose}>
  <p class="who"><strong>{sale.customer}</strong><span class="t-meta">{sale.ref} · still owes {usdFull(balance)}</span></p>
  <label class="field"><span>Amount received (USD)</span><input class="input" type="number" inputmode="decimal" min="0" step="0.01" value={value} oninput={(e) => (amount = Number((e.currentTarget as HTMLInputElement).value))} /></label>
  <Segmented options={[{ id: 'Cash', label: 'Cash' }, { id: 'Mobile money', label: 'Mobile money' }, { id: 'Bank', label: 'Bank' }]} bind:value={method} label="How the client paid" />
  {#if method !== 'Cash'}<label class="field"><span>Reference</span><input class="input" bind:value={reference} placeholder="Transaction or slip number" autocomplete="off" /></label>{/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  <button class="btn btn-primary btn-lg btn-block" onclick={save} disabled={busy}>{busy ? 'Saving…' : 'Record payment'}</button>
</Sheet>

<style>
  .who { display: flex; flex-direction: column; gap: 2px; margin: 0; }
  .error { color: var(--danger); font-weight: 600; margin: 0; }
</style>
