<script lang="ts">
  // Truck desk (docs/10, docs/17 Phase 2): the truck planner's monitoring page, in tabs kept in the address (?tab=):
  //   Board — every truck by where it is now (status counts, filters, list, drawer)       feature 'trucks'
  //   Queues — the loading point queues and loading (was "Loading & waiting list")         feature 'loading'
  //   Providers & trucks — transport providers, their trucks and the drivers                feature 'trucks'
  //   Costs — transport owed by provider and truck; agreed price and trip expenses          'truck-expenses' or 'finance'
  // Charts live on Home · Fleet. Loaders (only 'loading') see the Queues tab alone, without a tab bar.
  import { finance, loading, ref, shipments, type Shipment, type User, type WaitingEntry } from '@btw/api';
  import StateBoard from '../components/trucks/StateBoard.svelte';
  import LayoutGrid from '@lucide/svelte/icons/layout-grid';
  import ListOrdered from '@lucide/svelte/icons/list-ordered';
  import Building2 from '@lucide/svelte/icons/building-2';
  import Wallet from '@lucide/svelte/icons/wallet';
  import Columns3 from '@lucide/svelte/icons/columns-3';
  import MapIcon from '@lucide/svelte/icons/map';
  import Table2 from '@lucide/svelte/icons/table-2';
  import { deskKpis, sortDesk, truckDesk, type TruckRow } from '@btw/api/trucks';
  import { canEditQueue } from '@btw/api/access';
  import { PageHeader, ActionInCompany, hashQuery, readQuery, writeQuery, takeIntent } from '../components/page';
  import ErrorState from '../components/ErrorState.svelte';
  import Board from '../components/trucks/Board.svelte';
  import Queues from '../components/trucks/Queues.svelte';
  import Providers from '../components/trucks/Providers.svelte';
  import Costs from '../components/trucks/Costs.svelte';
  import TruckDrawer from '../components/trucks/TruckDrawer.svelte';
  import MoneyDialogs, { type Trip } from '../components/trucks/MoneyDialogs.svelte';
  import { company, GROUP } from '../lib/company.svelte';
  import { watch } from '../lib/load.svelte';
  import { can } from '../lib/features';
  let { user }: { params?: any; user: User } = $props();

  // ---- tabs ----
  type Tab = 'board' | 'queues' | 'providers' | 'costs';
  const seesTrucks = $derived(can(user, 'trucks'));
  // docs/12: truck expenses and the agreed transport price — Testfie and the directors record; accounts read (finance)
  const canMoney = $derived(can(user, 'truck-expenses'));
  const seesMoney = $derived(canMoney || can(user, 'finance'));
  const TABS = $derived(([
    { key: 'board', label: 'Board', on: seesTrucks },
    { key: 'queues', label: 'Queues', on: can(user, 'loading') },
    { key: 'providers', label: 'Providers & trucks', on: seesTrucks },
    { key: 'costs', label: 'Costs', on: seesMoney },
  ] as const).filter((t) => t.on));
  const pick = (k: string): Tab => (TABS.find((t) => t.key === k)?.key ?? TABS[0]?.key ?? 'board') as Tab;
  let tab = $state<Tab>('board');
  tab = pick(readQuery('tab'));
  function setTab(t: Tab, keep: Record<string, string> = {}) {
    if (t === tab && !Object.keys(keep).length) return;
    tab = t;
    // each tab has its own filters: start clean (the tab's components remount and read the address)
    writeQuery({ tab: t === TABS[0]?.key ? null : t, show: null, state: null, provider: null, route: null, q: null, lp: null, list: null, ...keep });
    if (keep.lp) qlp = keep.lp;
    else if (t === 'queues') qlp = '';
  }

  // ---- data for the board, the drawer and the costs ----
  const r = ref();
  let waiting = $state<WaitingEntry[]>([]);
  let ships = $state<Shipment[]>([]);
  let trips = $state<Trip[] | null>(null);
  let now = $state(Date.now());
  const needDesk = $derived(seesTrucks || seesMoney);
  const w = watch(async () => {
    if (!needDesk) return;
    const [wq, sh, tr] = await Promise.all([loading.waiting(), shipments.list(), seesMoney ? finance.trips() : Promise.resolve(null)]);
    waiting = wq; ships = sh; trips = tr; now = Date.now();
  });
  const stopsOf = (id: string) => r.routes.find((x) => x.id === id)?.stops ?? [];
  // trucks shown: active ones, plus deactivated trucks that are still on a trip / in a queue
  const rows = $derived(sortDesk(truckDesk({ trucks: ref().trucks, providers: ref().providers, drivers: ref().drivers, waiting, shipments: ships, checkpoints: r.checkpoints, suppliers: r.suppliers, stopsOf, now }))
    .filter((x) => x.truck.active !== false || x.state !== 'Idle'));
  const k = $derived(deskKpis(rows, trips));
  // V3-15: the left menu of the Truck desk (the Settings & alerts layout), each part with its count
  const ICON = { board: LayoutGrid, queues: ListOrdered, providers: Building2, costs: Wallet } as const;
  const DESC = { board: 'Where every truck is now', queues: 'Loading point queues and loading', providers: 'Transport companies, trucks, drivers', costs: 'What transport costs and is owed' } as const;
  const countOf = (t: Tab) => (!w.loaded ? '' : t === 'board' ? String(rows.filter((x) => x.state !== 'Idle').length) : t === 'queues' ? String(k.inQueue) : t === 'providers' ? String(ref().trucks.filter((x) => x.active !== false).length) : k.owed ? `$${Math.round(k.owed / 1000)}k` : '');
  const alertOf = (t: Tab) => (t === 'board' ? k.delayed > 0 : t === 'queues' ? k.longWaits > 0 : false);
  // Board layout: lanes (default), lanes with the map, or the table; kept in the address (?layout=)
  let layout = $state<'' | 'map' | 'table'>((readQuery('layout') as '' | 'map' | 'table') || '');
  function setLayout(v: '' | 'map' | 'table') { layout = v; writeQuery({ layout: v || null }); }

  // ---- drawer + money dialogs ----
  let drawerOpen = $state(false);
  let sel = $state<TruckRow | null>(null);
  function openTruck(x: TruckRow) { sel = x; drawerOpen = true; }
  let money = $state<MoneyDialogs>();
  let queues = $state<Queues>();
  let qlp = $state(readQuery('lp'));
  const canQueue = $derived(!!qlp && canEditQueue(user, qlp));

  // Group view: the action asks which company, switches to it and comes back here with ?do= (see ActionInCompany)
  const inGroup = $derived(company.active === GROUP);
  function intentHref(name: string, extra: Record<string, string> = {}) {
    const q = hashQuery(); q.delete('co'); q.set('do', name);
    for (const [key, v] of Object.entries(extra)) q.set(key, v);
    return `#/trucks?${q}`;
  }
  let intentDone = false;
  $effect(() => {
    if (intentDone || trips === null || !canMoney) return;
    intentDone = true;
    if (takeIntent('trip-expense')) { const t = readQuery('truck'); writeQuery({ truck: null }); money?.openCost(t || undefined); }
    else if (takeIntent('agreed-price')) money?.openAgreed();
  });

  const lpName = (id: string) => { const s = r.suppliers.find((x) => x.id === id); return s ? `${s.code} ${s.city}` : id; };
  const info = $derived(`Board: where every truck is now, from check-ins, GPS and the loading queues. Queues: the waiting list at each loading point and the PO truck lines to load. Costs: what each provider and truck is owed; payments are recorded and approved by the directors in Transport costs.${user.roles.includes('truck_planner') && user.loadingPointIds.length ? ` Your loading points: ${user.loadingPointIds.map(lpName).join(', ')}.` : ''}`);
