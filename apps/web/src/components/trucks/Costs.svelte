<script lang="ts">
  // Truck desk · Costs: what each transport provider and each truck costs and is owed (agreed transport − payments).
  // Figures come from the shared definitions (transport owed, agreed price not recorded), so they equal Transport costs
  // and Home · Fees. Payments are recorded and approved by the directors in Transport costs.
  import { lookup, ref } from '@btw/api';
  import { costsByProvider, costsByTruck, type DeskKpis, type TruckRow, type CostLine } from '@btw/api/trucks';
  import { fmtMoney, fmtNum } from '@btw/ui';
  import { SummaryStrip, FilterBar, EmptyState, queryFilters, type SummaryTile } from '../page';
  import ExportMenu from '../ExportMenu.svelte';
  import { usd } from '../charts';
  import { infoOf } from '../../lib/tiles';
  import SearchX from '@lucide/svelte/icons/search-x';
  import type { Trip } from './MoneyDialogs.svelte';
  let { trips, rows, k, onopen }: { trips: Trip[] | null; rows: TruckRow[]; k: DeskKpis; onopen: (x: TruckRow) => void } = $props();

  const f = queryFilters({ show: '', provider: '', q: '' });
  let search = $state(f.values.q);
  $effect(() => { if (search !== f.values.q) f.set('q', search); });
  function clearAll() { f.clear(); search = ''; }

  const tiles = $derived<SummaryTile[]>([
    { key: 'owed', label: 'Transport owed', value: trips ? k.owed : null, format: usd, sub: 'agreed − paid, all trips', info: infoOf('transportOwed') },
    { key: 'missing', label: 'Agreed price not recorded', value: trips ? k.agreedMissing : null, status: k.agreedMissing ? 'warn' : undefined, statusLabel: k.agreedMissing ? 'Record it' : undefined, sub: k.agreedMissing ? undefined : 'every loaded truck has its price', info: infoOf('priceNotRecorded') },
    { key: 'pending', label: 'Waiting for a director', value: trips ? k.pending : null, format: usd, sub: 'payments to approve', info: 'Payments to transporters recorded and waiting for a director\'s approval, USD. They are deducted from what is owed once approved.' },
  ]);
  const SHOW: Record<string, (c: CostLine) => boolean> = { owed: (c) => c.balance > 0, missing: (c) => c.notRecorded > 0, pending: (c) => c.pending > 0 };
  const keep = (c: CostLine, label: string) => (!f.values.show || SHOW[f.values.show]?.(c) !== false) && (!f.values.q.trim() || label.toLowerCase().includes(f.values.q.trim().toLowerCase()));

  const all = $derived(trips ?? []);
  const provCosts = $derived(costsByProvider(all, ref().trucks, ref().providers));
  const truckCosts = $derived(costsByTruck(all, ref().trucks));
  const provOf = (truckId: string) => lookup.truck(truckId)?.providerId ?? '';
  const provShown = $derived(provCosts.filter((c) => (!f.values.provider || c.id === f.values.provider) && keep(c, c.label)));
  const trucksShown = $derived(truckCosts.filter((c) => (!f.values.provider || provOf(c.id) === f.values.provider) && keep(c, `${c.label} ${lookup.provider(provOf(c.id))?.name ?? ''}`)));
  const active = $derived((f.values.show ? 1 : 0) + (f.values.provider ? 1 : 0));

  const costHead = ['Trips', 'Agreed transport (USD)', 'Extra costs (USD)', 'Paid (USD)', 'Waiting approval (USD)', 'Balance owed (USD)', 'Cases', 'Trip cost per case (USD)'];
  const exportCosts = () => [['Level', 'Provider / truck', ...costHead],
    ...provCosts.map((c) => ['Provider', c.label, c.trips, c.agreed, c.extras, c.paid, c.pending, c.balance, c.cases, c.perCase]),
    ...truckCosts.map((c) => ['Truck', `${c.label} (${lookup.provider(provOf(c.id))?.name ?? ''})`, c.trips, c.agreed, c.extras, c.paid, c.pending, c.balance, c.cases, c.perCase])];
</script>

