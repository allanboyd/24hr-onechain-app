<script lang="ts">
  // Sales → Clients (V3-12 step 1): every client of the company, with what each owes and how much is past its credit days.
  // Clients come from the sales themselves (a new name on a sale adds one); here people who sell fix names and phones, and
  // the directors or accounts set the credit days. A sale keeps the days it was made with.
  import { clients, onChange, ref, type Client, type ClientRow, type User } from '@btw/api';
  import { canSetCreditDays } from '@btw/api/rules';
  import { TERMS_DAYS } from '@btw/api/metrics';
  import { Badge, fmtDate, fmtMoney, say } from '@btw/ui';
  import { DataTable, type Column } from './page';
  import ErrorState from './ErrorState.svelte';
  import { watch } from '../lib/load.svelte';
  import { destinationLabel } from '../lib/planning';
  import { companyLabel } from '../lib/companies';
  import { company, GROUP, scopeEntity } from '../lib/company.svelte';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Plus from '@lucide/svelte/icons/plus';

  let { user }: { user: User } = $props();
  const setDays = $derived(canSetCreditDays(user.roles));
  const scoped = $derived(user.roles.includes('director') || !user.warehouseIds.length ? null : user.warehouseIds);

  let list = $state<ClientRow[] | null>(null);
  const w = watch(async () => { list = await clients.list(); });
  $effect(() => onChange(() => w.retry()));
  // figures over all the client's sales, from the API (the same owed / overdue rule as Sales, Today and Management)
  type Row = ClientRow;
  const rows = $derived(list ? list.filter((r) => !scoped || !r.warehouseId || scoped.includes(r.warehouseId)) : null);

  const columns = $derived<Column<Row>[]>([
    ...(company.active === GROUP ? [{ key: 'company', label: 'Company', value: (r: Row) => companyLabel(r.entityId), hideBelow: 760, filter: 'select' as const }] : []),
    { key: 'name', label: 'Client', sticky: true, value: (r) => r.name, cell: nameCell },
    { key: 'wh', label: 'Warehouse', value: (r) => (r.warehouseId ? destinationLabel(r.warehouseId) : '-'), class: 'small', hideBelow: 900, filter: 'select' },
    { key: 'phone', label: 'Phone', value: (r) => r.phone ?? '-', class: 'small nowrap', hideBelow: 1000 },
    { key: 'terms', label: 'Credit days', align: 'right', sortValue: (r) => r.termsDays, value: (r) => (r.termsDays === 0 ? 'Pay at once' : `${r.termsDays} days`), filter: 'select' },
    { key: 'owed', label: 'Owed (USD)', align: 'right', sortValue: (r) => r.owed, value: (r) => (r.owed ? fmtMoney(r.owed) : '-'), csv: (r) => Math.round(r.owed * 100) / 100, total: (l) => fmtMoney(l.reduce((a, r) => a + r.owed, 0)) },
    { key: 'overdue', label: 'Overdue (USD)', align: 'right', sortValue: (r) => r.overdue, cell: overdueCell, csv: (r) => Math.round(r.overdue * 100) / 100, total: (l) => fmtMoney(l.reduce((a, r) => a + r.overdue, 0)) },
    { key: 'last', label: 'Last sale', sortValue: (r) => r.lastSaleAt ?? '', value: (r) => (r.lastSaleAt ? fmtDate(r.lastSaleAt) : '-'), class: 'small nowrap', hideBelow: 900 },
    { key: 'status', label: 'Status', value: (r) => (r.active ? 'Active' : 'Deactivated'), cell: statusCell, filter: 'select', mobile: 'aside' },
    { key: 'edit', label: '', sortable: false, csv: false, cell: editCell },
  ]);

  // add / edit
  let dialog = $state<HTMLDialogElement>();
  let editing = $state<Client | null>(null);
  let form = $state({ name: '', phone: '', warehouseId: '', termsDays: TERMS_DAYS, active: true });
  let error = $state('');
  let busy = $state(false);
  function openNew() { editing = null; form = { name: '', phone: '', warehouseId: scoped?.[0] ?? '', termsDays: TERMS_DAYS, active: true }; error = ''; dialog?.showModal(); }
  function openEdit(c: Client) { editing = c; form = { name: c.name, phone: c.phone ?? '', warehouseId: c.warehouseId ?? '', termsDays: c.termsDays, active: c.active }; error = ''; dialog?.showModal(); }
  async function save(e: Event) {
    e.preventDefault(); error = ''; busy = true;
    try {
      const input = { name: form.name, phone: form.phone, warehouseId: form.warehouseId || null, termsDays: Number(form.termsDays), active: form.active };
      if (editing) { await clients.update(editing.id, input); say(`${form.name.trim()} saved`); }
      else { const c = await clients.create({ ...input, entityId: scopeEntity() ?? undefined }); say(`${c.name} added with ${c.termsDays} credit days`); }
      dialog?.close(); w.retry();
    } catch (err) { error = (err as Error).message; }
    busy = false;
  }
  const warehouses = $derived(ref().warehouses.filter((x) => !scoped || scoped.includes(x.id)));
