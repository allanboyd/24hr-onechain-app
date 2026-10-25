<script lang="ts">
  // docs/14 B-01: warehouse expenses (roles document §9) — offloading, storage, salary, rent, utilities, damaged goods.
  // Receivers record their own warehouses' (Asie: Gisenyi + Goma, Yonas: Juba); directors see and correct all. Monthly
  // totals by category (USD at the approved month rate); the expenses feed landed cost v2 (docs/14 §4).
  import { auth, ref, lookup, warehouse, type Currency, type User, type WarehouseExpense, type WarehouseExpenseCategory } from '@btw/api';
  import { fmtDate, fmtNum, say } from '@btw/ui';
  import { CURRENCIES, WAREHOUSE_EXPENSE_CATEGORIES, canEditExpense, expenseSummary, validateExpense } from '@btw/api/money';
  import { BarChart } from '../components/charts';
  import { DashboardGrid, DashboardPanel } from '../components/dashboard';
  import { attempt, watch } from '../lib/load.svelte';
  import { uploadPhoto } from '../lib/upload';
  import ErrorState from '../components/ErrorState.svelte';
  let { user }: { params?: any; user: User } = $props();

  const mine = $derived(ref().warehouses.filter((w) => user.roles.some((r) => r === 'director' || r === 'admin') || user.warehouseIds.includes(w.id)));
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = (n: number) => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - n, 1)).toISOString().slice(0, 10); };
  let warehouseId = $state(''); let category = $state(''); let from = $state(monthStart(3)); let to = $state('');
  let rows = $state<WarehouseExpense[] | null>(null);
  const w = watch(async () => { rows = await warehouse.expenses({ warehouseId: warehouseId || undefined, category: category || undefined, from: from || undefined, to: to || undefined }); }, () => [warehouseId, category, from, to]);
  const sum = $derived(expenseSummary(rows ?? []));
  const usd = (n: number) => `USD ${fmtNum(n)}`;
  const catList = WAREHOUSE_EXPENSE_CATEGORIES;
  const series = $derived(catList.map((c, i) => ({ name: c, values: sum.byMonth.map((m) => m.byCategory[c]), slot: i })).filter((s) => s.values.some((v) => v > 0)));
  const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' });

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
    err = await attempt(() => (form!.id ? warehouse.updateExpense(form!.id, input) : warehouse.addExpense(input)));
    busy = false;
    if (!err) { say(form.id ? 'Expense updated' : 'Expense recorded'); form = null; }
  }
  async function remove(x: WarehouseExpense) {
    if (!confirm(`Remove ${x.category} ${x.currency} ${fmtNum(x.amount)} of ${fmtDate(x.date)}?`)) return;
    const e = await attempt(() => warehouse.deleteExpense(x.id)); if (e) say(e); else say('Expense removed');
  }
  const me = $derived({ ...user, id: auth.me()?.id ?? user.id });
  const listRows = () => [['Date', 'Warehouse', 'Category', 'Amount', 'Currency', 'USD', 'Reference', 'Note', 'Receipt', 'Recorded by'], ...(rows ?? []).map((x) => [x.date, lookup.warehouse(x.warehouseId)?.name ?? '', x.category, x.amount, x.currency, x.amountUsd, x.reference ?? '', x.note ?? '', x.receipt?.name ?? '', lookup.user(x.byUserId)?.name ?? x.byUserId])];
  const filterText = $derived([warehouseId ? lookup.warehouse(warehouseId)?.name : 'All my warehouses', category || 'All categories', from ? `from ${from}` : '', to ? `to ${to}` : ''].filter(Boolean).join(' · '));
</script>

