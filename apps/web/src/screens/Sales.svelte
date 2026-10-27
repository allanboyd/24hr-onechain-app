<script lang="ts">
  // Sales work page (docs/17 Phase 1): opens on the sales list (latest first) with a strip of the registry's sales figures
  // (same numbers as Home · Sales and Today), filters in the address and one "New sale" action. Charts: Home · Sales.
  // No needs-action default: people come here to record and look up sales; overdue balances are one click (the strip) and
  // on the directors' Today view.
  import { destinationLabel } from '../lib/planning';
  import CompanyCell from '../components/CompanyCell.svelte';
  import { scopeEntity } from '../lib/company.svelte';
  import { companyLabel } from '../lib/companies';
  import { watch } from '../lib/load.svelte';
  import ErrorState from '../components/ErrorState.svelte';
  import { amount, inventory, lookup, pricing, ref, reports, sales, type Sale, type SalesReport, type SellingPrice, type StockRow, type User } from '@btw/api';
  import { salesTiles, infoOf } from '../lib/tiles';
  import { PageHeader, SummaryStrip, FilterBar, ActionInCompany, EmptyState, queryFilters, takeIntent, type SummaryTile } from '../components/page';
  import { TERMS_DAYS } from '@btw/api/metrics';
  import SearchX from '@lucide/svelte/icons/search-x';
  import { sellingPriceAny } from '@btw/api/money';
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
  const f = queryFilters({ show: '', wh: '', status: '', kind: '', cust: '' });
  let search = $state(f.values.cust);
  $effect(() => { if (search !== f.values.cust) f.set('cust', search); });
  // docs/14 B-05: new sale lines start from the directors' selling price (warehouse price, else company price)
  let prices = $state<SellingPrice[]>([]);
  // docs/18: the tiles come from the sales report over every sale (the list holds the latest ones only) — same figures as Home
  let rep = $state<SalesReport | null>(null);
  const DAY = 864e5;
  const monthStart = (() => { const d = new Date(); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); })();
  async function load() {
    // this month to now: the same period as the Today view's Sales card
    [list, stock, prices, rep] = await Promise.all([sales.list(), inventory.stock(), pricing.list().catch(() => [] as SellingPrice[]), reports.sales({ from: new Date(monthStart).toISOString(), to: new Date(Date.now() + DAY).toISOString() }).catch(() => null)]);
    if (takeIntent('new-sale')) openNew();
  }
  const w = watch(load);
  const open = (s: Sale) => s.status !== 'Paid' && total(s) - s.paid > 0.005;
  const SHOW: Record<string, (s: Sale) => boolean> = { month: (s) => Date.parse(s.at) >= monthStart, owed: open, overdue: (s) => open(s) && Date.now() - Date.parse(s.at) > TERMS_DAYS * DAY };
  const rows = $derived((list ?? []).filter((s) => (!scoped || scoped.includes(s.warehouseId)) && (!f.values.show || SHOW[f.values.show]?.(s) !== false) && (!f.values.wh || s.warehouseId === f.values.wh) && (!f.values.status || s.status === f.values.status) && (!f.values.kind || s.kind === f.values.kind) && (!f.values.cust || s.customer.toLowerCase().includes(f.values.cust.toLowerCase()))));
  const total = (s: Sale) => s.lines.reduce((a, l) => a + amount(l.qty, l.price), 0);
  const balances = $derived.by(() => {
    const m = new Map<string, number>();
    for (const s of rows) { const b = total(s) - s.paid; if (b > 0.005) m.set(s.customer, (m.get(s.customer) ?? 0) + b); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  });

  // docs/18: figures from the sales report over every sale (USD, intercompany removed in the Group view) — same as Home
  const fig = $derived(rep ? salesTiles(rep) : null);
  const usd0 = (n: number) => `USD ${fmtNum(Math.round(n))}`;
  const tiles = $derived<SummaryTile[]>([
    { key: 'month', label: 'Sales this month', value: fig?.sales ?? null, format: usd0, sub: rep ? `${fmtNum(rep.totals.orders)} sales · ${fmtNum(rep.totals.cases)} cases` : undefined, info: infoOf('sales') },
    { key: 'owed', label: 'Owed by customers', value: fig?.owed ?? null, format: usd0, sub: balances.length ? `${balances.length} customers in this list` : undefined, info: infoOf('owed') },
    { key: 'overdue', label: 'Overdue', value: fig?.overdue ?? null, format: usd0, status: fig?.overdue ? 'warn' : undefined, statusLabel: fig?.overdue ? 'Chase' : undefined, sub: `over ${TERMS_DAYS} days`, info: infoOf('overdue') },
  ]);
  const active = $derived(['show', 'wh', 'status', 'kind'].filter((k) => f.values[k as 'show']).length);
  function clearAll() { f.clear(); search = ''; }
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
  const markup = 1.35; // fallback when no selling price is set yet: supplier price × 1.35
  const sellPrice = (pid: string) => sellingPriceAny(prices, stock.filter((x) => x.warehouseId === wh && x.productId === pid).map((x) => x.entityId), wh, pid) ?? Math.round(lookup.price(pid) * markup * 100) / 100;
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
      const s = await sales.create({ entityId: scopeEntity() ?? '', at: new Date().toISOString(), warehouseId: wh, customer, salespersonId: user.id, kind, lines: $state.snapshot(ls), currency: 'USD', paid }, override);
      dialog?.close(); say(`Sale ${s.ref} recorded for ${companyLabel(s.entityId)} — stock reduced`);
    } catch (err) { error = (err as Error).message; }
    busy = false;
  }