</script>

<ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />
<DataTable id="clients" label="Clients" noun="clients" rows={rows} {columns} rowKey={(r) => r.id} initialSort={{ key: 'owed', dir: 'desc' }} filename="clients"
  searchable searchPlaceholder="Client or phone…" caption="Credit days: {setDays ? 'you can change them' : 'set by the directors or accounts'}. A sale keeps the days it was made with; a new client gets {TERMS_DAYS} days.">
  {#snippet toolbar()}<button class="btn btn-primary btn-sm" onclick={openNew}><Plus size={16} />New client</button>{/snippet}
</DataTable>

{#snippet nameCell(r: Row)}<strong>{r.name}</strong>{#if r.sales}<div class="caption">{r.sales} {r.sales === 1 ? 'sale' : 'sales'}</div>{/if}{/snippet}
{#snippet overdueCell(r: Row)}{#if r.overdue > 0}<span class="bad">{fmtMoney(r.overdue)}</span>{:else}-{/if}{/snippet}
{#snippet statusCell(r: Row)}{#if r.active}<Badge tone="success">Active</Badge>{:else}<Badge tone="neutral">Deactivated</Badge>{/if}{/snippet}
{#snippet editCell(r: Row)}<button class="btn btn-ghost btn-sm" onclick={(e) => { e.stopPropagation(); openEdit(r); }} aria-label="Edit {r.name}"><Pencil size={14} /></button>{/snippet}

<dialog class="sheet" bind:this={dialog} style="width:min(520px,calc(100vw - 32px))">
  <form class="body stack" onsubmit={save}>
    <h3>{editing ? `Edit ${editing.name}` : 'New client'}</h3>
    <label class="field"><span>Name</span><input class="input" bind:value={form.name} required autocomplete="off" /></label>
    <div class="form-grid">
      <label class="field"><span>Phone</span><input class="input" type="tel" bind:value={form.phone} autocomplete="off" /></label>
      <label class="field"><span>Warehouse</span><select class="select" bind:value={form.warehouseId}><option value="">Any warehouse</option>{#each warehouses as x (x.id)}<option value={x.id}>{destinationLabel(x.id)}</option>{/each}</select></label>
      <label class="field"><span>Credit days</span><input class="input num" type="number" min="0" max="180" step="1" bind:value={form.termsDays} disabled={!setDays} /></label>
    </div>
    {#if !setDays}<p class="caption">Credit days are set by the directors or accounts. A new client gets {TERMS_DAYS} days.</p>{/if}
    {#if editing}<label class="row small"><input type="checkbox" bind:checked={form.active} /> Active (a deactivated client can't be picked on new sales)</label>{/if}
    {#if error}<div class="error" role="alert">{error}</div>{/if}
    <div class="row" style="justify-content:flex-end"><button type="button" class="btn btn-ghost" onclick={() => dialog?.close()}>Cancel</button><button class="btn btn-primary" disabled={busy}>{editing ? 'Save' : 'Add client'}</button></div>
  </form>
</dialog>

<style>
  .bad { color: var(--danger); font-weight: 600; }
</style>