<SummaryStrip {tiles} bind:value={f.values.show} param="show" label="Transport money" />
<FilterBar bind:search placeholder="Provider or truck" {active} onclear={clearAll}>
  <label class="field"><span>Provider</span><select class="select" value={f.values.provider} onchange={(e) => f.set('provider', e.currentTarget.value)}><option value="">All providers</option>{#each provCosts as c (c.id)}<option value={c.id}>{c.label}</option>{/each}</select></label>
  {#snippet end()}<a class="small" href="#/transport-costs">Payments → Transport costs</a><ExportMenu name="transport-costs" rows={exportCosts} />{/snippet}
</FilterBar>

{#snippet amounts(c: CostLine)}
  <td class="num">{c.trips}</td>
  <td class="num">{fmtMoney(c.agreed)}{#if c.notRecorded}<div class="caption nr">{c.notRecorded} not recorded</div>{/if}</td>
  <td class="num">{fmtMoney(c.extras)}</td>
  <td class="num">{fmtMoney(c.paid)}</td>
  <td class="num">{c.pending ? fmtMoney(c.pending) : '—'}</td>
  <td class="num"><strong class:owed={c.balance > 0}>{fmtMoney(c.balance)}</strong></td>
{/snippet}
{#snippet card(c: CostLine, sub: string)}
  <span class="row between"><strong>{c.label}</strong><strong class:owed={c.balance > 0}>{fmtMoney(c.balance)} owed</strong></span>
  <span class="caption">{sub}{c.trips} trips · agreed {fmtMoney(c.agreed)} · paid {fmtMoney(c.paid)}{c.pending ? ` · ${fmtMoney(c.pending)} waiting approval` : ''}</span>
  {#if c.notRecorded}<span class="caption nr">{c.notRecorded} agreed price{c.notRecorded === 1 ? '' : 's'} not recorded</span>{/if}
{/snippet}

<section class="card flush">
  <header><div><h3>By provider</h3><div class="caption">Amounts in USD at the approved month-average rate</div></div></header>
  <div class="table-wrap desktop"><table class="table">
    <thead><tr><th>Provider</th><th class="num">Trips</th><th class="num">Agreed transport</th><th class="num">Extra costs</th><th class="num">Paid</th><th class="num">Waiting approval</th><th class="num">Balance owed</th><th class="num">Cases</th><th class="num">Trip cost / case</th></tr></thead>
    <tbody>{#each provShown as c (c.id)}
      <tr class:sel={f.values.provider === c.id}><td><button class="linkish" aria-pressed={f.values.provider === c.id} onclick={() => f.toggle('provider', c.id)}>{c.label}</button></td>{@render amounts(c)}<td class="num">{fmtNum(c.cases)}</td><td class="num">{fmtMoney(c.perCase)}</td></tr>
    {:else}<tr><td colspan="9">{#if !trips}<div class="skeleton"></div>{:else}<EmptyState title={active || f.values.q ? 'No provider matches these filters' : 'No trips yet'} icon={SearchX} compact />{/if}</td></tr>{/each}</tbody>
  </table></div>
  <ul class="cards mobile">{#each provShown as c (c.id)}<li><button type="button" class="rowcard" class:sel={f.values.provider === c.id} onclick={() => f.toggle('provider', c.id)}>{@render card(c, '')}</button></li>{:else}{#if trips}<li class="caption pad">No provider matches.</li>{/if}{/each}</ul>
</section>

<section class="card flush gap">
  <header><div><h3>By truck{f.values.provider ? ` · ${lookup.provider(f.values.provider)?.name ?? ''}` : ''}</h3><div class="caption">Trips are counted for the truck that loaded them</div></div></header>
  <div class="table-wrap desktop"><table class="table">
    <thead><tr><th>Truck</th><th>Provider</th><th class="num">Trips</th><th class="num">Agreed transport</th><th class="num">Extra costs</th><th class="num">Paid</th><th class="num">Waiting approval</th><th class="num">Balance owed</th><th class="num">Trip cost / case</th><th></th></tr></thead>
    <tbody>{#each trucksShown as c (c.id)}{@const row = rows.find((x) => x.truck.id === c.id)}
      <tr><td><strong>{c.label}</strong></td><td class="small">{lookup.provider(provOf(c.id))?.name ?? '—'}</td>{@render amounts(c)}<td class="num">{c.notRecorded === c.trips ? 'not recorded' : fmtMoney(c.perCase)}</td>
        <td>{#if row}<button class="btn btn-ghost btn-sm" onclick={() => onopen(row)}>Details</button>{/if}</td></tr>
    {:else}<tr><td colspan="10">{#if trips}<EmptyState title="No trips" compact />{/if}</td></tr>{/each}</tbody>
  </table></div>
  <ul class="cards mobile">{#each trucksShown as c (c.id)}{@const row = rows.find((x) => x.truck.id === c.id)}
    <li><button type="button" class="rowcard" disabled={!row} onclick={() => row && onopen(row)}>{@render card(c, `${lookup.provider(provOf(c.id))?.name ?? '—'} · `)}</button></li>
  {:else}{#if trips}<li class="caption pad">No trips.</li>{/if}{/each}</ul>
</section>

<style>
  .gap { margin-top: var(--space-4); }
  tr.sel, .rowcard.sel { background: var(--primary-subtle); }
  .owed { color: var(--danger); }
  .nr { color: var(--warning); font-weight: 600; }
  .linkish { background: none; border: 0; padding: 0; color: var(--link); font: inherit; cursor: pointer; text-align: left; }
  .cards { list-style: none; margin: 0; padding: 0; display: none; flex-direction: column; }
  .cards li { border-bottom: 1px solid var(--border); }
  .cards li:last-child { border-bottom: 0; }
  .rowcard { display: flex; flex-direction: column; align-items: stretch; gap: 2px; width: 100%; padding: var(--space-3) var(--space-4); border: 0; background: none; text-align: left; font: inherit; color: inherit; cursor: pointer; }
  .rowcard:disabled { cursor: default; }
  .pad { padding: var(--space-3) var(--space-4); }
  @media (max-width: 700px) { .desktop { display: none; } .cards { display: flex; } }
</style>
