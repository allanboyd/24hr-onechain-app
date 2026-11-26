<script lang="ts">
  // V3-12 step 4: warehouse cash. Cash at start per receiving company (its date and currency are the default for its
  // warehouses), each warehouse's part of it, and cash sent to the company account with the bank slip. Management →
  // Cash and closing reads these: cash in hand = cash at start + received − bills − cash sent.
  import { cash, lookup, onChange, type CashEntry, type CashOverview, type Currency } from '@btw/api';
  import { CURRENCIES } from '@btw/api/money';
  import { fmtDate, fmtNum, say } from '@btw/ui';
  import { DataTable, type Column } from './page';
  import ErrorState from './ErrorState.svelte';
  import { watch } from '../lib/load.svelte';
  import { uploadPhoto } from '../lib/upload';
  import Send from '@lucide/svelte/icons/send';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Landmark from '@lucide/svelte/icons/landmark';

  let o = $state<CashOverview | null>(null);
  const w = watch(async () => { o = await cash.overview(); });
  $effect(() => onChange(() => w.retry()));
  const today = () => new Date().toISOString().slice(0, 10);
  const money = (e: { currency: string; amount: number }) => `${e.currency} ${fmtNum(e.amount, 2)}`;

  // cash at start
  let oDialog = $state<HTMLDialogElement>();
  let of = $state({ receivingCompanyId: '', warehouseId: '' as string, name: '', amount: 0, currency: 'USD' as Currency, date: '', note: '', company: null as CashEntry | null });
  let oErr = $state(''), busy = $state(false);
  function openOpening(rc: CashOverview['companies'][number], wh?: { warehouseId: string; name: string; opening: CashEntry | null }) {
    const cur = wh ? wh.opening : rc.opening;
    of = { receivingCompanyId: rc.receivingCompanyId, warehouseId: wh?.warehouseId ?? '', name: wh?.name ?? rc.name, amount: cur?.amount ?? 0,
      currency: (cur?.currency ?? rc.opening?.currency ?? 'USD') as Currency, date: cur?.date ?? rc.opening?.date ?? today(), note: cur?.note ?? '', company: rc.opening };
    oErr = ''; oDialog?.showModal();
  }
  async function saveOpening(e: Event) {
    e.preventDefault(); oErr = ''; busy = true;
    try {
      await cash.setOpening({ receivingCompanyId: of.receivingCompanyId, warehouseId: of.warehouseId || null, amount: Number(of.amount), currency: of.currency, date: of.date, note: of.note });
      oDialog?.close(); say(`Cash at start saved for ${of.name}`); w.retry();
    } catch (err) { oErr = (err as Error).message; }
    busy = false;
  }

  // send to the company account
  let sDialog = $state<HTMLDialogElement>();
  let sf = $state({ warehouseId: '', amount: 0, currency: 'USD' as Currency, date: '', reference: '', note: '' });
  let slip = $state<{ id: string; name: string; url: string } | null>(null);
  let sErr = $state('');
  function openSend() { sf = { warehouseId: o?.canSend[0] ?? '', amount: 0, currency: 'USD', date: today(), reference: '', note: '' }; slip = null; sErr = ''; sDialog?.showModal(); }
  async function pick(e: Event) { const f = (e.currentTarget as HTMLInputElement).files?.[0]; if (!f) return; busy = true; try { slip = await uploadPhoto(f); } catch (err) { sErr = (err as Error).message; } busy = false; }
  async function send(e: Event) {
    e.preventDefault(); sErr = ''; busy = true;
    try {
      await cash.send({ warehouseId: sf.warehouseId, amount: Number(sf.amount), currency: sf.currency, date: sf.date, reference: sf.reference, note: sf.note, slipFileId: slip?.id ?? null, slipName: slip?.name ?? null, slipUrl: slip?.url ?? null });
      sDialog?.close(); say('Cash sent to the company account · the directors are told'); w.retry();
    } catch (err) { sErr = (err as Error).message; }
    busy = false;
  }

  const cols: Column<CashEntry>[] = [
    { key: 'date', label: 'Date', sortValue: (x) => x.date, value: (x) => fmtDate(x.date), csv: (x) => x.date, class: 'small nowrap' },
    { key: 'wh', label: 'Warehouse', value: (x) => (x.warehouseId ? lookup.warehouse(x.warehouseId)?.name ?? x.warehouseId : '-'), filter: 'select' },
    { key: 'amount', label: 'Amount', align: 'right', sortValue: (x) => x.amountUsd, value: (x) => money(x), csv: (x) => x.amount },
    { key: 'usd', label: 'USD', align: 'right', sortValue: (x) => x.amountUsd, value: (x) => fmtNum(x.amountUsd, 2), csv: (x) => x.amountUsd, total: (l) => fmtNum(l.reduce((a, x) => a + x.amountUsd, 0), 2) },
    { key: 'ref', label: 'Bank slip', value: (x) => x.reference ?? '-', cell: slipCell },
    { key: 'by', label: 'Recorded by', value: (x) => lookup.user(x.byUserId)?.name ?? '-', class: 'small', hideBelow: 900 },
  ];
  let q = $state(''), fl = $state({});
