<script lang="ts">
  // Truck desk · Costs: what each transport provider and each truck costs and is owed (agreed transport − payments).
  // Figures come from the shared definitions (transport owed, agreed price not recorded), so they equal Transport costs
  // and Home · Fees. Payments are recorded and approved by the directors in Transport costs.
  import { lookup, ref } from '@btw/api';
  import { costsByProvider, costsByTruck, type DeskKpis, type TruckRow, type CostLine } from '@btw/api/trucks';
  import { fmtMoney, fmtNum } from '@btw/ui';
  import { SummaryStrip, DataTable, Tabs, queryFilters, readQuery, writeQuery, tableQuery, type Column, type SummaryTile } from '../page';
  import ExportMenu from '../ExportMenu.svelte';
  import { usd } from '../charts';
  import { infoOf } from '../../lib/tiles';
  import type { Trip } from './MoneyDialogs.svelte';
  let { trips, rows, k, onopen }: { trips: Trip[] | null; rows: TruckRow[]; k: DeskKpis; onopen: (x: TruckRow) => void } = $props();

  const f = queryFilters({ show: '', provider: '', q: '' });
  // V3-8 batch 2: providers and trucks on the shared table. A provider row picks the provider (a filter chip on the trucks
  // table, kept in the address); the trucks table has the search box.
  const tq = tableQuery(f, { search: 'q', filters: { provider: 'provider' } });
  function clearAll() { f.clear(); }
  // V3-15: By provider | By truck as tabs; picking a provider opens its trucks
  let ctab = $state<'providers' | 'trucks'>(readQuery('by') === 'truck' || readQuery('provider') ? 'trucks' : 'providers');
  function setCtab(k: string) { ctab = k as typeof ctab; writeQuery({ by: k === 'trucks' ? 'truck' : null }); }
  function pickProvider(id: string) { f.set('provider', id); setCtab('trucks'); }

  const tiles = $derived<SummaryTile[]>([
    { key: 'owed', label: 'Transport owed', value: trips ? k.owed : null, format: usd, sub: 'agreed − paid, all trips', info: infoOf('transportOwed') },
    { key: 'missing', label: 'Agreed price not recorded', value: trips ? k.agreedMissing : null, status: k.agreedMissing ? 'warn' : undefined, statusLabel: k.agreedMissing ? 'Record it' : undefined, sub: k.agreedMissing ? undefined : 'every loaded truck has its price', info: infoOf('priceNotRecorded') },
    { key: 'pending', label: 'Waiting for a director', value: trips ? k.pending : null, format: usd, sub: 'payments to approve', info: 'Payments to transporters recorded and waiting for a director\'s approval, USD. They are deducted from what is owed once approved.' },
  ]);
  const SHOW: Record<string, (c: CostLine) => boolean> = { owed: (c) => c.balance > 0, missing: (c) => c.notRecorded > 0, pending: (c) => c.pending > 0 };
  const keep = (c: CostLine) => !f.values.show || SHOW[f.values.show]?.(c) !== false;

  const all = $derived(trips ?? []);
  const provCosts = $derived(costsByProvider(all, ref().trucks, ref().providers));
  const truckCosts = $derived(costsByTruck(all, ref().trucks));
  const provOf = (truckId: string) => lookup.truck(truckId)?.providerId ?? '';
  const provShown = $derived(provCosts.filter((c) => keep(c)));
  const trucksShown = $derived(truckCosts.filter((c) => keep(c)));
  const money = (label: string, key: keyof CostLine, cell?: typeof owedCell): Column<CostLine> => ({ key: String(key), label, align: 'right', sortValue: (c) => Number(c[key]), value: (c) => fmtMoney(Number(c[key])), csv: (c) => Number(c[key]), cell, total: (l) => fmtMoney(l.reduce((a, c) => a + Number(c[key]), 0)) });
  const amountCols: Column<CostLine>[] = [
    { key: 'trips', label: 'Trips', align: 'right', sortValue: (c) => c.trips, value: (c) => String(c.trips), total: (l) => fmtNum(l.reduce((a, c) => a + c.trips, 0)) },
    money('Agreed transport', 'agreed', agreedCell), money('Extra costs', 'extras'), money('Paid', 'paid'), money('Waiting approval', 'pending', pendingCell), money('Balance owed', 'balance', owedCell),
  ];
  const provCols: Column<CostLine>[] = [
    { key: 'label', label: 'Provider', sticky: true, mobile: 'title', value: (c) => c.label, cell: provCell },
    ...amountCols,
    { key: 'cases', label: 'Cases', align: 'right', sortValue: (c) => c.cases, value: (c) => fmtNum(c.cases), hideBelow: 1400 },
    { key: 'perCase', label: 'Trip cost / case', align: 'right', sortValue: (c) => c.perCase, value: (c) => fmtMoney(c.perCase), hideBelow: 1400 },
  ];
  const truckCols: Column<CostLine>[] = [
    { key: 'label', label: 'Truck', sticky: true, mobile: 'title', value: (c) => c.label, class: 'strong' },
    { key: 'provider', label: 'Provider', value: (c) => lookup.provider(provOf(c.id))?.name ?? '-', filter: 'select', filterValue: (c) => provOf(c.id), filterLabel: (id) => lookup.provider(id)?.name ?? id, class: 'small' },
    ...amountCols,
    { key: 'perCase', label: 'Trip cost / case', align: 'right', sortValue: (c) => c.perCase, value: (c) => (c.notRecorded === c.trips ? 'not recorded' : fmtMoney(c.perCase)), hideBelow: 1400 },
    { key: 'open', label: '', sortable: false, csv: false, cell: detailsCell, mobile: 'actions' },
  ];

  const costHead = ['Trips', 'Agreed transport (USD)', 'Extra costs (USD)', 'Paid (USD)', 'Waiting approval (USD)', 'Balance owed (USD)', 'Cases', 'Trip cost per case (USD)'];
  const exportCosts = () => [['Level', 'Provider / truck', ...costHead],
    ...provCosts.map((c) => ['Provider', c.label, c.trips, c.agreed, c.extras, c.paid, c.pending, c.balance, c.cases, c.perCase]),
    ...truckCosts.map((c) => ['Truck', `${c.label} (${lookup.provider(provOf(c.id))?.name ?? ''})`, c.trips, c.agreed, c.extras, c.paid, c.pending, c.balance, c.cases, c.perCase])];