</script>

<PageHeader overline="Stock & sales" title="Sales" description="Cash, credit and batch sales from our warehouses." analysis="sales"
  info="Stock reduces when a sale is saved. Amounts are in USD at the approved month rate; in the Group view sales between our own companies are left out of the figures. Returns and credit notes that restore stock come in a later release.">
  {#snippet secondary()}<ExportMenu name="sales" rows={exportRows} />{/snippet}
  {#snippet primary()}<ActionInCompany label="New sale" what="sale" feature="sales" intent="new-sale" onclick={openNew} />{/snippet}
</PageHeader>
<ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />
<SummaryStrip {tiles} bind:value={f.values.show} param="show" label="Sales summary" />

<div class="layout">
  <div>
    <FilterBar bind:search searchLabel="Customer" placeholder="Search customer" {active} onclear={clearAll}>
      <label class="field"><span>Warehouse</span><select class="select" value={f.values.wh} onchange={(e) => f.set('wh', e.currentTarget.value)}><option value="">All</option>{#each warehouses as w}<option value={w.id}>{destinationLabel(w.id)}</option>{/each}</select></label>
      <label class="field"><span>Payment</span><select class="select" value={f.values.status} onchange={(e) => f.set('status', e.currentTarget.value)}><option value="">All</option><option>Paid</option><option>Part-paid</option><option>Unpaid</option></select></label>
      <label class="field"><span>Type</span><select class="select" value={f.values.kind} onchange={(e) => f.set('kind', e.currentTarget.value)}><option value="">All</option><option>Cash</option><option>Credit</option><option>Batch</option></select></label>
      {#snippet end()}{#if list}<span class="caption">{fmtNum(rows.length)} sales</span>{/if}{/snippet}
    </FilterBar>
    <div class="card flush table-wrap">
      <table class="table">
        <thead><tr><CompanyCell head /><th>Sale No.</th><th>Date</th><th>Warehouse</th><th>Customer</th><th>Type</th><th>Brand · Package</th><th class="num">Qty</th><th class="num">Amount (USD)</th><th class="num">Paid</th><th>Status</th></tr></thead>
        <tbody>
          {#if !list}{#each Array(5) as _}<tr><td colspan="10"><div class="skeleton"></div></td></tr>{/each}{/if}
          {#each rows.slice(0, 100) as s (s.id)}
            <tr>
              <CompanyCell entityId={s.entityId} />
              <td class="mono small" style="white-space:nowrap">{s.ref}</td>
              <td class="small" style="white-space:nowrap">{fmtDateTime(s.at)}</td>
              <td class="small">{destinationLabel(s.warehouseId)}</td>
              <td>{s.customer}</td>
              <td><Badge tone={s.kind === 'Credit' ? 'warning' : s.kind === 'Batch' ? 'info' : 'neutral'}>{s.kind}</Badge></td>
              <td class="small">{#each s.lines as l}<div style="white-space:nowrap">{lookup.product(l.productId)?.brand}</div><div class="caption">{lookup.product(l.productId)?.pack}</div>{/each}</td>
              <td class="num">{fmtNum(s.lines.reduce((a, l) => a + l.qty, 0))}</td>
              <td class="num">{fmtNum(total(s), 2)}</td>
              <td class="num">{fmtNum(s.paid, 2)}</td>
              <td><Badge status={s.status} /></td>
            </tr>
          {:else}{#if list}<tr><td colspan="11"><EmptyState title="No sales match these filters" icon={SearchX} compact><button class="btn btn-secondary btn-sm" onclick={clearAll}>Clear filters</button></EmptyState></td></tr>{/if}{/each}
        </tbody>
      </table>
    </div>
    {#if rows.length > 100}<p class="caption" style="margin-top:var(--space-2)">Showing the latest 100 of {fmtNum(rows.length)}.</p>{/if}
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
      <label class="field"><span>Warehouse</span><select class="select" bind:value={wh} onchange={changeWh}>{#each warehouses as w}<option value={w.id}>{destinationLabel(w.id)}</option>{/each}</select></label>
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
    {#if user.roles.includes('director')}<label class="row small"><input type="checkbox" bind:checked={override} /> Override stock check (authorised, logged)</label>{/if}
    {#if error}<div class="error" role="alert">{error}</div>{/if}
    <p class="caption">Only SKUs with stock at this warehouse are offered. Default price = the directors' selling price (Selling prices), else the price list × 1.35; changes need permission. Stock reduces automatically on save. {#if kind === 'Batch'}Batch sale terms are still to be confirmed.{/if}</p>
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
