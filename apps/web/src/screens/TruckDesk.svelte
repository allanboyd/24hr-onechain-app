<script lang="ts">
  // Truck desk (docs/10, docs/17 Phase 2): the truck planner's monitoring page, in tabs kept in the address (?tab=):
  //   Board — every truck by where it is now (status counts, filters, list, drawer)       feature 'trucks'
  //   Queues — the loading point queues and loading (was "Loading & waiting list")         feature 'loading'
  //   Providers & trucks — transport providers, their trucks and the drivers                feature 'trucks'
  //   Costs — transport owed by provider and truck; agreed price and trip expenses          'truck-expenses' or 'finance'
  // Charts live on Home · Fleet. Loaders (only 'loading') see the Queues tab alone, without a tab bar.
  import { finance, loading, ref, shipments, type Shipment, type User, type WaitingEntry } from '@btw/api';
  import Tabs from '../components/page/Tabs.svelte';
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

<PageHeader overline="Logistics" title="Truck desk" description="Every truck by where it is now, the loading queues and what transport costs." {info} analysis={seesTrucks ? 'fleet' : undefined}>
  {#snippet secondary()}
    {#if tab === 'costs' && canMoney}<ActionInCompany label="Record agreed price" what="agreed price" variant="secondary" icon={false} feature="truck-expenses" href={inGroup ? intentHref('agreed-price', { tab: 'costs' }) : undefined} onclick={() => money?.openAgreed()} />{/if}
  {/snippet}
  {#snippet primary()}
    {#if tab === 'queues' && canQueue}<ActionInCompany label="Add truck to queue" what="truck" feature="loading" href={inGroup ? intentHref('add-truck', { tab: 'queues', lp: qlp }) : undefined} onclick={() => queues?.openAdd()} />
    {:else if tab === 'costs' && canMoney}<ActionInCompany label="Trip expense" what="trip expense" feature="truck-expenses" href={inGroup ? intentHref('trip-expense', { tab: 'costs' }) : undefined} onclick={() => money?.openCost()} />{/if}
  {/snippet}
</PageHeader>

{#if TABS.length > 1}
  <Tabs label="Truck desk" tabs={TABS.map((t) => ({ ...t, n: t.key === 'board' && w.loaded ? rows.length : null }))} value={tab} onselect={(k) => setTab(k as Tab)} />
{/if}

{#if tab !== 'queues'}<ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />{/if}

{#if tab === 'board'}
  <Board {user} {rows} {ships} {k} loaded={w.loaded} onopen={openTruck} />
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

<style>
</style>
