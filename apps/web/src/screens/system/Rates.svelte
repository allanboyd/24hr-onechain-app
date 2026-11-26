<script lang="ts">
  // V3-13 Settings & alerts → Exchange rates: the monthly rates directors approve (units of a currency per 1 USD).
  // The average rate turns sales, costs and expenses of that month into USD; the closing rate values stock and balances.
  import { settings, type FxRate, type User } from '@btw/api';
  import { CURRENCIES } from '@btw/api/money';
  import { fmtNum, say } from '@btw/ui';
  import { DataTable, type Column } from '../../components/page';
  import ErrorState from '../../components/ErrorState.svelte';
  import { watch } from '../../lib/load.svelte';
  import Plus from '@lucide/svelte/icons/plus';
  let { user }: { user: User; params?: unknown; section?: boolean } = $props();
  const canApprove = $derived(user.roles.includes('director'));
  let rates = $state<FxRate[] | null>(null);
  const w = watch(async () => { rates = await settings.fx(); });
  const thisMonth = () => new Date().toISOString().slice(0, 7);
  const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  let q = $state(''), fl = $state({});
  const cols = $derived<Column<FxRate>[]>([
    { key: 'month', label: 'Month', sortValue: (r) => r.month, value: (r) => monthLabel(r.month), csv: (r) => r.month, mobile: 'title' },
    { key: 'currency', label: 'Currency', value: (r) => r.currency, filter: 'select' },
    { key: 'avg', label: 'Average (per 1 USD)', align: 'right', sortValue: (r) => r.avg, value: (r) => fmtNum(r.avg, 2), csv: (r) => r.avg },
    { key: 'closing', label: 'Closing (per 1 USD)', align: 'right', sortValue: (r) => r.closing, value: (r) => fmtNum(r.closing, 2), csv: (r) => r.closing },
    ...(canApprove ? [{ key: 'edit', label: '', sortable: false, csv: false as const, cell: editCell, mobile: 'actions' as const }] : []),
  ]);
  // approve / change a rate: form, then a confirm step (it changes USD figures for that month)
  let dlg = $state<HTMLDialogElement>(), confirmDlg = $state<HTMLDialogElement>();
  let form = $state<FxRate>({ currency: 'KES', month: '', avg: 0, closing: 0 });
  let error = $state(''), busy = $state(false);
  const existing = $derived((rates ?? []).find((r) => r.currency === form.currency && r.month === form.month));
  function open(r?: FxRate) { form = r ? { ...r } : { currency: 'KES', month: thisMonth(), avg: 0, closing: 0 }; error = ''; dlg?.showModal(); }
  function review(e: Event) {
    e.preventDefault(); error = '';
    if (!/^\d{4}-\d{2}$/.test(form.month)) { error = 'Pick the month'; return; }
    if (!(Number(form.avg) > 0) || !(Number(form.closing) > 0)) { error = 'Both rates must be above zero'; return; }
    confirmDlg?.showModal();
  }
  async function save() {
    busy = true; error = '';
    try { await settings.setFx({ currency: form.currency, month: form.month, avg: Number(form.avg), closing: Number(form.closing) }); confirmDlg?.close(); dlg?.close(); say(`${form.currency} rate for ${monthLabel(form.month)} approved`); w.retry(); }
    catch (e) { error = (e as Error).message; confirmDlg?.close(); } finally { busy = false; }
  }
</script>

<div class="page-head">
  <div><h1>Exchange rates</h1><p class="muted small">Approved monthly rates: the average turns that month's sales, costs and expenses into USD; the closing rate values stock and balances.</p></div>
  {#if canApprove}<button class="btn btn-primary" onclick={() => open()}><Plus size={16} aria-hidden="true" />Approve a rate</button>{/if}
</div>
<ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />
<DataTable id="fx-rates" label="Exchange rates" noun="rates" rows={rates} columns={cols} rowKey={(r) => `${r.currency}:${r.month}`} initialSort={{ key: 'month', dir: 'desc' }} filename="exchange-rates"
  searchable searchPlaceholder="Currency or month…" bind:search={q} bind:filters={fl} emptyTitle="No rates approved yet" />

{#snippet editCell(r: FxRate)}<button class="btn btn-ghost btn-sm" onclick={(e) => { e.stopPropagation(); open(r); }} aria-label="Change {r.currency} {r.month}">Change</button>{/snippet}

<dialog class="sheet" bind:this={dlg} style="width:min(480px,calc(100vw - 32px))" aria-labelledby="fx-h">
  <form class="body stack" onsubmit={review}>
    <h3 id="fx-h">{existing ? 'Change an approved rate' : 'Approve a rate'}</h3>
    <div class="form-grid">
      <label class="field"><span>Currency</span><select class="select" bind:value={form.currency}>{#each CURRENCIES.filter((c) => c !== 'USD') as c}<option>{c}</option>{/each}</select></label>
      <label class="field"><span>Month</span><input class="input" type="month" bind:value={form.month} required /></label>
      <label class="field"><span>Average ({form.currency} per 1 USD)</span><input class="input num" type="number" min="0" step="0.0001" bind:value={form.avg} required /></label>
      <label class="field"><span>Closing ({form.currency} per 1 USD)</span><input class="input num" type="number" min="0" step="0.0001" bind:value={form.closing} required /></label>
    </div>
    {#if existing}<p class="caption">Approved now: average {fmtNum(existing.avg, 2)}, closing {fmtNum(existing.closing, 2)}.</p>{/if}
    {#if error}<div class="error" role="alert">{error}</div>{/if}
    <div class="row" style="justify-content:flex-end"><button type="button" class="btn btn-ghost" onclick={() => dlg?.close()}>Cancel</button><button class="btn btn-primary">Review</button></div>
  </form>
</dialog>

<dialog class="sheet" bind:this={confirmDlg} style="width:min(440px,calc(100vw - 32px))" aria-labelledby="fxc-h">
  <div class="body stack">
    <h3 id="fxc-h">Approve {form.currency} for {form.month ? monthLabel(form.month) : ''}?</h3>
    <p class="small">USD figures for {form.month ? monthLabel(form.month) : 'that month'} in {form.currency} will use average {fmtNum(Number(form.avg), 2)} and closing {fmtNum(Number(form.closing), 2)}{existing ? ', replacing the rate approved now' : ''}. The change is kept in the audit log.</p>
    <div class="row" style="justify-content:flex-end"><button class="btn btn-ghost" onclick={() => confirmDlg?.close()}>Cancel</button><button class="btn btn-primary" disabled={busy} onclick={save}>Approve</button></div>
  </div>
</dialog>