</script>

<ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />
{#if o}
  <div class="head row between">
    <p class="caption">Cash at start is set once by the directors or accounts; each warehouse sends its cash to the company account with the bank slip.</p>
    {#if o.canSend.length}<button class="btn btn-primary" onclick={openSend}><Send size={16} aria-hidden="true" />Send to the company account</button>{/if}
  </div>
  <div class="cos">
    {#each o.companies as rc (rc.receivingCompanyId)}
      <section class="card co" aria-label="Cash at start of {rc.name}">
        <header class="row between"><h3 class="row"><Landmark size={18} aria-hidden="true" />{rc.name}</h3>
          {#if o.canSetOpening}<button class="btn btn-ghost btn-sm" onclick={() => openOpening(rc)} aria-label="Set cash at start of {rc.name}"><Pencil size={14} />{rc.opening ? 'Change' : 'Set cash at start'}</button>{/if}</header>
        <p class="big">{rc.opening ? money(rc.opening) : 'Cash at start not set'}</p>
        {#if rc.opening}<p class="caption">On {fmtDate(rc.opening.date)}. Its warehouses use this date and currency.</p>{/if}
        <ul class="whs">
          {#each rc.warehouses as x (x.warehouseId)}
            <li><span>{x.name}</span><strong class="num">{x.opening ? money(x.opening) : '-'}</strong>
              {#if o.canSetOpening}<button class="btn btn-ghost btn-sm" onclick={() => openOpening(rc, x)} aria-label="Set the part of {x.name}"><Pencil size={14} /></button>{/if}</li>
          {/each}
          {#if rc.notSplit !== null && rc.notSplit > 0.005 && rc.opening}<li class="muted"><span>Company, not split by warehouse</span><strong class="num">{rc.opening.currency} {fmtNum(rc.notSplit, 2)}</strong><span></span></li>{/if}
        </ul>
      </section>
    {/each}
  </div>
  <h3 class="h4 sub">Cash sent to the company account</h3>
  <DataTable id="wh-cash-transfers" label="Cash sent to the company account" noun="transfers" rows={o.transfers} columns={cols} rowKey={(x) => x.id} initialSort={{ key: 'date', dir: 'desc' }} filename="cash-sent"
    searchable searchPlaceholder="Warehouse, slip…" bind:search={q} bind:filters={fl} emptyTitle="No cash sent yet" />
{/if}

{#snippet slipCell(x: CashEntry)}{x.reference ?? '-'}{#if x.slip?.url} · <a href={x.slip.url} target="_blank" rel="noopener">{x.slip.name}</a>{/if}{/snippet}

<dialog class="sheet" bind:this={oDialog} style="width:min(480px,calc(100vw - 32px))" aria-labelledby="op-h">
  <form class="body stack" onsubmit={saveOpening}>
    <h3 id="op-h">Cash at start · {of.name}</h3>
    {#if of.warehouseId && of.company}<p class="caption">This warehouse's part of {money(of.company)} on {fmtDate(of.company.date)}. It uses the company's date and currency.</p>
    {:else if of.warehouseId}<p class="caption">The company has no cash at start yet; this warehouse's amount stands on its own.</p>
    {:else}<p class="caption">The date and currency become the default for the company's warehouses.</p>{/if}
    <div class="form-grid">
      <label class="field"><span>Amount</span><input class="input num" type="number" min="0" step="0.01" bind:value={of.amount} required /></label>
      <label class="field"><span>Currency</span><select class="select" bind:value={of.currency} disabled={!!(of.warehouseId && of.company)}>{#each CURRENCIES as c}<option>{c}</option>{/each}</select></label>
      <label class="field"><span>Date</span><input class="input" type="date" bind:value={of.date} max={today()} disabled={!!(of.warehouseId && of.company)} /></label>
    </div>
    <label class="field"><span>Note</span><input class="input" bind:value={of.note} placeholder="Counted by, where it is kept" autocomplete="off" /></label>
    {#if oErr}<div class="error" role="alert">{oErr}</div>{/if}
    <div class="row" style="justify-content:flex-end"><button type="button" class="btn btn-ghost" onclick={() => oDialog?.close()}>Cancel</button><button class="btn btn-primary" disabled={busy}>Save</button></div>
  </form>
</dialog>

<dialog class="sheet" bind:this={sDialog} style="width:min(520px,calc(100vw - 32px))" aria-labelledby="sc-h">
  {#if o}
  <form class="body stack" onsubmit={send}>
    <h3 id="sc-h">Send to the company account</h3>
    <div class="form-grid">
      <label class="field"><span>Warehouse</span><select class="select" bind:value={sf.warehouseId}>{#each o.canSend as id (id)}<option value={id}>{lookup.warehouse(id)?.name}</option>{/each}</select></label>
      <label class="field"><span>Date</span><input class="input" type="date" bind:value={sf.date} max={today()} /></label>
      <label class="field"><span>Amount</span><input class="input num" type="number" min="0.01" step="0.01" bind:value={sf.amount} required /></label>
      <label class="field"><span>Currency</span><select class="select" bind:value={sf.currency}>{#each CURRENCIES as c}<option>{c}</option>{/each}</select></label>
      <label class="field"><span>Bank slip number</span><input class="input" bind:value={sf.reference} autocomplete="off" /></label>
      <label class="field"><span>Bank slip photo</span><input class="input" type="file" accept="image/*,application/pdf" onchange={pick} />{#if slip}<small class="caption">Attached: {slip.name}</small>{/if}</label>
    </div>
    <label class="field"><span>Note</span><input class="input" bind:value={sf.note} autocomplete="off" /></label>
    {#if sErr}<div class="error" role="alert">{sErr}</div>{/if}
    <div class="row" style="justify-content:flex-end"><button type="button" class="btn btn-ghost" onclick={() => sDialog?.close()}>Cancel</button><button class="btn btn-primary" disabled={busy}>Send</button></div>
  </form>
  {/if}
</dialog>

<style>
  .head { gap: var(--space-3); margin-bottom: var(--space-3); flex-wrap: wrap; }
  .head .caption { margin: 0; }
  .cos { display: grid; gap: var(--space-4); grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); margin-bottom: var(--space-5); }
  .co h3 { gap: 8px; margin: 0; }
  .big { font: 800 24px/1.3 var(--ff-display); margin: 8px 0 2px; font-variant-numeric: tabular-nums; }
  .whs { list-style: none; margin: 10px 0 0; padding: 0; }
  .whs li { display: grid; grid-template-columns: 1fr auto 36px; align-items: center; gap: 8px; padding: 6px 0; border-top: 1px solid var(--border); font-size: 14px; }
  .whs .num { text-align: right; font-variant-numeric: tabular-nums; }
  .sub { margin: 0 0 var(--space-3); }
</style>
