<script lang="ts">
  // docs/14 B-01: warehouse expenses (roles document §9) — offloading, storage, salary, rent, utilities, damaged goods.
  // Receivers record their own warehouses' (Asie: Gisenyi + Goma, Yonas: Juba); directors see and correct all. Monthly
  // totals by category (USD at the approved month rate); the expenses feed landed cost v2 (docs/14 §4).
  // docs/17 Phase 1: work page — opens on this month's expense list with a strip from the metric registry (this month ·
  // vs last month · largest category); the monthly / category charts are on Home · Warehouse.
  import { withUnusualConfirm } from '@btw/api/amounts';
  import { auth, ref, lookup, warehouse, type Currency, type User, type WarehouseExpense, type WarehouseExpenseCategory } from '@btw/api';
  import { fmtDate, fmtNum, say } from '@btw/ui';
  import { CURRENCIES, WAREHOUSE_EXPENSE_CATEGORIES, canEditExpense, validateExpense } from '@btw/api/money';
  import { PageHeader, SummaryStrip, EmptyState, DataTable, Tabs, queryFilters, readQuery, tableQuery, processRows, ts, type Column, type SummaryTile } from '../components/page';
  import { expenseTiles, infoOf } from '../lib/tiles';
  import WarehouseCashTab from '../components/WarehouseCashTab.svelte';
  import ExportMenu from '../components/ExportMenu.svelte';
  import Plus from '@lucide/svelte/icons/plus';
  import SearchX from '@lucide/svelte/icons/search-x';
  import { attempt, watch } from '../lib/load.svelte';
  import { uploadPhoto } from '../lib/upload';
  import ErrorState from '../components/ErrorState.svelte';
  let { user }: { params?: any; user: User } = $props();

  const mine = $derived(ref().warehouses.filter((w) => user.roles.some((r) => r === 'director' || r === 'admin') || user.warehouseIds.includes(w.id)));
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = (n: number) => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - n, 1)).toISOString().slice(0, 10); };
  // filters in the address; the list opens on this month (show=month) unless a filter is given
  const hadFilter = ['show', 'wh', 'cat', 'from', 'to', 'q', 'by', 'usd'].some((k) => readQuery(k));
  const f = queryFilters({ show: '', wh: '', cat: '', from: '', to: '', q: '', by: '', usd: '' });
  // V3-12 step 4: Expenses | Cash (cash at start, cash sent to the company account)
  const view = queryFilters({ view: '' });
  const VIEWS = [{ key: 'expenses', label: 'Expenses' }, { key: 'cash', label: 'Cash' }] as const;
  // V3-8: search + Warehouse / Category / By / USD filters in the table; From / To stay (they choose the period loaded)
  const tq = tableQuery(f, { search: 'q', filters: { wh: 'wh', cat: 'cat', by: 'by', usd: ['usd', 'range'] } });
  const one = (v: string) => (v && !v.includes(',') ? v : undefined); // the server takes one warehouse / category
  if (!hadFilter) f.set('show', 'month');
  // the strip covers this month and last month in every warehouse of the person's scope (independent of the list filters)
  let recent = $state<WarehouseExpense[] | null>(null);
  let rows = $state<WarehouseExpense[] | null>(null);
  const w = watch(async () => {
    [rows, recent] = await Promise.all([
      warehouse.expenses({ warehouseId: one(f.values.wh), category: one(f.values.cat) as WarehouseExpenseCategory | undefined, from: f.values.from || monthStart(f.values.show === 'month' || f.values.show === 'top' ? 0 : f.values.show === 'last' ? 1 : 3), to: f.values.to || undefined }),
      warehouse.expenses({ from: monthStart(1) }),
    ]);
  }, () => [f.values.wh, f.values.cat, f.values.from, f.values.to, f.values.show]);
  const usd = (n: number) => `USD ${fmtNum(n)}`;
  const catList = WAREHOUSE_EXPENSE_CATEGORIES;
  // docs/18: strip figures from the registry
  const fig = $derived(expenseTiles(recent ?? []));
  const tiles = $derived<SummaryTile[]>([
    { key: 'month', label: 'This month', value: recent ? fig.month : null, format: usd, info: infoOf('expensesMonth') },
    { key: 'last', label: 'Last month', value: recent ? fig.last : null, format: usd, sub: fig.change === null ? undefined : `${fig.change > 0 ? '+' : ''}${Math.round(fig.change * 100)} % this month vs last`, info: infoOf('expensesLastMonth') },
    { key: 'top', label: 'Largest category', value: recent ? (fig.top?.category ?? null) : null, sub: fig.top ? `${usd(fig.top.usd)} this month` : undefined, info: infoOf('expensesTop') },
  ]);
  const inMonth = (x: WarehouseExpense, n: number) => x.date >= monthStart(n) && x.date < monthStart(n - 1);
  const SHOW: Record<string, (x: WarehouseExpense) => boolean> = { month: (x) => inMonth(x, 0), last: (x) => inMonth(x, 1), top: (x) => inMonth(x, 0) && x.category === fig.top?.category };
  const shown = $derived((rows ?? []).filter((x) => !f.values.show || SHOW[f.values.show]?.(x) !== false));
  const active = $derived(['show', 'wh', 'cat', 'from', 'to', 'q', 'by', 'usd'].filter((k) => f.values[k as 'show'] && f.values[k as 'show'] !== 'all').length);
  const whName = (id: string) => lookup.warehouse(id)?.name ?? id;
  const byName = (id: string) => lookup.user(id)?.name ?? id;
  const columns: Column<WarehouseExpense>[] = [
    { key: 'date', label: 'Date', sortValue: (x) => ts(x.date), csv: (x) => x.date, cell: dateCell, class: 'nowrap small' },
    { key: 'wh', label: 'Warehouse', value: (x) => whName(x.warehouseId), filter: 'select', filterValue: (x) => x.warehouseId, filterLabel: whName },
    { key: 'cat', label: 'Category', value: (x) => x.category, filter: 'select' },
    { key: 'amount', label: 'Amount', align: 'right', sortValue: (x) => x.amount, value: (x) => `${x.currency} ${fmtNum(x.amount, x.currency === 'USD' ? 2 : 0)}`, class: 'nowrap' },
    { key: 'usd', label: 'USD', align: 'right', filter: 'range', sortValue: (x) => x.amountUsd, value: (x) => fmtNum(x.amountUsd, 2), total: (l) => fmtNum(l.reduce((a, x) => a + x.amountUsd, 0), 2) },
    { key: 'ref', label: 'Reference · note', value: (x) => [x.reference, x.note].filter(Boolean).join(' · ') || null, cell: refCell, class: 'small', hideBelow: 900 },
    { key: 'receipt', label: 'Receipt', value: (x) => x.receipt?.name ?? null, cell: receiptCell, class: 'small', hideBelow: 1100 },
    { key: 'by', label: 'By', value: (x) => byName(x.byUserId), class: 'small', filter: 'select', filterValue: (x) => x.byUserId, filterLabel: byName, hideBelow: 1000 },
    { key: 'act', label: '', sortable: false, csv: false, hideable: false, searchable: false, cell: actCell, class: 'nowrap', mobile: 'actions' },
  ];
  // what the table shows (also the export)
  const tableRows = $derived(processRows({ rows: shown, columns, rowKey: (x) => x.id, sort: null, search: f.values.q, filters: tq.filters.get() }).rows);

  // form (add / edit)
  type Form = { id?: string; warehouseId: string; date: string; category: WarehouseExpenseCategory; amount: number | null; currency: Currency; reference: string; note: string; receipt?: { id: string; url: string; name: string } | null };
  const blank = (): Form => ({ warehouseId: mine[0]?.id ?? '', date: today, category: 'Offloading', amount: null, currency: 'USD', reference: '', note: '', receipt: null });
  let form = $state<Form | null>(null);
  let err = $state(''); let busy = $state(false);
  const problems = $derived(form ? validateExpense({ ...form, amount: form.amount ?? undefined }, { warehouseIds: mine.map((x) => x.id) }) : []);
  function edit(x: WarehouseExpense) { form = { id: x.id, warehouseId: x.warehouseId, date: x.date, category: x.category, amount: x.amount, currency: x.currency, reference: x.reference ?? '', note: x.note ?? '', receipt: x.receipt ? { id: x.receipt.id, url: x.receipt.url ?? '', name: x.receipt.name } : null }; err = ''; }
  async function photo(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0]; if (!f || !form) return;
    busy = true; err = await attempt(async () => { form!.receipt = await uploadPhoto(f); }); busy = false;
  }
  async function save() {
    if (!form || problems.length) { err = problems.join(' · '); return; }
    busy = true;
    const input = { warehouseId: form.warehouseId, date: form.date, category: form.category, amount: Number(form.amount), currency: form.currency, reference: form.reference || null, note: form.note || null,
      receiptFileId: form.receipt?.id ?? null, receiptName: form.receipt?.name ?? null, receiptUrl: form.receipt?.url || null };
    let saved = true;
    err = await attempt(async () => { saved = !!(await withUnusualConfirm((confirmUnusual) => (form!.id ? warehouse.updateExpense(form!.id, { ...input, confirmUnusual }) : warehouse.addExpense({ ...input, confirmUnusual })))); });
    busy = false;
    if (!err && saved) { say(form.id ? 'Expense updated' : 'Expense recorded'); form = null; }
  }
  async function remove(x: WarehouseExpense) {
    if (!confirm(`Remove ${x.category} ${x.currency} ${fmtNum(x.amount)} of ${fmtDate(x.date)}?`)) return;
    const e = await attempt(() => warehouse.deleteExpense(x.id)); if (e) say(e); else say('Expense removed');
  }
  const me = $derived({ ...user, id: auth.me()?.id ?? user.id });
  const listRows = () => [['Date', 'Warehouse', 'Category', 'Amount', 'Currency', 'USD', 'Reference', 'Note', 'Receipt', 'Recorded by'], ...tableRows.map((x) => [x.date, lookup.warehouse(x.warehouseId)?.name ?? '', x.category, x.amount, x.currency, x.amountUsd, x.reference ?? '', x.note ?? '', x.receipt?.name ?? '', lookup.user(x.byUserId)?.name ?? x.byUserId])];
