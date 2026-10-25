<script lang="ts">
  // docs/14 B-01 on the phone (Asie, Yonas): add a warehouse expense in a few taps — category, amount, receipt photo — and see
  // this month's total per category. Lazy chunk opened from the receiver home.
  import { lookup, warehouse, type Currency, type User, type WarehouseExpense, type WarehouseExpenseCategory } from '@btw/api';
  import { say } from '@btw/ui';
  import { untrack } from 'svelte';
  import { CURRENCIES, WAREHOUSE_EXPENSE_CATEGORIES, expenseSummary, validateExpense } from '@btw/api/money';
  import Sheet from '../../components/Sheet.svelte';
  import Camera from '@lucide/svelte/icons/camera';
  import { haptic } from '../../native';
  import { uploadReceipt } from './upload';
  let { user, onclose }: { user: User; onclose: () => void } = $props();

  const today = new Date().toISOString().slice(0, 10);
  const localCcy = (wh: string): Currency => (lookup.warehouse(wh)?.country === 'Rwanda' ? 'RWF' : 'USD');
  let wh = $state(untrack(() => user.warehouseIds[0] ?? ''));
  let category = $state<WarehouseExpenseCategory>('Offloading');
  let amount = $state<number | null>(null);
  let currency = $state<Currency>(untrack(() => localCcy(user.warehouseIds[0] ?? '')));
  let date = $state(today);
  let reference = $state(''); let note = $state('');
  let receipt = $state<{ id: string; url: string; name: string } | null>(null);
  let busy = $state(false); let error = $state('');
  let recent = $state<WarehouseExpense[]>([]);
  const load = () => warehouse.expenses({ warehouseId: wh, from: `${today.slice(0, 7)}-01` }).then((r) => (recent = r)).catch(() => {});
  $effect(() => { void wh; load(); });
  const month = $derived(expenseSummary(recent));
  async function pick(e: Event & { currentTarget: HTMLInputElement }) {
    const f = e.currentTarget.files?.[0]; if (!f) return;
    busy = true; error = '';
    try { receipt = await uploadReceipt(f); } catch (x) { error = (x as Error).message || 'Could not attach the photo'; } finally { busy = false; e.currentTarget.value = ''; }
  }
  async function save() {
    const input = { warehouseId: wh, date, category, amount: Number(amount), currency, reference: reference || null, note: note || null, receiptFileId: receipt?.id ?? null, receiptName: receipt?.name ?? null, receiptUrl: receipt?.url ?? null };
    const p = validateExpense(input, { warehouseIds: user.warehouseIds }); if (p.length) { error = p[0]; return; }
    busy = true; error = '';
    try { await warehouse.addExpense(input); haptic('success'); say(`${category} recorded`); amount = null; reference = ''; note = ''; receipt = null; load(); }
    catch (x) { error = (x as Error).message; } finally { busy = false; }
  }
</script>

<Sheet modal title="Warehouse expense" {onclose}>
  {#if user.warehouseIds.length > 1}
    <div class="seg" role="radiogroup" aria-label="Warehouse">{#each user.warehouseIds as w (w)}<button class:on={wh === w} role="radio" aria-checked={wh === w} onclick={() => { wh = w; currency = localCcy(w); }}>{lookup.warehouse(w)?.town ?? w}</button>{/each}</div>
  {/if}
  <div class="chips" role="radiogroup" aria-label="Category">
    {#each WAREHOUSE_EXPENSE_CATEGORIES as c}<button class="chip" class:on={category === c} role="radio" aria-checked={category === c} onclick={() => (category = c)}>{c}</button>{/each}
  </div>
  <div class="two">
    <label class="field grow"><span>Amount</span><input class="input big" type="number" inputmode="decimal" min="0" step="0.01" bind:value={amount} placeholder="0" /></label>
    <label class="field"><span>Currency</span><select class="input" bind:value={currency}>{#each CURRENCIES as c}<option value={c}>{c}</option>{/each}</select></label>
  </div>
  <div class="two">
    <label class="field"><span>Date</span><input class="input" type="date" max={today} bind:value={date} /></label>
    <label class="field grow"><span>Reference</span><input class="input" bind:value={reference} placeholder="Invoice / receipt no." /></label>
  </div>
  <label class="field"><span>Note</span><input class="input" bind:value={note} placeholder="What it was for" /></label>
  <label class="photo"><Camera size={22} /><span>{receipt ? `Receipt: ${receipt.name}` : 'Photo of the receipt (optional)'}</span><input type="file" accept="image/*" capture="environment" hidden onchange={pick} /></label>
  {#if error}<p class="error-box" role="alert">{error}</p>{/if}
  <button class="btn btn-accent btn-lg btn-block" disabled={busy || !amount} onclick={save}>{busy ? 'Saving…' : 'Record expense'}</button>

  <section class="month">
    <div class="row"><strong>This month · {lookup.warehouse(wh)?.name}</strong><strong>USD {Math.round(month.total).toLocaleString('en-US')}</strong></div>
    {#each month.byCategory as c (c.category)}<div class="row caption"><span>{c.category}</span><span>USD {Math.round(c.total).toLocaleString('en-US')}</span></div>{/each}
    {#if !recent.length}<p class="caption">Nothing recorded yet this month.</p>{/if}
  </section>
</Sheet>

<style>
  .seg { display: flex; gap: 6px; background: var(--surface-sunken); padding: 4px; border-radius: 999px; }
  .seg button { flex: 1; min-height: 40px; border: 0; border-radius: 999px; background: none; font: 600 15px var(--ff-body); color: var(--text-muted); }
  .seg button.on { background: var(--surface); color: var(--text); box-shadow: var(--elevation-1); }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .chip { min-height: 44px; padding: 0 14px; border-radius: 22px; border: 1px solid var(--border); background: var(--surface); color: var(--text); font: 600 15px var(--ff-body); }
  .chip.on { border-color: var(--primary); background: var(--primary); color: var(--text-on-primary); }
  .two { display: flex; gap: var(--space-3); }
  .grow { flex: 1; min-width: 0; }
  .big { font-size: 22px; font-weight: 700; }
  .photo { display: flex; align-items: center; gap: var(--space-2); min-height: 52px; padding: 0 var(--space-3); border: 1px dashed var(--border-strong); border-radius: var(--radius-lg); cursor: pointer; font-weight: 600; }
  .month { display: flex; flex-direction: column; gap: 4px; padding-top: var(--space-3); border-top: 1px solid var(--border); }
  .row { display: flex; justify-content: space-between; gap: var(--space-2); }
  .error-box { color: var(--danger); font-weight: 600; }
</style>
