<script lang="ts">
  // Quick sale: warehouse · customer · brand lines (from stock on hand) · cash or credit · amount paid.
  import { inventory, lookup, pricing, sales, type SaleLine, type SellingPrice, type StockRow, type User } from '@btw/api';
  import { sellingPriceFor } from '@btw/api/money';
  import { say } from '@btw/ui';
  import Plus from '@lucide/svelte/icons/plus';
  import Trash from '@lucide/svelte/icons/trash-2';
  import Sheet from '../../components/Sheet.svelte';
  import Segmented from './Segmented.svelte';
  import { co } from '../company.svelte';
  import { num, usdFull } from '../fmt';
  import { warehouseLabel } from '../../lib';
  import { haptic } from '../../native';
  let { user, onclose, ondone }: { user: User; onclose: () => void; ondone: () => void } = $props();

  let stock = $state<StockRow[]>([]);
  // docs/14 B-05: lines start from the directors' selling price (warehouse price, else company price; else the list price)
  let prices = $state<SellingPrice[]>([]);
  pricing.list().then((p) => (prices = p)).catch(() => {});
  const priceOf = (pid: string) => sellingPriceFor(prices, co.active ?? '', wh, pid) ?? lookup.price(pid);
  inventory.stock().then((s) => { stock = s.filter((x) => x.entityId === co.active && x.closing > 0); if (!wh) wh = whs[0] ?? ''; }).catch(() => {});
  const whs = $derived([...new Set(stock.map((x) => x.warehouseId))].filter((w) => !user.warehouseIds.length || user.warehouseIds.includes(w)));
  let wh = $state('');
  let customer = $state('');
  let kind = $state<'Cash' | 'Credit'>('Cash');
  let lines = $state<SaleLine[]>([]);
  let paid = $state<number | null>(null);
  let busy = $state(false), error = $state('');
  const avail = (pid: string) => stock.find((x) => x.warehouseId === wh && x.productId === pid)?.closing ?? 0;
  const products = $derived(stock.filter((x) => x.warehouseId === wh).map((x) => ({ id: x.productId, p: lookup.product(x.productId), n: x.closing })).sort((a, b) => (a.p?.brand ?? '').localeCompare(b.p?.brand ?? '')));
  $effect(() => { if (wh && !lines.length && products.length) addLine(); });
  function addLine() { const p = products.find((x) => !lines.some((l) => l.productId === x.id)) ?? products[0]; if (p) lines.push({ productId: p.id, qty: 1, price: priceOf(p.id) }); }
  const total = $derived(lines.reduce((a, l) => a + (l.qty || 0) * (l.price || 0), 0));
  const paidNow = $derived(paid ?? (kind === 'Cash' ? total : 0));

  async function save() {
    error = '';
    if (!customer.trim()) { error = 'Enter the customer'; return; }
    if (!lines.length || lines.some((l) => !(l.qty > 0))) { error = 'Every line needs a quantity'; return; }
    const over = lines.find((l) => l.qty > avail(l.productId));
    if (over) { error = `Only ${avail(over.productId)} cases of ${lookup.product(over.productId)?.brand} in stock`; return; }
    busy = true;
    try {
      const s = await sales.create({ at: new Date().toISOString(), warehouseId: wh, customer: customer.trim(), salespersonId: user.id, kind, lines: $state.snapshot(lines), currency: 'USD', paid: paidNow });
      haptic('success'); say(`Sale ${s.ref} saved`); ondone();
    } catch (e) { error = (e as Error).message; haptic('warning'); } finally { busy = false; }
  }
</script>

<Sheet modal title="New sale" {onclose}>
  {#if !stock.length}
    <p class="t-meta">Loading stock…</p>
  {:else}
    <label class="field"><span>Warehouse</span>
      <select class="select" bind:value={wh} onchange={() => (lines = [])}>{#each whs as w}<option value={w}>{warehouseLabel(w)}</option>{/each}</select></label>
    <label class="field"><span>Customer</span><input class="input" bind:value={customer} placeholder="Customer name" autocomplete="off" /></label>
    <Segmented options={[{ id: 'Cash', label: 'Cash' }, { id: 'Credit', label: 'Credit' }]} bind:value={kind} label="Sale type" />
    {#each lines as l, i (i)}
      <div class="line">
        <select class="select" bind:value={l.productId} onchange={() => (l.price = priceOf(l.productId))} aria-label="Brand">
          {#each products as p}<option value={p.id}>{p.p?.brand} {p.p?.pack} · {num(p.n)} in stock</option>{/each}
        </select>
        <div class="nums">
          <label class="field"><span>Cases</span><input class="input" type="number" inputmode="numeric" min="1" max={avail(l.productId)} bind:value={l.qty} /></label>
          <label class="field"><span>Price (USD)</span><input class="input" type="number" inputmode="decimal" min="0" step="0.01" bind:value={l.price} /></label>
          {#if lines.length > 1}<button class="del" aria-label="Remove line" onclick={() => lines.splice(i, 1)}><Trash size={18} /></button>{/if}
        </div>
      </div>
    {/each}
    {#if products.length > lines.length}<button class="btn btn-ghost add" onclick={addLine}><Plus size={18} />Add another brand</button>{/if}
    <label class="field"><span>Paid now (USD)</span><input class="input" type="number" inputmode="decimal" min="0" step="0.01" value={paidNow} oninput={(e) => (paid = Number((e.currentTarget as HTMLInputElement).value))} /></label>
    <div class="total"><span>Total</span><strong>{usdFull(total)}</strong></div>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <button class="btn btn-primary btn-lg btn-block" onclick={save} disabled={busy}>{busy ? 'Saving…' : 'Save sale'}</button>
  {/if}
</Sheet>

<style>
  .line { display: flex; flex-direction: column; gap: 8px; padding: 12px; border-radius: 14px; background: var(--surface-sunken); }
  .nums { display: flex; gap: 10px; align-items: flex-end; }
  .nums .field { flex: 1; }
  .del { width: 48px; height: 48px; border-radius: 12px; border: 1px solid var(--border); background: var(--surface); color: var(--danger); display: grid; place-items: center; cursor: pointer; flex: none; }
  .add { align-self: flex-start; }
  .total { display: flex; justify-content: space-between; align-items: baseline; font-size: 16px; }
  .total strong { font: 800 22px var(--ff-display); }
  .error { color: var(--danger); font-weight: 600; margin: 0; }
</style>
