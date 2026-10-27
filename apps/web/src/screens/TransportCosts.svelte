<script lang="ts">
  // Transport costs (docs/17 §4): one work page for what used to be Transport fees and Trip financials, with tabs
  // Fees (default) · Trips · Expenses in the hash query (?tab=…, switched without a remount). Who sees what:
  //   Fees      'transport-fees'                 directors, admin, truck planner (Testfie)
  //   Trips     'finance'                        directors, admin, fleet, operations, accounts
  //   Expenses  'finance' or 'truck-expenses'
  // Who records what (unchanged): the agreed price and trip expenses need 'truck-expenses' (Testfie, directors…);
  // payments are recorded by the directors (and accounts) — above the threshold they wait for a director's approval
  // ('finance.approve'). Every money save goes through withUnusualConfirm (amount sanity check), currency always explicit.
  import { finance, ref, type TransportFeeRow, type User } from '@btw/api';
  import Tabs from '../components/page/Tabs.svelte';
  import * as MX from '@btw/api/metrics';
  import { canRecordPayment } from '@btw/api/access';
  import { feesConfig } from '@btw/api/money';
  import { fmtNum } from '@btw/ui';
  import { PageHeader, SummaryStrip, ActionInCompany, queryFilters, readQuery, writeQuery, takeIntent, type SummaryTile } from '../components/page';
  import ErrorState from '../components/ErrorState.svelte';
  import ExportMenu from '../components/ExportMenu.svelte';
  import Fees from '../components/costs/Fees.svelte';
  import Trips from '../components/costs/Trips.svelte';
  import Expenses from '../components/costs/Expenses.svelte';
  import TripDrawer from '../components/costs/TripDrawer.svelte';
  import CostDialog from '../components/costs/CostDialog.svelte';
  import { FILTER_KEYS, canPayTrip, canSetPrice, providerName, providerOfTruck, refOfFee, refOfTrip, routeName, tripFee, tripLoadedAt, truckReg, type CostAct, type Trip, type TripRef } from '../components/costs/costs';
  import { can } from '../lib/features';
  import { watch } from '../lib/load.svelte';
  import { feeTiles, infoOf, tripMoneyTiles } from '../lib/tiles';
  import { companyLabel } from '../lib/companies';
  import { inScope } from '../lib/company.svelte';
  let { user }: { params?: any; user: User } = $props();

  // ---- access ----
  const canFees = $derived(can(user, 'transport-fees'));
  const canTrips = $derived(can(user, 'finance'));
  const canExpTab = $derived(canTrips || can(user, 'truck-expenses'));
  const canExpense = $derived(can(user, 'truck-expenses')); // agreed price + trip expenses (server: 'truck-expenses')
  const canPay = $derived(canRecordPayment(user)); // directors (and accounts); big ones wait for approval
  const canApprove = $derived(can(user, 'finance.approve'));

  // ---- tabs (?tab=fees|trips|expenses; default = the first one this person may open) ----
  type Tab = 'fees' | 'trips' | 'expenses';
  const tabs = $derived(([['fees', 'Fees', canFees], ['trips', 'Trips', canTrips], ['expenses', 'Expenses', canExpTab]] as const).filter((t) => t[2]).map((t) => ({ key: t[0] as Tab, label: t[1] })));
  const pickTab = (k: string): Tab => (tabs.find((t) => t.key === k)?.key ?? tabs[0]?.key ?? 'fees');
  let tab = $state<Tab>('fees');
  tab = pickTab(readQuery('tab'));
  function setTab(k: Tab) { tab = k; writeQuery({ tab: k === tabs[0]?.key ? null : k }); }

  // ---- data ----
  const cfg = feesConfig(ref().config);
  let fees = $state<TransportFeeRow[] | null>(null);
  let trips = $state<Trip[] | null>(null);
  const wf = watch(async () => { if (canFees) fees = await finance.fees(); });
  const wt = watch(async () => { if (canTrips || canExpTab) trips = await finance.trips(); });

  // ---- filters (hash query) ----
  const f = queryFilters(FILTER_KEYS);
  // Remember at mount whether the address already chose a filter (bookmark, Home card, old Transport fees link).
  const explicit = Object.keys(FILTER_KEYS).some((k) => readQuery(k));

  // ---- summary strip: the same four figures on every tab, from the metric registry ----
  // People who open the Fees tab: the fee rows (feeTiles), and the tiles filter the Fees list (switching to it).
  // Finance-only roles (fleet, operations, accounts — no Fees tab): the same figures from the trips' cost lines and
  // payments (tripMoneyTiles; age = days since the first leg left), and the tiles filter the Trips list instead.
  const stripTab = $derived<Tab>(canFees ? 'fees' : 'trips');
  const tripFees = $derived((trips ?? []).map((t) => tripFee(t)));
  const fig = $derived.by(() => {
    if (canFees) { const k = feeTiles(fees ?? [], cfg.amberDays, cfg.redDays); return { ...k, ready: !!fees }; }
    const m = tripMoneyTiles(trips ?? []);
    return { balance: m.owed, open: MX.openFees(tripFees).length, amber: MX.feesOlderThan(tripFees, cfg.amberDays).length, red: MX.feesOlderThan(tripFees, cfg.redDays).length, missing: m.missing,
      awaiting: m.awaiting, pending: m.pending, ready: !!trips };
  });
  const usd = (n: number) => `USD ${fmtNum(n)}`;
  // Max 4 tiles. People who approve payments (directors) get "Waiting for your approval" instead of "Over 14 days" (that
  // count moves to the Open balance sub-line) — it replaces the old "N payments waiting for your approval" notice.
  const awaitingTile = $derived<SummaryTile>({ key: 'awaiting', label: 'Waiting for your approval', value: fig.ready ? fig.awaiting : null, sub: fig.awaiting ? `${usd(fig.pending)} to approve` : undefined,
    status: fig.awaiting ? 'warn' : 'good', statusLabel: fig.awaiting ? 'Act now' : 'None waiting', info: infoOf('feesAwaiting') });
  const tiles = $derived<SummaryTile[]>(canApprove ? [
    { key: 'open', label: 'Open balance', value: fig.ready ? fig.balance : null, format: usd, sub: `${fig.open} trip${fig.open === 1 ? '' : 's'} · ${fig.amber} over ${cfg.amberDays} days`, info: infoOf('transportOwed') },
    { key: 'red', label: `Over ${cfg.redDays} days`, value: fig.ready ? fig.red : null, status: fig.red ? 'bad' : undefined, statusLabel: fig.red ? 'Overdue' : undefined, info: infoOf('feesRed') },
    { key: 'missing', label: 'Price not recorded', value: fig.ready ? fig.missing : null, sub: 'record it after loading', info: infoOf('priceNotRecorded') },
    awaitingTile,
  ] : [
    { key: 'open', label: 'Open balance', value: fig.ready ? fig.balance : null, format: usd, sub: `${fig.open} trip${fig.open === 1 ? '' : 's'} unpaid or part paid`, info: infoOf('transportOwed') },
    { key: 'amber', label: `Over ${cfg.amberDays} days`, value: fig.ready ? fig.amber : null, status: fig.amber ? 'warn' : undefined, statusLabel: fig.amber ? 'Follow up' : undefined, info: infoOf('feesAmber') },
    { key: 'red', label: `Over ${cfg.redDays} days`, value: fig.ready ? fig.red : null, status: fig.red ? 'bad' : undefined, statusLabel: fig.red ? 'Overdue' : undefined, info: infoOf('feesRed') },
    { key: 'missing', label: 'Price not recorded', value: fig.ready ? fig.missing : null, sub: 'record it after loading', info: infoOf('priceNotRecorded') },
  ]);
  function onStrip(key: string) { if (key && key !== 'all' && tab !== stripTab) setTab(stripTab); }

  // Needs-action default (docs/17 §3): someone who records payments (directors, accounts) opens on the fees that need
  // paying — over red days first, else over amber days — only when the address carries no filter of its own (a bookmark
  // or Home link wins) and only when the page opens on the tab the strip filters. Runs once, after the first load.
  let defaulted = false;
  let auto = $state('');
  $effect(() => {
    if (defaulted || !fig.ready) return;
    defaulted = true;
    if (explicit || !canPay || tab !== stripTab) return;
    auto = fig.red ? 'red' : canApprove && fig.awaiting ? 'awaiting' : fig.amber ? 'amber' : '';
    if (auto) f.set('show', auto);
  });
  // counts for the strip's "Showing: Over 30 days (3 of 41)" line — the tile's own count (the list may add its filters)
  const stripTotal = $derived(fig.ready ? (canFees ? fees ?? [] : trips ?? []).length : null);
  const stripShown = $derived(fig.ready ? (({ open: fig.open, amber: fig.amber, red: fig.red, missing: fig.missing, awaiting: fig.awaiting }) as Record<string, number>)[f.values.show] ?? stripTotal : null);

  // ---- trips the record actions can be done on ----
  const feeMap = $derived(new Map((fees ?? []).map((r) => [r.shipmentId, r])));
  const tripMap = $derived(new Map((trips ?? []).map((t) => [t.shipment.id, t])));
  // the trips' own refs (they carry the exchange rate of each cost line), plus fee rows the trips list doesn't have
  const refs = $derived<TripRef[]>([...(trips ?? []).map(refOfTrip), ...(fees ?? []).filter((r) => !tripMap.has(r.shipmentId)).map(refOfFee)]);
  const forAct = (k: CostAct) => refs.filter((r) => inScope(r.entityId) && (k === 'price' ? canSetPrice(r) : k === 'pay' ? canPayTrip(r) : true));

  let dlgOpen = $state(false);
  let dlgKind = $state<CostAct>('pay');
  let dlgShip = $state('');
  function act(kind: CostAct, shipmentId: string) { dlgKind = kind; dlgShip = shipmentId; dlgOpen = true; }

  // header action: in Group view ActionInCompany switches company and comes back with ?do=<intent>; reopen it here
  const INTENTS: [string, CostAct][] = [['record-payment', 'pay'], ['agreed-price', 'price'], ['trip-expense', 'expense']];
  let intentDone = false;
  $effect(() => {
    if (intentDone || !(fees || trips)) return;
    intentDone = true;
    for (const [name, k] of INTENTS) if (takeIntent(name)) { act(k, ''); break; }
  });

  // ---- detail drawer ----
  let drawer = $state(false);
  let sel = $state('');
  function openTrip(id: string) { sel = id; drawer = true; }
  const flagLabel = (fl: TransportFeeRow['flag']) => ({ ok: { s: 'good', l: 'On time' }, amber: { s: 'warn', l: `Over ${cfg.amberDays} days` }, red: { s: 'bad', l: `Over ${cfg.redDays} days` }, none: { s: 'none', l: 'No price' } })[fl];

  // pending approvals (directors): a shortcut to the payments waiting for them

  // ---- exports (the whole list of the tab) ----
  const exportFees = () => [['Shipment', 'Company', 'Truck', 'Provider', 'Loaded', 'Age (days)', 'Agreed', 'Currency', 'Agreed USD', 'Paid USD', 'Waiting approval USD', 'Balance USD', 'Status', 'Flag', 'References'],
    ...(fees ?? []).map((r) => [r.ref, companyLabel(r.entityId), truckReg(r.truckId), providerName(r.providerId), r.loadedAt?.slice(0, 10) ?? '', r.ageDays, r.agreed?.amount ?? '', r.agreed?.currency ?? '', r.agreedUsd ?? '', r.paidUsd, r.pendingUsd, r.balanceUsd ?? '', r.status, flagLabel(r.flag).l, r.references.join('; ')])];
  const exportTrips = () => [['Shipment', 'Truck', 'Provider', 'Route', 'Agreed transport (USD)', 'Paid (USD)', 'Balance (USD)', 'Goods (USD)', 'Expenses (USD)', 'Landing cost (USD)', 'Cases', 'Landing cost per case (USD)'],
    ...(trips ?? []).map((t) => { const l = t.shipment.legs[0]; const r2 = (n: number | undefined) => (n === undefined || n === null ? '' : Math.round(n * 100) / 100);
      return [t.shipment.ref, truckReg(l?.truckId), providerName(providerOfTruck(l?.truckId)), routeName(l?.routeId), t.transport, t.paid, t.balance, r2(t.goods), t.expenses, r2(t.landing), t.cases, r2(t.perCase)]; })];
  const exportExpenses = () => [['Shipment', 'Company', 'Truck', 'Provider', 'Loaded', 'Expense', 'Leg', 'Document', 'Amount', 'Currency', 'USD'],
    ...(trips ?? []).flatMap((t) => t.costs.map((c) => [t.shipment.ref, companyLabel(t.shipment.entityId), truckReg(t.shipment.legs[0]?.truckId), providerName(providerOfTruck(t.shipment.legs[0]?.truckId)), tripLoadedAt(t)?.slice(0, 10) ?? '',
      c.kind, c.legId ? t.shipment.legs.find((l) => l.id === c.legId)?.seq ?? '' : '', c.docRef ?? '', c.amount, c.currency, c.amountUsd ?? c.amount]))];
  const EXPORT = { fees: { name: 'transport-fees', rows: exportFees }, trips: { name: 'trip-financials', rows: exportTrips }, expenses: { name: 'trip-expenses', rows: exportExpenses } };