</script>

<div class="desk" class:solo={TABS.length < 2}>
{#if TABS.length > 1}
  <nav class="side" aria-label="Truck desk">
    {#each TABS as t (t.key)}{@const I = ICON[t.key]}
      <a href="#/trucks{t.key === TABS[0].key ? '' : `?tab=${t.key}`}" class="mc" class:on={tab === t.key} aria-current={tab === t.key ? 'page' : undefined} onclick={(e) => { e.preventDefault(); setTab(t.key as Tab); }}>
        <span class="ic"><I size={18} aria-hidden="true" /></span>
        <span class="tx"><span class="lb">{t.label}</span><span class="ds">{DESC[t.key]}</span></span>
        {#if countOf(t.key as Tab)}<span class="n" class:alert={alertOf(t.key as Tab)}>{countOf(t.key as Tab)}</span>{/if}
      </a>
    {/each}
  </nav>
{/if}
<div class="content">
<PageHeader overline="Logistics" title="Truck desk" description="Every truck by where it is now, the loading queues and what transport costs." {info} analysis={seesTrucks ? 'fleet' : undefined}>
  {#snippet secondary()}
    {#if tab === 'costs' && canMoney}<ActionInCompany label="Record agreed price" what="agreed price" variant="secondary" icon={false} feature="truck-expenses" href={inGroup ? intentHref('agreed-price', { tab: 'costs' }) : undefined} onclick={() => money?.openAgreed()} />{/if}
  {/snippet}
  {#snippet primary()}
    {#if tab === 'queues' && canQueue}<ActionInCompany label="Add truck to queue" what="truck" feature="loading" href={inGroup ? intentHref('add-truck', { tab: 'queues', lp: qlp }) : undefined} onclick={() => queues?.openAdd()} />
    {:else if tab === 'costs' && canMoney}<ActionInCompany label="Trip expense" what="trip expense" feature="truck-expenses" href={inGroup ? intentHref('trip-expense', { tab: 'costs' }) : undefined} onclick={() => money?.openCost()} />{/if}
  {/snippet}
</PageHeader>


{#if tab !== 'queues'}<ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />{/if}

{#if tab === 'board'}
  <div class="lay" role="group" aria-label="Board layout">
    <button class:on={layout === ''} aria-pressed={layout === ''} onclick={() => setLayout('')}><Columns3 size={15} aria-hidden="true" />Lanes</button>
    <button class:on={layout === 'map'} aria-pressed={layout === 'map'} onclick={() => setLayout('map')}><MapIcon size={15} aria-hidden="true" />With map</button>
    <button class:on={layout === 'table'} aria-pressed={layout === 'table'} onclick={() => setLayout('table')}><Table2 size={15} aria-hidden="true" />Table</button>
  </div>
  {#if layout === 'table'}<Board {user} {rows} {ships} {k} loaded={w.loaded} onopen={openTruck} />
  {:else if w.loaded}<StateBoard {rows} {ships} withMap={layout === 'map'} onopen={openTruck} />
  {:else}<div class="card"><div class="skeleton" style="height:240px"></div></div>{/if}
{:else if tab === 'queues'}
  <Queues bind:this={queues} {user} bind:lp={qlp} />
{:else if tab === 'providers'}
  <Providers {user} />
{:else if tab === 'costs'}
  <Costs {trips} {rows} {k} onopen={openTruck} />
{/if}

<TruckDrawer bind:open={drawerOpen} {sel} {ships} {trips} money={canMoney} onagreed={(id) => money?.openAgreed(id)} onqueue={(lp) => setTab('queues', { lp })}>
  {#snippet actions()}
    {#if canMoney && sel && (trips ?? []).some((t) => t.shipment.legs[0]?.truckId === sel!.truck.id)}
      {@const truckId = sel.truck.id}
      <ActionInCompany label="Trip expense" what="trip expense" variant="secondary" feature="truck-expenses" href={inGroup ? intentHref('trip-expense', { tab, truck: truckId }) : undefined} onclick={() => money?.openCost(truckId)} />
    {/if}
  {/snippet}
</TruckDrawer>
{#if canMoney}<MoneyDialogs bind:this={money} {trips} />{/if}
</div>
</div>

<style>
  .desk { display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: var(--space-5); align-items: start; }
  .desk.solo { grid-template-columns: minmax(0, 1fr); }
  /* V3-6: Safari let the column grow to the widest table; keep it to the screen */
  .desk > :global(*) { min-width: 0; }
  .content { min-width: 0; }
  .side { position: sticky; top: var(--space-4); display: flex; flex-direction: column; gap: 10px; }
  .mc { display: flex; align-items: center; gap: 12px; padding: 14px 14px; border-radius: 14px; border: 1px solid var(--border); background: var(--surface); color: var(--text); text-decoration: none; transition: border-color .15s, box-shadow .15s, transform .15s; }
  .mc:hover { border-color: var(--border-strong, var(--border)); box-shadow: 0 2px 10px rgb(0 0 0 / .06); text-decoration: none; }
  .mc.on { border-color: var(--primary); box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary) 22%, transparent); }
  .mc:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
  .mc .ic { flex: none; display: grid; place-items: center; width: 38px; height: 38px; border-radius: 11px; background: var(--surface-sunken); color: var(--text-muted); }
  .mc.on .ic { background: var(--primary); color: var(--text-on-primary, #fff); }
  .mc .tx { display: flex; flex-direction: column; min-width: 0; flex: 1; }
  .mc .lb { font-weight: 600; font-size: 14.5px; } .mc .ds { font-size: 12px; color: var(--text-muted); line-height: 1.35; }
  .mc .n { flex: none; font-size: 13px; padding: 2px 9px; border-radius: 99px; background: var(--surface-sunken); color: var(--text-muted); font-weight: 700; }
  .mc .n.alert { background: var(--danger-subtle); color: var(--danger); }
  .lay { display: inline-flex; gap: 2px; padding: 3px; border-radius: 10px; background: var(--surface-sunken); margin-bottom: var(--space-3); }
  .lay button { display: inline-flex; align-items: center; gap: 6px; border: 0; background: none; padding: 6px 12px; border-radius: 8px; font: inherit; font-size: 13.5px; color: var(--text-muted); cursor: pointer; }
  .lay button.on { background: var(--surface); color: var(--text); font-weight: 600; box-shadow: 0 1px 2px rgb(0 0 0 / .08); }
  @media (max-width: 960px) {
    .desk { grid-template-columns: minmax(0, 1fr); gap: var(--space-3); }
    .side { position: static; flex-direction: row; overflow-x: auto; gap: 8px; scrollbar-width: none; }
    .mc { flex: none; padding: 8px 12px; } .mc .ds { display: none; } .mc .ic { width: 30px; height: 30px; }
  }
</style>
