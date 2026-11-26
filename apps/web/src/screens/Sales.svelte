<script lang="ts">
  // Sales work page (docs/17 Phase 1): opens on the sales list (latest first) with a strip of the registry's sales figures
  // (same numbers as Home · Sales and Today), filters in the address and one "New sale" action. Charts: Home · Sales.
  // No needs-action default: people come here to record and look up sales; overdue balances are one click (the strip) and
  // on the directors' Today view.
  import { destinationLabel } from '../lib/planning';
  import CompanyMark from '../components/CompanyMark.svelte';
  import { company, GROUP } from '../lib/company.svelte';
  import { scopeEntity } from '../lib/company.svelte';
  import { companyLabel } from '../lib/companies';
  import { watch } from '../lib/load.svelte';
  import ErrorState from '../components/ErrorState.svelte';
  import { amount, clients, inventory, lookup, pricing, ref, reports, sales, type Client, type Sale, type SalesReport, type SellingPrice, type StockRow, type User } from '@btw/api';
  import { salesTiles, infoOf } from '../lib/tiles';
  import { PageHeader, SummaryStrip, ActionInCompany, DataTable, Tabs, queryFilters, takeIntent, intentGate, ts, tableQuery, processRows, type Column, type SummaryTile } from '../components/page';
  import { TERMS_DAYS, termsOf } from '@btw/api/metrics';
  import ClientsTab from '../components/ClientsTab.svelte';
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
  const f = queryFilters({ show: '', wh: '', status: '', kind: '', cust: '', amount: '', entity: '' });
  // V3-12: Sales | Clients (its own query key, so clearing the sales filters keeps the tab)
  const view = queryFilters({ view: '' });
  const VIEWS = [{ key: 'sales', label: 'Sales' }, { key: 'clients', label: 'Clients' }] as const;
  // V3-8: search (?cust=, kept for old links) + Warehouse / Type / Payment / Amount / Company filters in the table
  const tq = tableQuery(f, { search: 'cust', filters: { wh: 'wh', kind: 'kind', status: 'status', amount: ['amount', 'range'], company: 'entity' } });
  let shown = $state(0);
  // docs/14 B-05: new sale lines start from the directors' selling price (warehouse price, else company price)
  let prices = $state<SellingPrice[]>([]);
  // docs/18: the tiles come from the sales report over every sale (the list holds the latest ones only) — same figures as Home
  let rep = $state<SalesReport | null>(null);
  const DAY = 864e5;
  const monthStart = (() => { const d = new Date(); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); })();
  const stillHere = intentGate();
  async function load() {
    // this month to now: the same period as the Today view's Sales card
    [list, stock, prices, clientList, rep] = await Promise.all([sales.list(), inventory.stock(), pricing.list().catch(() => [] as SellingPrice[]), clients.list().catch(() => [] as Client[]), reports.sales({ from: new Date(monthStart).toISOString(), to: new Date(Date.now() + DAY).toISOString() }).catch(() => null)]);
    // The screen that is leaving also reloads when the company changes. Only the one still on screen may take the intent.
    if (stillHere() && takeIntent('new-sale')) { view.set('view', ''); openNew(); }
  }
  const w = watch(load);
  const open = (s: Sale) => s.status !== 'Paid' && total(s) - s.paid > 0.005;
  const SHOW: Record<string, (s: Sale) => boolean> = { month: (s) => Date.parse(s.at) >= monthStart, owed: open, overdue: (s) => open(s) && Date.now() - Date.parse(s.at) > termsOf(s) * DAY };
  // the strip (Show) stays here; the table applies search + filters on top. `tableRows` = what the table shows (balances, export)
  const rows = $derived((list ?? []).filter((s) => (!scoped || scoped.includes(s.warehouseId)) && (!f.values.show || SHOW[f.values.show]?.(s) !== false)));
  const inScope = $derived((list ?? []).filter((s) => !scoped || scoped.includes(s.warehouseId)).length);
  const total = (s: Sale) => s.lines.reduce((a, l) => a + amount(l.qty, l.price), 0);
  const balances = $derived.by(() => {
    const m = new Map<string, number>();
    for (const s of tableRows) { const b = total(s) - s.paid; if (b > 0.005) m.set(s.customer, (m.get(s.customer) ?? 0) + b); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  });

  // docs/18: figures from the sales report over every sale (USD, intercompany removed in the Group view) — same as Home
  const fig = $derived(rep ? salesTiles(rep) : null);
  const usd0 = (n: number) => `USD ${fmtNum(Math.round(n))}`;
  const tiles = $derived<SummaryTile[]>([
    { key: 'month', label: 'Sales this month', value: fig?.sales ?? null, format: usd0, sub: rep ? `${fmtNum(rep.totals.orders)} sales · ${fmtNum(rep.totals.cases)} cases` : undefined, info: infoOf('sales') },
    { key: 'owed', label: 'Owed by customers', value: fig?.owed ?? null, format: usd0, sub: balances.length ? `${balances.length} customers in this list` : undefined, info: infoOf('owed') },
    { key: 'overdue', label: 'Overdue', value: fig?.overdue ?? null, format: usd0, status: fig?.overdue ? 'warn' : undefined, statusLabel: fig?.overdue ? 'Chase' : undefined, sub: 'past each client\'s credit days', info: infoOf('overdue') },
  ]);
  function clearAll() { f.clear(); }
  const exportRows = () => [['Sale No.', 'Date', 'Warehouse', 'Customer', 'Type', 'SKU', 'Qty (cases)', 'Price (USD)', 'Amount (USD)', 'Paid (USD)', 'Status'],
    ...tableRows.flatMap((s) => s.lines.map((l) => [s.ref, s.at.slice(0, 10), lookup.warehouse(s.warehouseId)!.name, s.customer, s.kind, lookup.product(l.productId)!.sku, l.qty, l.price, amount(l.qty, l.price), s.paid, s.status]))];

  const kindTone = (k: Sale['kind']) => (k === 'Credit' ? 'warning' : k === 'Batch' ? 'info' : 'neutral');
  const qtyOf = (s: Sale) => s.lines.reduce((a, l) => a + l.qty, 0);
  const columns = $derived<Column<Sale>[]>([
    ...(company.active === GROUP ? [{ key: 'company', label: 'Company', value: (s: Sale) => companyLabel(s.entityId), cell: companyCell, hideBelow: 760, mobile: false as const, filter: 'select' as const, filterValue: (s: Sale) => s.entityId, filterLabel: (id: string) => companyLabel(id) }] : []),
    { key: 'ref', label: 'Sale No.', sticky: true, value: (s) => s.ref, class: 'mono small nowrap' },
    { key: 'at', label: 'Date', sortValue: (s) => ts(s.at), csv: (s) => s.at.slice(0, 16).replace('T', ' '), cell: dateCell, class: 'small nowrap' },
    { key: 'wh', label: 'Warehouse', value: (s) => destinationLabel(s.warehouseId), class: 'small', hideBelow: 1000, filter: 'select', filterValue: (s) => s.warehouseId, filterLabel: (id) => destinationLabel(id) },
    { key: 'customer', label: 'Client', value: (s) => s.customer },
    { key: 'kind', label: 'Type', value: (s) => s.kind, cell: kindCell, filter: 'select' },
    { key: 'lines', label: 'Brand · Package', sortable: false, csv: (s) => s.lines.map((l) => `${lookup.product(l.productId)?.brand} ${lookup.product(l.productId)?.pack}`).join('; '), cell: linesCell, class: 'small', hideBelow: 1100 },
    { key: 'qty', label: 'Qty', align: 'right', sortValue: qtyOf, value: (s) => fmtNum(qtyOf(s)), csv: qtyOf, total: (l) => fmtNum(l.reduce((a, s) => a + qtyOf(s), 0)) },
    { key: 'amount', label: 'Amount (USD)', align: 'right', filter: 'range', sortValue: total, value: (s) => fmtNum(total(s), 2), csv: (s) => Math.round(total(s) * 100) / 100, total: (l) => fmtNum(l.reduce((a, s) => a + total(s), 0), 2) },
    { key: 'paid', label: 'Paid', align: 'right', hideBelow: 1000, sortValue: (s) => s.paid, value: (s) => fmtNum(s.paid, 2), csv: (s) => s.paid, total: (l) => fmtNum(l.reduce((a, s) => a + s.paid, 0), 2) },
    { key: 'status', label: 'Payment', value: (s) => s.status, cell: statusCell, mobile: 'aside', filter: 'select' },
  ]);
  const tableRows = $derived(processRows({ rows, columns, rowKey: (s) => s.id, sort: null, search: f.values.cust, filters: tq.filters.get() }).rows);

  // New sale dialog
  let dialog = $state<HTMLDialogElement>();
  let wh = $state('');
  let customer = $state('Walk-in');
  let clientList = $state<Client[]>([]);
  // V3-12: the client is picked from the company's clients; a new name is added as a client when the sale is saved
  const saleEntity = $derived(scopeEntity());
  const pickable = $derived(clientList.filter((c) => c.active && (!saleEntity || c.entityId === saleEntity)));
  const key = (n: string) => n.trim().replace(/\s+/g, ' ').toLowerCase();
  const picked = $derived(pickable.find((c) => key(c.name) === key(customer)) ?? null);
  const offDuty = $derived(clientList.find((c) => !c.active && (!saleEntity || c.entityId === saleEntity) && key(c.name) === key(customer)) ?? null);
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
      if (customer.trim().length < 1) { error = 'Enter the client'; busy = false; return; }
      const s = await sales.create({ entityId: scopeEntity() ?? '', at: new Date().toISOString(), warehouseId: wh, customer: picked?.name ?? customer.trim(), clientId: picked?.id, salespersonId: user.id, kind, lines: $state.snapshot(ls), currency: 'USD', paid }, override);
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
<Tabs label="Sales" tabs={VIEWS} value={view.values.view === 'clients' ? 'clients' : 'sales'} onselect={(k) => view.set('view', k === 'sales' ? '' : k)} />
{#if view.values.view === 'clients'}
  <ClientsTab {user} />
{:else}
<ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />
<SummaryStrip {tiles} bind:value={f.values.show} param="show" label="Sales summary" noun="sales" total={list ? inScope : null} shown={list ? shown : null} />

<div class="layout">
  <div>

    <DataTable id="sales" label="Sales" noun="sales" rows={list ? rows : null} {columns} rowKey={(s) => s.id} initialSort={{ key: 'at', dir: 'desc' }} filename="sales-list" onclear={clearAll}
      searchable searchPlaceholder="Customer, sale No., brand…" bind:search={tq.search.get, tq.search.set} bind:filters={tq.filters.get, tq.filters.set} bind:shown />
  </div>

  <aside class="card flush">
    <header><h3>Outstanding by customer</h3></header>
    <ul class="list">
      {#each balances as [c, b]}<li><span class="grow">{c}</span><strong class="num">{fmtMoney(b)}</strong></li>{:else}<li class="empty small">No outstanding balances</li>{/each}
    </ul>
  </aside>
</div>
{/if}

{#snippet companyCell(s: Sale)}<span class="cc"><CompanyMark entityId={s.entityId ?? null} size={18} />{companyLabel(s.entityId)}</span>{/snippet}
{#snippet dateCell(s: Sale)}{fmtDateTime(s.at)}{/snippet}
{#snippet kindCell(s: Sale)}<Badge tone={kindTone(s.kind)}>{s.kind}</Badge>{/snippet}
{#snippet linesCell(s: Sale)}{#each s.lines as l}<div style="white-space:nowrap">{lookup.product(l.productId)?.brand}</div><div class="caption">{lookup.product(l.productId)?.pack}</div>{/each}{/snippet}
{#snippet statusCell(s: Sale)}<Badge status={s.status} />{/snippet}

<dialog class="sheet" bind:this={dialog} style="width:min(720px,calc(100vw - 32px))">
  <form class="body stack" onsubmit={save}>
    <h3>New sale</h3>
    <div class="form-grid">
      <label class="field"><span>Warehouse</span><select class="select" bind:value={wh} onchange={changeWh}>{#each warehouses as w}<option value={w.id}>{destinationLabel(w.id)}</option>{/each}</select></label>
      <label class="field"><span>Client</span><input class="input" bind:value={customer} list="clients" autocomplete="off" aria-describedby="client-hint" />
        <small id="client-hint" class="caption" class:warn={!!offDuty}>{#if offDuty}{offDuty.name} is deactivated{:else if picked}{picked.termsDays === 0 ? 'Pays at once' : `${picked.termsDays} credit days`}{:else if customer.trim().length >= 1}New client: added with {TERMS_DAYS} credit days{:else}Pick or type a client{/if}</small></label>
      <label class="field"><span>Type</span><select class="select" bind:value={kind}><option>Cash</option><option>Credit</option><option>Batch</option></select></label>
    </div>
    <datalist id="clients">{#each pickable as c (c.id)}<option value={c.name}></option>{/each}</datalist>
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
  .cc { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; font-size: 13px; }
  .list { list-style: none; margin: 0; padding: 0; }
  .list li { display: flex; gap: var(--space-3); padding: var(--space-3) var(--space-5); border-bottom: 1px solid var(--border); }
  .list li:last-child { border-bottom: 0; }
  .warn { color: var(--warning); }
</style>