</script>

<PageHeader overline="Stock & sales" title="Warehouse expenses" description="Offloading, storage, salaries, rent, utilities and damaged goods of {mine.length === 1 ? mine[0].name : 'our warehouses'}." analysis="warehouse"
  info="Amounts in local currency are converted to USD at the approved rate of the month. Each month's expenses are spread over the goods received that month in the landed cost.">
  {#snippet secondary()}{#if view.values.view !== 'cash'}<ExportMenu name="warehouse-expenses" rows={listRows} />{/if}{/snippet}
  {#snippet primary()}{#if mine.length && view.values.view !== 'cash'}<button class="btn btn-primary" onclick={() => { form = blank(); err = ''; }}><Plus size={16} aria-hidden="true" />Record an expense</button>{/if}{/snippet}
</PageHeader>

<Tabs label="Warehouse expenses" tabs={VIEWS} value={view.values.view === 'cash' ? 'cash' : 'expenses'} onselect={(k) => view.set('view', k === 'expenses' ? '' : k)} />
{#if view.values.view === 'cash'}
  <WarehouseCashTab />
{:else}
{#if form}
  <section class="card form-card" aria-label={form.id ? 'Edit expense' : 'New expense'}>
    <h2 class="h4">{form.id ? 'Edit expense' : 'New expense'}</h2>
    <div class="form-grid">
      <label class="field"><span>Warehouse</span><select class="select" bind:value={form.warehouseId}>{#each mine as x (x.id)}<option value={x.id}>{x.name}</option>{/each}</select></label>
      <label class="field"><span>Date</span><input class="input" type="date" max={today} bind:value={form.date} /></label>
      <label class="field"><span>Category</span><select class="select" bind:value={form.category}>{#each catList as c}<option value={c}>{c}</option>{/each}</select></label>
      <label class="field"><span>Amount</span><input class="input num" type="number" min="0" step="0.01" inputmode="decimal" bind:value={form.amount} /></label>
      <label class="field"><span>Currency</span><select class="select" bind:value={form.currency}>{#each CURRENCIES as c}<option value={c}>{c}</option>{/each}</select></label>
      <label class="field"><span>Reference (invoice, receipt no.)</span><input class="input" bind:value={form.reference} maxlength="200" /></label>
      <label class="field wide"><span>Note</span><input class="input" bind:value={form.note} maxlength="1000" placeholder="What it was for" /></label>
      <label class="field"><span>Receipt photo (optional)</span><input class="input" type="file" accept="image/*,application/pdf" onchange={photo} />{#if form.receipt}<span class="caption">Attached: {form.receipt.name}</span>{/if}</label>
    </div>
    {#if err}<p class="error small" role="alert">{err}</p>{/if}
    <div class="row"><button class="btn btn-primary" disabled={busy} onclick={save}>{form.id ? 'Save changes' : 'Record expense'}</button><button class="btn btn-ghost" onclick={() => (form = null)}>Cancel</button></div>
  </section>
{/if}

<ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />
<SummaryStrip {tiles} bind:value={f.values.show} param="show" label="Warehouse expenses summary" allValue="all" noun="expenses" shown={rows ? shown.length : null} />


<DataTable id="wh-expenses" label="Warehouse expenses" noun="expenses" rows={rows ? shown : null} {columns} rowKey={(x) => x.id} initialSort={{ key: 'date', dir: 'desc' }} filename="warehouse-expenses-list"
  searchable searchPlaceholder="Category, reference, note, who…" bind:search={tq.search.get, tq.search.set} bind:filters={tq.filters.get, tq.filters.set}>
  {#snippet toolbar()}
    <label class="dt-date"><span class="caption">From</span><input class="input" type="date" value={f.values.from} onchange={(e) => f.set('from', e.currentTarget.value)} /></label>
    <label class="dt-date"><span class="caption">To</span><input class="input" type="date" value={f.values.to} onchange={(e) => f.set('to', e.currentTarget.value)} /></label>
  {/snippet}
  {#snippet empty()}<EmptyState title={active ? 'No expenses match these filters' : 'No expenses recorded yet'} icon={SearchX} compact>{#if active}<button class="btn btn-secondary btn-sm" onclick={() => f.clear()}>Clear filters</button>{/if}</EmptyState>{/snippet}
</DataTable>

{/if}

{#snippet dateCell(x: WarehouseExpense)}{fmtDate(x.date)}{/snippet}
{#snippet refCell(x: WarehouseExpense)}{x.reference ?? ''}{#if x.note}<div class="caption">{x.note}</div>{/if}{/snippet}
{#snippet receiptCell(x: WarehouseExpense)}{#if x.receipt}{#if x.receipt.url}<a href={x.receipt.url} target="_blank" rel="noopener">{x.receipt.name}</a>{:else}{x.receipt.name}{/if}{:else}<span class="caption">-</span>{/if}{/snippet}
{#snippet actCell(x: WarehouseExpense)}{#if canEditExpense(me, x)}<button class="btn btn-ghost btn-sm" onclick={() => edit(x)}>Edit</button><button class="btn btn-ghost btn-sm" onclick={() => remove(x)}>Remove</button>{/if}{/snippet}

<style>
  .form-card { margin-bottom: var(--space-4); display: grid; gap: var(--space-3); }
  .wide { grid-column: span 2; }
  .error { color: var(--danger); }
  .dt-date { display: inline-flex; align-items: center; gap: 6px; }
  .dt-date .input { height: var(--control-sm); width: auto; border-radius: 999px; }
  @media (max-width: 640px) { .wide { grid-column: auto; } }
</style>
