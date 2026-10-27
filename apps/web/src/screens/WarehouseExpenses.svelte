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
  import { PageHeader, SummaryStrip, FilterBar, EmptyState, queryFilters, readQuery, type SummaryTile } from '../components/page';
  import { expenseTiles, infoOf } from '../lib/tiles';
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
  const hadFilter = ['show', 'wh', 'cat', 'from', 'to'].some((k) => readQuery(k));
  const f = queryFilters({ show: '', wh: '', cat: '', from: '', to: '' });
  if (!hadFilter) f.set('show', 'month');
  // the strip covers this month and last month in every warehouse of the person's scope (independent of the list filters)
  let recent = $state<WarehouseExpense[] | null>(null);
  let rows = $state<WarehouseExpense[] | null>(null);
  const w = watch(async () => {
    [rows, recent] = await Promise.all([
      warehouse.expenses({ warehouseId: f.values.wh || undefined, category: f.values.cat || undefined, from: f.values.from || monthStart(f.values.show === 'month' || f.values.show === 'top' ? 0 : f.values.show === 'last' ? 1 : 3), to: f.values.to || undefined }),
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
  const active = $derived(['show', 'wh', 'cat', 'from', 'to'].filter((k) => f.values[k as 'show'] && f.values[k as 'show'] !== 'all').length);

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
  const listRows = () => [['Date', 'Warehouse', 'Category', 'Amount', 'Currency', 'USD', 'Reference', 'Note', 'Receipt', 'Recorded by'], ...shown.map((x) => [x.date, lookup.warehouse(x.warehouseId)?.name ?? '', x.category, x.amount, x.currency, x.amountUsd, x.reference ?? '', x.note ?? '', x.receipt?.name ?? '', lookup.user(x.byUserId)?.name ?? x.byUserId])];
</script>

<PageHeader overline="Stock & sales" title="Warehouse expenses" description="Offloading, storage, salaries, rent, utilities and damaged goods of {mine.length === 1 ? mine[0].name : 'our warehouses'}." analysis="warehouse"
  info="Amounts in local currency are converted to USD at the approved rate of the month. Each month's expenses are spread over the goods received that month in the landed cost.">
  {#snippet secondary()}<ExportMenu name="warehouse-expenses" rows={listRows} />{/snippet}
  {#snippet primary()}{#if mine.length}<button class="btn btn-primary" onclick={() => { form = blank(); err = ''; }}><Plus size={16} aria-hidden="true" />Record an expense</button>{/if}{/snippet}
</PageHeader>

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
<FilterBar {active} onclear={() => f.clear()}>
  <label class="field"><span>Warehouse</span><select class="select" value={f.values.wh} onchange={(e) => f.set('wh', e.currentTarget.value)}><option value="">All {mine.length > 1 ? 'my warehouses' : ''}</option>{#each mine as x (x.id)}<option value={x.id}>{x.name}</option>{/each}</select></label>
  <label class="field"><span>Category</span><select class="select" value={f.values.cat} onchange={(e) => f.set('cat', e.currentTarget.value)}><option value="">All categories</option>{#each catList as c}<option value={c}>{c}</option>{/each}</select></label>
  <label class="field"><span>From</span><input class="input" type="date" value={f.values.from} onchange={(e) => f.set('from', e.currentTarget.value)} /></label>
  <label class="field"><span>To</span><input class="input" type="date" value={f.values.to} onchange={(e) => f.set('to', e.currentTarget.value)} /></label>
  {#snippet end()}{#if rows}<span class="caption">{shown.length} expenses · {usd(Math.round(shown.reduce((a, x) => a + x.amountUsd, 0)))}</span>{/if}{/snippet}
</FilterBar>

<div class="card flush table-wrap">
  <table class="table">
    <thead><tr><th>Date</th><th>Warehouse</th><th>Category</th><th class="num">Amount</th><th class="num">USD</th><th>Reference · note</th><th>Receipt</th><th>By</th><th><span class="sr-only">Actions</span></th></tr></thead>
    <tbody>
      {#if !rows}{#each Array(3) as _}<tr><td colspan="9"><div class="skeleton"></div></td></tr>{/each}{/if}
      {#each shown as x (x.id)}
        <tr>
          <td class="nowrap small">{fmtDate(x.date)}</td><td>{lookup.warehouse(x.warehouseId)?.name}</td><td>{x.category}</td>
          <td class="num nowrap">{x.currency} {fmtNum(x.amount, x.currency === 'USD' ? 2 : 0)}</td><td class="num">{fmtNum(x.amountUsd, 2)}</td>
          <td class="small">{x.reference ?? ''}{#if x.note}<div class="caption">{x.note}</div>{/if}</td>
          <td class="small">{#if x.receipt}{#if x.receipt.url}<a href={x.receipt.url} target="_blank" rel="noopener">{x.receipt.name}</a>{:else}{x.receipt.name}{/if}{:else}<span class="caption">—</span>{/if}</td>
          <td class="small">{lookup.user(x.byUserId)?.name ?? x.byUserId}</td>
          <td class="nowrap">{#if canEditExpense(me, x)}<button class="btn btn-ghost btn-sm" onclick={() => edit(x)}>Edit</button><button class="btn btn-ghost btn-sm" onclick={() => remove(x)}>Remove</button>{/if}</td>
        </tr>
      {:else}{#if rows}<tr><td colspan="9"><EmptyState title={active ? 'No expenses match these filters' : 'No expenses recorded yet'} icon={SearchX} compact>{#if active}<button class="btn btn-secondary btn-sm" onclick={() => f.clear()}>Clear filters</button>{/if}</EmptyState></td></tr>{/if}{/each}
    </tbody>
  </table>
</div>

<style>
  .form-card { margin-bottom: var(--space-4); display: grid; gap: var(--space-3); }
  .wide { grid-column: span 2; }
  .error { color: var(--danger); }
  .nowrap { white-space: nowrap; }
  @media (max-width: 640px) { .wide { grid-column: auto; } }
</style>