</script>

<SummaryStrip {tiles} bind:value={f.values.show} param="show" label="Transport money" noun="providers" total={trips ? provCosts.length : null} shown={trips ? provShown.length : null} />
<div class="row links"><a class="small" href="#/transport-costs">Payments → Transport costs</a><ExportMenu name="transport-costs" rows={exportCosts} /></div>

{#snippet provCell(c: CostLine)}<strong>{c.label}</strong>{/snippet}
{#snippet agreedCell(c: CostLine)}{fmtMoney(c.agreed)}{#if c.notRecorded}<div class="caption nr">{c.notRecorded} not recorded</div>{/if}{/snippet}
{#snippet pendingCell(c: CostLine)}{c.pending ? fmtMoney(c.pending) : '-'}{/snippet}
{#snippet owedCell(c: CostLine)}<strong class:owed={c.balance > 0}>{fmtMoney(c.balance)}</strong>{/snippet}
{#snippet detailsCell(c: CostLine)}{@const row = rows.find((x) => x.truck.id === c.id)}{#if row}<button class="btn btn-ghost btn-sm" onclick={(e) => { e.stopPropagation(); onopen(row); }}>Details</button>{/if}{/snippet}

<Tabs label="Costs" tabs={[{ key: 'providers', label: 'By provider', n: provShown.length }, { key: 'trucks', label: 'By truck', n: trucksShown.length }]} value={ctab} onselect={setCtab} />
{#if ctab === 'providers'}
<section class="card flush">
  <header><div><h3>By provider</h3><div class="caption">Amounts in USD at the approved month-average rate · pick a provider to see its trucks</div></div></header>
  <DataTable id="truck-costs-providers" label="Costs by provider" noun="providers" rows={trips ? provShown : null} columns={provCols} rowKey={(c) => c.id} selected={f.values.provider || null}
    onrowclick={(c) => pickProvider(c.id)} initialSort={{ key: 'balance', dir: 'desc' }} filename="costs-by-provider" tools={false} emptyTitle="No provider matches these filters" />
</section>
{:else}
<section class="card flush">
  <header><div><h3>By truck{f.values.provider ? ` · ${lookup.provider(f.values.provider)?.name ?? ''}` : ''}</h3><div class="caption">Trips are counted for the truck that loaded them</div></div></header>
  <DataTable id="truck-costs-trucks" label="Costs by truck" noun="trucks" rows={trips ? trucksShown : null} columns={truckCols} rowKey={(c) => c.id} initialSort={{ key: 'balance', dir: 'desc' }} filename="costs-by-truck" onclear={clearAll}
    searchable searchPlaceholder="Truck or provider" bind:search={tq.search.get, tq.search.set} bind:filters={tq.filters.get, tq.filters.set} emptyTitle="No trips" />
</section>
{/if}

<style>
  .owed { color: var(--danger); }
  .nr { color: var(--warning); font-weight: 600; }
</style>
