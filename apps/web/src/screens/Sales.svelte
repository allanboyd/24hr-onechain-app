<script lang="ts">
  import { watch } from '../lib/load.svelte';
  import ErrorState from '../components/ErrorState.svelte';
  import { amount, inventory, lookup, ref, sales, type Sale, type StockRow, type User } from '@btw/api';
  import { Badge, fmtDateTime, fmtMoney, fmtNum, say } from '@btw/ui';
  import Plus from '@lucide/svelte/icons/plus';
  import Trash from '@lucide/svelte/icons/trash-2';
  import ExportMenu from '../components/ExportMenu.svelte';
  let { user }: { params?: any; user: User } = $props();
  const r = ref();
  const scoped = $derived(user.roles.includes('director') || !user.warehouseIds.length ? null : user.warehouseIds);
  const warehouses = $derived(r.warehouses.filter((w) => !scoped || scoped.includes(w.id)));

  let list = $state<Sale[] | null>(null);
  let stock = $state<StockRow[]>([]);
  let fWh = $state('');
  let fStatus = $state('');
  let fKind = $state('');
  let fCust = $state('');
  async function load() { [list, stock] = await Promise.all([sales.list(), inventory.stock()]); }
  const w = watch(load);
  const rows = $derived((list ?? []).filter((s) => (!scoped || scoped.includes(s.warehouseId)) && (!fWh || s.warehouseId === fWh) && (!fStatus || s.status === fStatus) && (!fKind || s.kind === fKind) && (!fCust || s.customer.toLowerCase().includes(fCust.toLowerCase()))));
  const total = (s: Sale) => s.lines.reduce((a, l) => a + amount(l.qty, l.price), 0);
  const balances = $derived.by(() => {
    const m = new Map<string, number>();
    for (const s of rows) { const b = total(s) - s.paid; if (b > 0.005) m.set(s.customer, (m.get(s.customer) ?? 0) + b); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  });

  const since = Date.now() - 30 * 864e5;
  const kpi = $derived.by(() => {
    const r30 = rows.filter((s) => Date.parse(s.at) >= since);
    const val = r30.reduce((a, s) => a + total(s), 0);
    return { val, cases: r30.reduce((a, s) => a + s.lines.reduce((b, l) => b + l.qty, 0), 0), count: r30.length,
      credit: val ? Math.round((r30.filter((s) => s.kind === 'Credit').reduce((a, s) => a + total(s), 0) / val) * 100) : 0,
      outstanding: balances.reduce((a, [, b]) => a + b, 0) };
  });
  const exportRows = () => [['Sale No.', 'Date', 'Warehouse', 'Customer', 'Type', 'SKU', 'Qty (cases)', 'Price (USD)', 'Amount (USD)', 'Paid (USD)', 'Status'],
    ...rows.flatMap((s) => s.lines.map((l) => [s.ref, s.at.slice(0, 10), lookup.warehouse(s.warehouseId)!.name, s.customer, s.kind, lookup.product(l.productId)!.sku, l.qty, l.price, amount(l.qty, l.price), s.paid, s.status]))];

  // New sale dialog
  let dialog = $state<HTMLDialogElement>();
  let wh = $state('');
  let customer = $state('Walk-in');
  let kind = $state<Sale['kind']>('Cash');
  let lines = $state<{ productId: string; qty: number; price: number }[]>([]);
  let paid = $state(0);
  let override = $state(false);
  let error = $state('');
  let busy = $state(false);
  const avail = (pid: string) => stock.find((x) => x.warehouseId === wh && x.productId === pid)?.closing ?? 0;
  const inStock = $derived(stock.filter((x) => x.warehouseId === wh && x.closing > 0));
  const saleTotal = $derived(lines.reduce((a, l) => a + amount(l.qty || 0, l.price || 0), 0));
  const markup = 1.35; // demo sell price = supplier price × 1.35 until sales price lists exist (Q12)
  const sellPrice = (pid: string) => Math.round(lookup.price(pid) * markup * 100) / 100;
  function addLine() { const p = inStock.find((x) => !lines.some((l) => l.productId === x.productId)) ?? inStock[0]; if (p) lines.push({ productId: p.productId, qty: 0, price: sellPrice(p.productId) }); }
  function openNew() { wh = warehouses[0]?.id ?? ''; customer = 'Walk-in'; kind = 'Cash'; lines = []; paid = 0; override = false; error = ''; addLine(); dialog?.showModal(); }
  function changeWh() { lines = []; addLine(); }
  $effect(() => { if (kind === 'Cash') paid = saleTotal; });
  async function save(e: Event) {
    e.preventDefault(); error = '';
    const ls = lines.filter((l) => l.qty > 0);
    if (!ls.length) { error = 'Enter a quantity on at least one line'; return; }
    busy = true;
    try {
      const s = await sales.create({ at: new Date().toISOString(), warehouseId: wh, customer, salespersonId: user.id, kind, lines: $state.snapshot(ls), currency: 'USD', paid }, override);
      dialog?.close(); say(`Sale ${s.ref} recorded — stock reduced`);
    } catch (err) { error = (err as Error).message; }
    busy = false;
  }
</script>

<div class="page-head">
  <div><div class="overline crumb">Stock & sales</div><h1>Sales</h1></div>
  <div class="row"><ExportMenu name="sales" rows={exportRows} /><button class="btn btn-primary" onclick={openNew}><Plus size={16} />New sale</button></div>
</div>
<ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />

<div class="grid grid-kpi" style="margin-bottom:var(--space-4)">
  <div class="card kpi"><div class="overline">Sales · 30 days (USD)</div><div class="value">{fmtNum(kpi.val)}</div><div class="delta">{fmtNum(kpi.count)} sales</div></div>
  <div class="card kpi"><div class="overline">Cases sold · 30 days</div><div class="value">{fmtNum(kpi.cases)}</div><div class="delta">drives velocity (§9.1)</div></div>
  <div class="card kpi"><div class="overline">Outstanding (USD)</div><div class="value accent-text">{fmtNum(kpi.outstanding)}</div><div class="delta">{balances.length} customers owe (SL-03)</div></div>
  <div class="card kpi"><div class="overline">Credit share</div><div class="value">{kpi.credit}%</div><div class="delta">of 30-day sales value</div></div>
</div>

<div class="layout">
  <div>
    <div class="filters">
      <label class="field"><span>Warehouse</span><select class="select" bind:value={fWh}><option value="">All</option>{#each warehouses as w}<option value={w.id}>{w.name}</option>{/each}</select></label>
      <label class="field"><span>Payment</span><select class="select" bind:value={fStatus}><option value="">All</option><option>Paid</option><option>Part-paid</option><option>Unpaid</option></select></label>
      <label class="field"><span>Type</span><select class="select" bind:value={fKind}><option value="">All</option><option>Cash</option><option>Credit</option><option>Batch</option></select></label>
      <label class="field"><span>Customer</span><input class="input" type="search" bind:value={fCust} placeholder="Search customer" /></label>
      {#if fWh || fStatus || fKind || fCust}<button class="btn btn-ghost" onclick={() => { fWh = ''; fStatus = ''; fKind = ''; fCust = ''; }}>Clear</button>{/if}
    </div>
    <div class="card flush table-wrap">
      <table class="table">
        <thead><tr><th>Sale No.</th><th>Date</th><th>Warehouse</th><th>Customer</th><th>Type</th><th>Brand · Package</th><th class="num">Qty</th><th class="num">Amount (USD)</th><th class="num">Paid</th><th>Status</th></tr></thead>
        <tbody>
          {#if !list}{#each Array(5) as _}<tr><td colspan="10"><div class="skeleton"></div></td></tr>{/each}{/if}
          {#each rows.slice(0, 100) as s (s.id)}
            <tr>
              <td class="mono small" style="white-space:nowrap">{s.ref}</td>
              <td class="small" style="white-space:nowrap">{fmtDateTime(s.at)}</td>
              <td class="small">{lookup.warehouse(s.warehouseId)?.name}</td>
              <td>{s.customer}</td>
              <td><Badge tone={s.kind === 'Credit' ? 'warning' : s.kind === 'Batch' ? 'info' : 'neutral'}>{s.kind}</Badge></td>
              <td class="small">{#each s.lines as l}<div style="white-space:nowrap">{lookup.product(l.productId)?.brand}</div><div class="caption">{lookup.product(l.productId)?.pack}</div>{/each}</td>
              <td class="num">{fmtNum(s.lines.reduce((a, l) => a + l.qty, 0))}</td>
              <td class="num">{fmtNum(total(s), 2)}</td>
              <td class="num">{fmtNum(s.paid, 2)}</td>
              <td><Badge status={s.status} /></td>
            </tr>
          {:else}{#if list}<tr><td colspan="10" class="empty">No sales match these filters</td></tr>{/if}{/each}
        </tbody>
      </table>
    </div>
    <p class="caption" style="margin-top:var(--space-2)">{#if rows.length > 100}Showing latest 100 of {fmtNum(rows.length)} — server-side paging in the real build. {/if}Returns and credit notes that restore stock (SL-04) come in the follow-on release.</p>
  </div>

  <aside class="card flush">
    <header><h3>Outstanding by customer</h3></header>
    <ul class="list">
      {#each balances as [c, b]}<li><span class="grow">{c}</span><strong class="num">{fmtMoney(b)}</strong></li>{:else}<li class="empty small">No outstanding balances</li>{/each}
    </ul>
  </aside>
</div>

<dialog class="sheet" bind:this={dialog} style="width:min(720px,calc(100vw - 32px))">
  <form class="body stack" onsubmit={save}>
    <h3>New sale</h3>
    <div class="form-grid">
      <label class="field"><span>Warehouse</span><select class="select" bind:value={wh} onchange={changeWh}>{#each warehouses as w}<option value={w.id}>{w.name}</option>{/each}</select></label>
      <label class="field"><span>Customer</span><input class="input" bind:value={customer} list="customers" /></label>
      <label class="field"><span>Type</span><select class="select" bind:value={kind}><option>Cash</option><option>Credit</option><option>Batch</option></select></label>
    </div>
    <datalist id="customers"><option>Walk-in</option><option>Kimironko Wholesale</option><option>Goma Depot</option><option>Konyo Konyo Traders</option></datalist>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Brand · Package</th><th class="num">Available</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Amount</th><th></th></tr></thead>
      <tbody>
        {#each lines as l, i}
          <tr>
            <td style="min-width:240px"><select class="select" bind:value={l.productId} onchange={() => (l.price = sellPrice(l.productId))}>{#each inStock as x}<option value={x.productId}>{lookup.product(x.productId)?.brand} · {lookup.product(x.productId)?.pack}</option>{/each}</select></td>
            <td class="num" class:muted={l.qty <= avail(l.productId)} class:accent-text={l.qty > avail(l.productId)}>{fmtNum(avail(l.productId))}</td>
            <td class="num"><input class="input num" type="number" min="0" step="1" bind:value={l.qty} style="width:90px" aria-invalid={l.qty > avail(l.productId)} /></td>
            <td class="num"><input class="input num" type="number" step="0.01" bind:value={l.price} style="width:90px" disabled={!user.roles.includes('director')} /></td>
            <td class="num">{fmtNum(amount(l.qty || 0, l.price || 0), 2)}</td>
            <td><button type="button" class="btn btn-ghost btn-sm" onclick={() => lines.splice(i, 1)} aria-label="Remove"><Trash size={16} /></button></td>
          </tr>
        {/each}
        <tr class="grand"><td colspan="4">Total (USD)</td><td class="num">{fmtNum(saleTotal, 2)}</td><td></td></tr>
      </tbody>
    </table></div>
    <div class="row between">
      <button type="button" class="btn btn-ghost btn-sm" onclick={addLine} disabled={!inStock.length}><Plus size={16} />Add line</button>
      <label class="field" style="width:180px"><span>Amount paid (USD)</span><input class="input num" type="number" step="0.01" bind:value={paid} /></label>
    </div>
    {#if user.roles.includes('director')}<label class="row small"><input type="checkbox" bind:checked={override} /> Override stock check (authorised, logged — SL-02)</label>{/if}
    {#if error}<div class="error" role="alert">{error}</div>{/if}
    <p class="caption">Only SKUs with stock at this warehouse are offered (§7.4). Default price from the price list; changes need permission (Q12). Stock reduces automatically on save. {#if kind === 'Batch'}Batch sale definition to confirm (Q-P5).{/if}</p>
    <div class="row" style="justify-content:flex-end"><button type="button" class="btn btn-ghost" onclick={() => dialog?.close()}>Cancel</button><button class="btn btn-primary" disabled={busy}>Record sale</button></div>
  </form>
</dialog>

<style>
  .layout { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: var(--space-4); align-items: start; }
  @media (max-width: 1100px) { .layout { grid-template-columns: minmax(0, 1fr); } }
  .list { list-style: none; margin: 0; padding: 0; }
  .list li { display: flex; gap: var(--space-3); padding: var(--space-3) var(--space-5); border-bottom: 1px solid var(--border); }
  .list li:last-child { border-bottom: 0; }
</style>