</script>

<PageHeader overline="Finance" title="Transport costs" description="What each trip costs and what is still owed to the transporters." analysis="fees"
  info="The truck follow-up officer records the agreed transport price after loading, and the trip expenses per trip and leg. The directors record the payments with their references; a payment above USD 500 waits for a director's approval before it counts as paid. Unpaid fees turn amber after {cfg.amberDays} days and red after {cfg.redDays} days from loading.">
  {#snippet secondary()}<ExportMenu name={EXPORT[tab].name} rows={EXPORT[tab].rows} />{/snippet}
  {#snippet primary()}
    {#if tab === 'fees' && canPay}
      <ActionInCompany label="Record payment" what="payment" intent="record-payment" onclick={() => act('pay', '')} />
    {:else if tab === 'fees'}
      <ActionInCompany label="Record agreed price" what="agreed price" intent="agreed-price" when={canExpense} onclick={() => act('price', '')} />
    {:else if canExpense}
      <ActionInCompany label="Trip expense" what="trip expense" intent="trip-expense" onclick={() => act('expense', '')} />
    {:else}
      <ActionInCompany label="Record payment" what="payment" intent="record-payment" when={canPay} onclick={() => act('pay', '')} />
    {/if}
  {/snippet}
</PageHeader>
<ErrorState error={wf.error ?? wt.error} onretry={() => { wf.retry(); wt.retry(); }} compact={wf.loaded || wt.loaded} />

<!-- page order (docs/13 Selection states): header → tabs → strip → filters → list -->
{#if tabs.length > 1}
  <Tabs label="Transport costs" {tabs} value={tab} onselect={setTab} />
{/if}

<SummaryStrip {tiles} bind:value={f.values.show} param="show" label="Transport costs summary" onchange={onStrip} allValue="all" noun="trips" total={stripTotal} shown={stripShown} {auto} labels={{ amber: `Over ${cfg.amberDays} days` }} />

{#if tab === 'fees' && canFees}
  <Fees rows={fees} {f} amberDays={cfg.amberDays} redDays={cfg.redDays} {flagLabel} {canExpense} {canPay} onopen={openTrip} onact={act} />
{:else if tab === 'trips' && canTrips}
  <Trips {trips} {f} stripFilters={!canFees} amberDays={cfg.amberDays} redDays={cfg.redDays} {canPay} onopen={openTrip} onact={act} />
{:else if tab === 'expenses' && canExpTab}
  <Expenses {trips} {f} onopen={openTrip} />
{/if}

<TripDrawer bind:open={drawer} fee={feeMap.get(sel) ?? null} trip={tripMap.get(sel) ?? null} {flagLabel} {canApprove} {canPay} {canExpense} onact={act} />
<CostDialog bind:open={dlgOpen} kind={dlgKind} shipmentId={dlgShip} trips={dlgShip ? refs.filter((r) => r.shipmentId === dlgShip) : forAct(dlgKind)} />