<div class="page-head">
  <div><div class="overline crumb">Warehouse</div><h1>Warehouse expenses</h1>
    <p class="muted small">Offloading, storage, salary, rent, utilities and damaged goods of {mine.map((x) => x.name).join(', ') || 'your warehouses'}. Amounts in local currency are converted to USD at the approved rate of the month; they are spread over the goods received that month in the landed cost.</p></div>
  {#if mine.length}<button class="btn btn-primary" onclick={() => { form = blank(); err = ''; }}>Record an expense</button>{/if}
</div>

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

<div class="filters">
  <label class="field"><span>Warehouse</span><select class="select" bind:value={warehouseId}><option value="">All {mine.length > 1 ? 'my warehouses' : ''}</option>{#each mine as x (x.id)}<option value={x.id}>{x.name}</option>{/each}</select></label>
  <label class="field"><span>Category</span><select class="select" bind:value={category}><option value="">All categories</option>{#each catList as c}<option value={c}>{c}</option>{/each}</select></label>
  <label class="field"><span>From</span><input class="input" type="date" bind:value={from} /></label>
  <label class="field"><span>To</span><input class="input" type="date" bind:value={to} /></label>
</div>
<ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />

<DashboardGrid cols={2}>
  <DashboardPanel title="Expenses per month" subtitle="stacked by category" unit="USD" period={from ? `${from} – ${to || 'today'}` : 'All'} {filterText} updatedAt={new Date().toISOString()}
    definition="Sum of recorded warehouse expenses per calendar month, converted to USD at the approved month-average rate." loading={!rows && !w.error}
    rows={() => [['Month', ...catList, 'Total'], ...sum.byMonth.map((m) => [m.month, ...catList.map((c) => m.byCategory[c]), m.total])]} filename="warehouse-expenses-by-month">
    <BarChart label="Warehouse expenses per month by category, USD" categories={sum.byMonth.map((m) => monthLabel(m.month))} {series} stacked format={usd} />
  </DashboardPanel>
  <DashboardPanel title="Largest categories" subtitle="{usd(sum.total)} in {sum.count} expenses" unit="USD" {filterText} loading={!rows && !w.error}
    rows={() => [['Category', 'USD'], ...sum.byCategory.map((c) => [c.category, c.total])]} filename="warehouse-expenses-by-category">
    <BarChart label="Warehouse expenses by category, USD" categories={sum.byCategory.map((c) => c.category)} series={[{ name: 'USD', values: sum.byCategory.map((c) => c.total) }]} horizontal format={usd} />
  </DashboardPanel>
  <DashboardPanel span="full" title="Expenses" subtitle="newest first" unit="local currency · USD" {filterText} loading={!rows && !w.error} rows={listRows} filename="warehouse-expenses">
    <div class="table-wrap" style="max-height:520px">
      <table class="table">
        <thead><tr><th>Date</th><th>Warehouse</th><th>Category</th><th class="num">Amount</th><th class="num">USD</th><th>Reference · note</th><th>Receipt</th><th>By</th><th><span class="sr-only">Actions</span></th></tr></thead>
        <tbody>
          {#each rows ?? [] as x (x.id)}
            <tr>
              <td class="nowrap small">{fmtDate(x.date)}</td><td>{lookup.warehouse(x.warehouseId)?.name}</td><td>{x.category}</td>
              <td class="num nowrap">{x.currency} {fmtNum(x.amount, x.currency === 'USD' ? 2 : 0)}</td><td class="num">{fmtNum(x.amountUsd, 2)}</td>
              <td class="small">{x.reference ?? ''}{#if x.note}<div class="caption">{x.note}</div>{/if}</td>
              <td class="small">{#if x.receipt}{#if x.receipt.url}<a href={x.receipt.url} target="_blank" rel="noopener">{x.receipt.name}</a>{:else}{x.receipt.name}{/if}{:else}<span class="caption">—</span>{/if}</td>
              <td class="small">{lookup.user(x.byUserId)?.name ?? x.byUserId}</td>
              <td class="nowrap">{#if canEditExpense(me, x)}<button class="btn btn-ghost btn-sm" onclick={() => edit(x)}>Edit</button><button class="btn btn-ghost btn-sm" onclick={() => remove(x)}>Remove</button>{/if}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </DashboardPanel>
</DashboardGrid>

<style>
  .form-card { margin-bottom: var(--space-4); display: grid; gap: var(--space-3); }
  .wide { grid-column: span 2; }
  .error { color: var(--danger); }
  .nowrap { white-space: nowrap; }
  @media (max-width: 640px) { .wide { grid-column: auto; } }
</style>
