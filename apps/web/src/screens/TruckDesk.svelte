<script lang="ts">
  // Truck desk (docs/10): the truck planner's home. Every truck by state — waiting at a loading point, loading, in transit,
  // at a border, delayed, arrived, idle — with where it is, ETA, driver, provider, open issues and days since it last
  // moved; KPIs and charts on top; click a truck for its history and expenses. Expenses tab: per provider / per truck.
  import { finance, loading, lookup, ref, shipments, type CostKind, type Shipment, type User, type WaitingEntry } from '@btw/api';
  import { ON_ROAD, TRUCK_STATES, costsByProvider, costsByTruck, deskKpis, sortDesk, truckDesk, waitLabel, tripTruck, type TruckRow, type TruckState } from '@btw/api/trucks';
  import { Badge, ago, fmtDate, fmtDateTime, fmtMoney, fmtNum, say, router } from '@btw/ui';
  import { BarChart, ChartCard, Donut, StatTile, usd } from '../components/charts';
  import ErrorState from '../components/ErrorState.svelte';
  import ExportMenu from '../components/ExportMenu.svelte';
  import CompanyCell from '../components/CompanyCell.svelte';
  import RecordFor from '../components/RecordFor.svelte';
  import { watch } from '../lib/load.svelte';
  import { can } from '../lib/features';
  import { describe } from '../lib/errors';
  import { qp } from '../lib/tab';
  import Search from '@lucide/svelte/icons/search';
  import Plus from '@lucide/svelte/icons/plus';
  import ListOrdered from '@lucide/svelte/icons/list-ordered';
  import Building from '@lucide/svelte/icons/building';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  let { user }: { params?: any; user: User } = $props();

  type Trip = Awaited<ReturnType<typeof finance.trips>>[number];
  const r = ref();
  let waiting = $state<WaitingEntry[]>([]);
  let ships = $state<Shipment[]>([]);
  let trips = $state<Trip[] | null>(null);
  let now = $state(Date.now());
  const canMoney = $derived(can(user, 'finance'));
  const w = watch(async () => {
    const [wq, sh, tr] = await Promise.all([loading.waiting(), shipments.list(), canMoney ? finance.trips() : Promise.resolve(null)]);
    waiting = wq; ships = sh; trips = tr; now = Date.now();
  });
  const stopsOf = (id: string) => r.routes.find((x) => x.id === id)?.stops ?? [];
  // trucks shown: active ones, plus deactivated trucks that are still on a trip / in a queue
  const rows = $derived(sortDesk(truckDesk({ trucks: ref().trucks, providers: ref().providers, drivers: ref().drivers, waiting, shipments: ships, checkpoints: r.checkpoints, suppliers: r.suppliers, stopsOf, now }))
    .filter((x) => x.truck.active !== false || x.state !== 'Idle'));
  const k = $derived(deskKpis(rows, trips));

  // ---- filters (remembered in the URL: #/trucks?state=Delayed&provider=pr-ets) ----
  const view = $state<{ tab: 'trucks' | 'expenses' }>({ tab: qp('view') === 'expenses' ? 'expenses' : 'trucks' });
  let stf = $state<TruckState | 'road' | ''>((qp('state') as TruckState) || '');
  let provider = $state(qp('provider')); let lp = $state(qp('lp')); let routeId = $state(''); let q = $state('');
  const myPoints = $derived(r.suppliers.filter((s) => !user.roles.includes('truck_planner') || !user.loadingPointIds.length || user.loadingPointIds.includes(s.id) || user.roles.some((x) => ['director', 'admin', 'planner', 'fleet', 'operations'].includes(x))));
  const usedProviders = $derived(ref().providers.filter((p) => rows.some((x) => x.truck.providerId === p.id)));
  const usedRoutes = $derived(r.routes.filter((rt) => rows.some((x) => x.routeId === rt.id)));
  const list = $derived(rows.filter((x) => (!stf || (stf === 'road' ? ON_ROAD.includes(x.state) : x.state === stf))
    && (!provider || x.truck.providerId === provider) && (!lp || x.loadingPointId === lp || (x.state === 'Loading' && lookup.checkpoint(r.suppliers.find((s) => s.id === lp)?.checkpointId ?? '')?.id === (x.legId ? ships.find((s) => s.id === x.shipmentId)?.legs.find((l) => l.id === x.legId)?.fromId : undefined)))
    && (!routeId || x.routeId === routeId)
    && (!q.trim() || `${x.truck.reg} ${x.truck.trailer} ${x.provider?.name ?? ''} ${x.driver?.name ?? ''} ${x.shipmentRef ?? ''} ${x.where}`.toLowerCase().includes(q.trim().toLowerCase()))));
  const count = (s: TruckState) => rows.filter((x) => x.state === s).length;
  const tone = (s: TruckState) => TRUCK_STATES.find((x) => x.state === s)!.tone;
  const stateLabel = (s: TruckState) => TRUCK_STATES.find((x) => x.state === s)!.label;
  const lpName = (id?: string) => { const s = id ? lookup.supplier(id) : undefined; return s ? `${s.code} ${s.city}` : '—'; };
  function pick(s: TruckState | 'road' | '') { stf = stf === s ? '' : s; }
  $effect(() => {
    const p = new URLSearchParams();
    if (view.tab === 'expenses') p.set('view', 'expenses');
    if (stf) p.set('state', stf); if (provider) p.set('provider', provider); if (lp) p.set('lp', lp);
    const co = router.query.get('co'); if (co) p.set('co', co);
    const want = `#/trucks${p.size ? `?${p}` : ''}`;
    if (location.hash !== want) history.replaceState(null, '', want);
  });

  // ---- charts ----
  const byState = $derived(TRUCK_STATES.map((s) => ({ label: s.label, value: count(s.state) })).filter((x) => x.value));
  const queueByLp = $derived(myPoints.map((s) => { const qd = rows.filter((x) => x.state === 'Waiting' && x.loadingPointId === s.id); return { name: `${s.code} ${s.city}`, id: s.id, n: qd.length, avg: qd.length ? Math.round(qd.reduce((a, x) => a + (x.waitingHours ?? 0), 0) / qd.length) : 0 }; }).filter((x) => x.n));

  // ---- expenses ----
  const provCosts = $derived(trips ? costsByProvider(trips, ref().trucks, ref().providers) : []);
  const truckCosts = $derived(trips ? costsByTruck(trips, ref().trucks) : []);
  const tripsOf = (truckId: string) => (trips ?? []).filter((t) => tripTruck(t) === truckId).sort((a, b) => (b.shipment.legs[0]?.departedAt ?? '').localeCompare(a.shipment.legs[0]?.departedAt ?? ''));

  // ---- detail ----
  let dlg = $state<HTMLDialogElement>();
  let sel = $state<TruckRow | null>(null);
  function open(x: TruckRow) { sel = x; dlg?.showModal(); }
  const tripHist = $derived(sel ? ships.filter((s) => s.legs.some((l) => l.truckId === sel!.truck.id)).map((s) => ({ s, leg: s.legs.filter((l) => l.truckId === sel!.truck.id).at(-1)! })).sort((a, b) => (b.leg.plannedArrival ?? '').localeCompare(a.leg.plannedArrival ?? '')) : []);
  const selCosts = $derived(sel && trips ? costsByTruck(tripsOf(sel.truck.id), ref().trucks)[0] ?? null : null);

  // ---- add a trip expense (goes through the existing payment / approval rules) ----
  const KINDS: CostKind[] = ['Clearing & forwarding', 'Taxes & duties', 'Loading & offloading', 'Storage', 'Other', 'Transport'];
  let cDlg = $state<HTMLDialogElement>();
  let cTrip = $state(''); let cKind = $state<CostKind>('Other'); let cAmount = $state(0); let cCur = $state<'USD' | 'KES' | 'UGX' | 'TZS' | 'RWF'>('USD'); let cDoc = $state(''); let cErr = $state(''); let busy = $state(false);
  const tripChoices = $derived((trips ?? []).filter((t) => !sel || tripTruck(t) === sel.truck.id).slice(0, 60));
  function openCost(truckId?: string) {
    const first = (trips ?? []).find((t) => !truckId || tripTruck(t) === truckId);
    cTrip = first?.shipment.id ?? ''; cKind = 'Other'; cAmount = 0; cCur = 'USD'; cDoc = ''; cErr = '';
    cDlg?.showModal();
  }
  const tripLabel = (t: Trip) => `${t.shipment.ref} · ${lookup.truck(tripTruck(t))?.reg ?? ''} · ${lookup.route(t.shipment.legs[0]?.routeId ?? '')?.name ?? ''}`;
  async function saveCost(e: Event) {
    e.preventDefault(); cErr = '';
    if (!cTrip) { cErr = 'Pick the trip'; return; }
    if (!(cAmount > 0)) { cErr = 'Enter an amount above zero'; return; }
    busy = true;
    try { await finance.addCost({ shipmentId: cTrip, kind: cKind, amount: Number(cAmount), currency: cCur, docRef: cDoc.trim() || undefined } as never); cDlg?.close(); say('Expense added to the trip — accounts pay it; above the limit a director approves'); }
    catch (err) { cErr = describe(err).message; } finally { busy = false; }
  }

  const exportTrucks = () => [['Truck', 'Trailer', 'Provider', 'Driver', 'State', 'Where', 'Position source', 'Last position at', 'Shipment', 'ETA', 'ETA state', 'Open issues', 'Queue', 'Queue position', 'Waiting (h)', 'Days since last move'],
    ...list.map((x) => [x.truck.reg, x.truck.trailer, x.provider?.name ?? '', x.driver?.name ?? '', stateLabel(x.state), x.where, x.position?.source ?? '', x.position?.at ?? '', x.shipmentRef ?? '', x.eta?.eta ?? '', x.eta ? `${x.eta.state}${x.eta.hours ? ` ${x.eta.hours} h` : ''}` : '', x.issues.map((i) => `${i.reason} (${i.place})`).join('; '), x.loadingPointId ? lpName(x.loadingPointId) : '', x.queuePosition ?? '', x.waitingHours !== undefined ? Math.round(x.waitingHours * 10) / 10 : '', x.daysSinceMove ?? ''])];
  const costHead = ['Trips', 'Agreed transport (USD)', 'Extra costs (USD)', 'Paid (USD)', 'Waiting approval (USD)', 'Balance owed (USD)', 'Cases', 'Trip cost per case (USD)'];
  const exportCosts = () => [['Level', 'Provider / truck', ...costHead],
    ...provCosts.map((c) => ['Provider', c.label, c.trips, c.agreed, c.extras, c.paid, c.pending, c.balance, c.cases, c.perCase]),
    ...truckCosts.map((c) => ['Truck', `${c.label} (${lookup.provider(lookup.truck(c.id)?.providerId ?? '')?.name ?? ''})`, c.trips, c.agreed, c.extras, c.paid, c.pending, c.balance, c.cases, c.perCase])];
</script>

<div class="page-head">
  <div><div class="overline crumb">Logistics</div><h1>Truck desk</h1>
    <p class="muted small">Every truck by where it is now — queues, loading, on the road, at borders, delivered — and what it costs. {user.roles.includes('truck_planner') && user.loadingPointIds.length ? `Your loading points: ${user.loadingPointIds.map(lpName).join(', ')}.` : ''}</p></div>
  <div class="row">
    <a class="btn btn-secondary" href="#/loading"><ListOrdered size={16} />Loading queues</a>
    {#if can(user, 'master-data.transport')}<a class="btn btn-secondary" href="#/master?tab=providers"><Building size={16} />Providers & trucks</a>{/if}
    {#if canMoney}<RecordFor what="a trip expense" cue={false}><button class="btn btn-primary" onclick={() => { sel = null; openCost(); }}><Plus size={16} />Trip expense</button></RecordFor>{/if}
    <ExportMenu name={view.tab === 'expenses' ? 'transport-costs' : 'truck-desk'} rows={view.tab === 'expenses' ? exportCosts : exportTrucks} />
  </div>
</div>
<ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />

<div class="tiles">
  <StatTile label="Trucks in queue" value={w.loaded ? String(k.inQueue) : '…'} hint={k.longWaits ? `${k.longWaits} waiting over a day` : 'at your loading points'} active={stf === 'Waiting'} onclick={() => { view.tab = 'trucks'; pick('Waiting'); }} />
  <StatTile label="On the road" value={w.loaded ? String(k.onRoad) : '…'} hint="{count('At border')} at a border · {k.loading} loading" active={stf === 'road'} onclick={() => { view.tab = 'trucks'; pick('road'); }} />
  <StatTile label="Delayed" value={w.loaded ? String(k.delayed) : '…'} hint="6 h or more behind, or an open issue" active={stf === 'Delayed'} onclick={() => { view.tab = 'trucks'; pick('Delayed'); }} />
  <StatTile label="Open issues" value={w.loaded ? String(k.openIssues) : '…'} hint="breakdowns, documents, police …" onclick={() => { view.tab = 'trucks'; pick('Delayed'); }} />
  <StatTile label="Average queue wait" value={w.loaded ? waitLabel(k.avgWaitHours) : '…'} hint="trucks waiting now" onclick={() => { view.tab = 'trucks'; pick('Waiting'); }} />
  {#if canMoney}<StatTile label="Transport owed" value={trips ? usd(k.owed) : '…'} hint={k.pending ? `${usd(k.pending)} waiting for a director` : 'agreed − paid, all trips'} active={view.tab === 'expenses'} onclick={() => (view.tab = 'expenses')} />{/if}
</div>

<div class="tabs" role="tablist" aria-label="View">
  <button role="tab" aria-selected={view.tab === 'trucks'} onclick={() => (view.tab = 'trucks')}>Trucks ({rows.length})</button>
  {#if canMoney}<button role="tab" aria-selected={view.tab === 'expenses'} onclick={() => (view.tab = 'expenses')}>Expenses by provider & truck</button>{/if}
</div>

{#if view.tab === 'trucks'}
  <div class="charts-grid">
    <ChartCard title="Trucks by state" subtitle="now" rows={() => [['State', 'Trucks'], ...byState.map((x) => [x.label, x.value])]}>
      {#if byState.length}<Donut label="Trucks by state" data={byState} center={String(rows.length)} onselect={(l) => pick(TRUCK_STATES.find((s) => s.label === l)?.state ?? '')} />{:else}<p class="empty small">No trucks yet.</p>{/if}
    </ChartCard>
    <ChartCard title="Queue by loading point" subtitle="trucks waiting · average wait" rows={() => [['Loading point', 'Waiting', 'Average wait (h)'], ...queueByLp.map((x) => [x.name, x.n, x.avg])]}>
      {#if queueByLp.length}<BarChart label="Trucks waiting by loading point" horizontal categories={queueByLp.map((x) => `${x.name} — ${x.avg} h avg`)} series={[{ name: 'Waiting', values: queueByLp.map((x) => x.n) }]} onselect={(c) => { lp = queueByLp.find((x) => c.startsWith(x.name))?.id ?? ''; stf = 'Waiting'; }} />
      {:else}<p class="empty small">No trucks waiting.</p>{/if}
    </ChartCard>
  </div>

  <div class="chips" role="group" aria-label="Truck state">
    <button class="chip" class:on={!stf} onclick={() => (stf = '')}>All <span class="n">{rows.length}</span></button>
    <button class="chip" class:on={stf === 'road'} onclick={() => pick('road')}>On the road <span class="n">{k.onRoad}</span></button>
    {#each TRUCK_STATES as s}{#if count(s.state)}<button class="chip" class:on={stf === s.state} onclick={() => pick(s.state)}><span class="dot tone-{s.tone}"></span>{s.label} <span class="n">{count(s.state)}</span></button>{/if}{/each}
  </div>
  <div class="filters">
    <label class="field"><span>Search</span><span class="srch"><Search size={16} /><input class="input" type="search" bind:value={q} placeholder="Truck, driver, provider, shipment, place" /></span></label>
    <label class="field"><span>Provider</span><select class="select" bind:value={provider}><option value="">All providers</option>{#each usedProviders as p}<option value={p.id}>{p.name}</option>{/each}</select></label>
    <label class="field"><span>Loading point</span><select class="select" bind:value={lp}><option value="">All</option>{#each myPoints as s}<option value={s.id}>{s.code} {s.city}</option>{/each}</select></label>
    <label class="field"><span>Route</span><select class="select" bind:value={routeId}><option value="">All routes</option>{#each usedRoutes as rt}<option value={rt.id}>{rt.name}</option>{/each}</select></label>
  </div>

  <div class="card flush table-wrap"><table class="table">
    <thead><tr><th>Truck</th><CompanyCell head /><th>State</th><th>Where now</th><th>ETA</th><th>Driver</th><th>Provider</th><th>Issues</th><th class="num">Days since move</th></tr></thead>
    <tbody>
      {#each list as x (x.truck.id)}
        <tr class="click" tabindex="0" onclick={() => open(x)} onkeydown={(e) => e.key === 'Enter' && open(x)}>
          <td><strong>{x.truck.reg}</strong><div class="caption">{x.truck.trailer || '—'} · {fmtNum(x.truck.capacityCases)} cases</div></td>
          <CompanyCell entityId={x.entityId} />
          <td><Badge tone={tone(x.state)}>{stateLabel(x.state)}</Badge>{#if x.state === 'Waiting'}<div class="caption">#{x.queuePosition} · {waitLabel(x.waitingHours)}</div>{/if}</td>
          <td class="small">{x.where}{#if x.position}<div class="caption">{x.position.source === 'gps' ? 'GPS' : x.position.source === 'checkpoint' ? 'last check-in' : 'loading point'}{x.position.at ? ` · ${ago(x.position.at)}` : ''}</div>{/if}</td>
          <td class="small">{#if x.eta && x.state !== 'Waiting' && x.state !== 'Idle'}{fmtDateTime(x.eta.eta)}<div class="caption" class:late={x.eta.state === 'Late'}>{x.eta.state}{x.eta.hours ? ` ${x.eta.hours} h` : ''} · to {lookup.checkpoint(x.toId ?? '')?.name ?? ''}</div>{:else}—{/if}</td>
          <td class="small">{x.driver?.name ?? '—'}{#if x.driver && !x.driver.hasApp}<div class="caption">SMS</div>{/if}</td>
          <td class="small">{x.provider?.name ?? '—'}</td>
          <td class="small">{#if x.issues.length}<span class="issue"><TriangleAlert size={14} />{x.issues[0].reason}</span>{#if x.issues.length > 1}<div class="caption">+{x.issues.length - 1} more</div>{/if}{:else}—{/if}</td>
          <td class="num" class:stale={(x.daysSinceMove ?? 0) >= 7}>{x.daysSinceMove ?? '—'}</td>
        </tr>
      {:else}<tr><td colspan="9" class="empty">{w.loaded ? 'No truck matches these filters.' : 'Loading…'}</td></tr>{/each}
    </tbody>
  </table></div>
{:else}
  <div class="charts-grid">
    <ChartCard span={2} title="Transport owed by provider" subtitle="agreed transport − payments made, USD" rows={() => [['Provider', ...costHead], ...provCosts.map((c) => [c.label, c.trips, c.agreed, c.extras, c.paid, c.pending, c.balance, c.cases, c.perCase])]}>
      {#if provCosts.length}<BarChart label="Transport owed by provider" horizontal categories={provCosts.map((c) => c.label)} series={[{ name: 'Paid', values: provCosts.map((c) => c.paid), slot: 8 }, { name: 'Owed', values: provCosts.map((c) => Math.max(0, c.balance)) }]} stacked format={usd} onselect={(c) => { provider = provCosts.find((x) => x.label === c)?.id ?? ''; }} />
      {:else}<p class="empty small">No trips yet.</p>{/if}
    </ChartCard>
  </div>
  <section class="card flush">
    <header><div><h3>By provider</h3><div class="caption">All trips in scope · amounts in USD at the approved month-average rate</div></div></header>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Provider</th><th class="num">Trips</th><th class="num">Agreed transport</th><th class="num">Extra costs</th><th class="num">Paid</th><th class="num">Waiting approval</th><th class="num">Balance owed</th><th class="num">Cases</th><th class="num">Trip cost / case</th></tr></thead>
      <tbody>{#each provCosts as c (c.id)}<tr class:sel={provider === c.id}><td><button class="linkish" onclick={() => (provider = provider === c.id ? '' : c.id)}>{c.label}</button></td><td class="num">{c.trips}</td><td class="num">{fmtMoney(c.agreed)}</td><td class="num">{fmtMoney(c.extras)}</td><td class="num">{fmtMoney(c.paid)}</td><td class="num">{c.pending ? fmtMoney(c.pending) : '—'}</td><td class="num"><strong class:owed={c.balance > 0}>{fmtMoney(c.balance)}</strong></td><td class="num">{fmtNum(c.cases)}</td><td class="num">{fmtMoney(c.perCase)}</td></tr>
      {:else}<tr><td colspan="9" class="empty">{trips ? 'No trips yet.' : 'Loading…'}</td></tr>{/each}</tbody>
    </table></div>
  </section>
  <section class="card flush" style="margin-top:var(--space-4)">
    <header><div><h3>By truck{provider ? ` · ${lookup.provider(provider)?.name}` : ''}</h3><div class="caption">Trips are counted for the truck that loaded them</div></div></header>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Truck</th><th>Provider</th><th class="num">Trips</th><th class="num">Agreed transport</th><th class="num">Extra costs</th><th class="num">Paid</th><th class="num">Balance owed</th><th class="num">Trip cost / case</th><th></th></tr></thead>
      <tbody>{#each truckCosts.filter((c) => !provider || lookup.truck(c.id)?.providerId === provider) as c (c.id)}{@const row = rows.find((x) => x.truck.id === c.id)}
        <tr><td><strong>{c.label}</strong></td><td class="small">{lookup.provider(lookup.truck(c.id)?.providerId ?? '')?.name ?? '—'}</td><td class="num">{c.trips}</td><td class="num">{fmtMoney(c.agreed)}</td><td class="num">{fmtMoney(c.extras)}</td><td class="num">{fmtMoney(c.paid)}</td><td class="num"><strong class:owed={c.balance > 0}>{fmtMoney(c.balance)}</strong></td><td class="num">{fmtMoney(c.perCase)}</td>
          <td>{#if row}<button class="btn btn-ghost btn-sm" onclick={() => open(row)}>Details</button>{/if}</td></tr>
      {:else}<tr><td colspan="9" class="empty">No trips.</td></tr>{/each}</tbody>
    </table></div>
  </section>
{/if}

<dialog class="sheet wide" bind:this={dlg} aria-labelledby="td-title">
  {#if sel}
    <div class="body stack">
      <div class="row between"><div><h3 id="td-title">{sel.truck.reg} <span class="caption">/ {sel.truck.trailer}</span></h3><div class="caption">{sel.provider?.name} · {fmtNum(sel.truck.capacityCases)} cases · driver {sel.driver?.name ?? '—'}{sel.driver ? ` (${sel.driver.phone})` : ''}</div></div><Badge tone={tone(sel.state)}>{stateLabel(sel.state)}</Badge></div>
      <div class="facts">
        <div><span class="caption">Where now</span><strong>{sel.where}</strong>{#if sel.position?.at}<span class="caption">{sel.position.source === 'gps' ? 'GPS' : 'last check-in'} {ago(sel.position.at)}</span>{/if}</div>
        {#if sel.eta && !['Waiting', 'Idle'].includes(sel.state)}<div><span class="caption">ETA</span><strong>{fmtDateTime(sel.eta.eta)}</strong><span class="caption">{sel.eta.state}{sel.eta.hours ? ` ${sel.eta.hours} h` : ''}</span></div>{/if}
        {#if sel.state === 'Waiting'}<div><span class="caption">Queue</span><strong>#{sel.queuePosition} at {lpName(sel.loadingPointId)}</strong><span class="caption">waiting {waitLabel(sel.waitingHours)}</span></div>{/if}
        <div><span class="caption">Last moved</span><strong>{sel.lastMoveAt ? fmtDateTime(sel.lastMoveAt) : '—'}</strong><span class="caption">{sel.daysSinceMove ?? '—'} days ago</span></div>
      </div>
      {#if sel.issues.length}<div class="issues">{#each sel.issues as i}<div class="row small"><TriangleAlert size={16} /><span><strong>{i.reason}</strong> · {i.place} · {fmtDateTime(i.at)}{#if i.newDueDate} · new due {fmtDate(i.newDueDate)}{/if}</span></div>{/each}</div>{/if}
      {#if selCosts}
        <div class="facts money">
          <div><span class="caption">Agreed transport</span><strong>{fmtMoney(selCosts.agreed)}</strong><span class="caption">{selCosts.trips} trips</span></div>
          <div><span class="caption">Extra costs</span><strong>{fmtMoney(selCosts.extras)}</strong></div>
          <div><span class="caption">Paid</span><strong>{fmtMoney(selCosts.paid)}</strong>{#if selCosts.pending}<span class="caption">{fmtMoney(selCosts.pending)} waiting approval</span>{/if}</div>
          <div><span class="caption">Balance owed</span><strong class:owed={selCosts.balance > 0}>{fmtMoney(selCosts.balance)}</strong><span class="caption">{fmtMoney(selCosts.perCase)} per case</span></div>
        </div>
      {/if}
      <div>
        <div class="overline">Trips ({tripHist.length})</div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Shipment</th><th>Route</th><th>Departed</th><th>Status</th><th class="num">Cases</th>{#if canMoney}<th class="num">Costs</th><th class="num">Owed</th>{/if}</tr></thead>
          <tbody>{#each tripHist.slice(0, 12) as h (h.s.id)}{@const t = (trips ?? []).find((x) => x.shipment.id === h.s.id)}
            <tr><td><a class="mono" href="#/shipments/{h.s.id}" onclick={() => dlg?.close()}>{h.s.ref}</a></td><td class="small">{lookup.route(h.leg.routeId)?.name ?? '—'}</td><td class="small">{h.leg.departedAt ? fmtDate(h.leg.departedAt) : '—'}</td><td><Badge status={h.s.status} /></td><td class="num">{fmtNum(h.leg.lines.reduce((a, l) => a + l.loadedQty, 0))}</td>
              {#if canMoney}<td class="num small">{t ? fmtMoney(t.expenses) : '—'}{#if t?.costs.length}<div class="caption">{t.costs.map((c) => c.kind).join(', ')}</div>{/if}</td><td class="num small">{t ? fmtMoney(Math.max(0, t.balance)) : '—'}</td>{/if}</tr>
          {:else}<tr><td colspan="7" class="empty small">No trips yet.</td></tr>{/each}</tbody>
        </table></div>
        {#if tripHist.length > 12}<p class="caption">Latest 12 of {tripHist.length} trips — export the trip financials for the rest.</p>{/if}
      </div>
      <div class="row" style="justify-content:flex-end">
        {#if sel.shipmentId}<a class="btn btn-secondary" href="#/shipments/{sel.shipmentId}" onclick={() => dlg?.close()}>Open current shipment</a>{/if}
        {#if sel.state === 'Waiting'}<a class="btn btn-secondary" href="#/loading?lp={sel.loadingPointId}" onclick={() => dlg?.close()}>Open the queue</a>{/if}
        {#if canMoney && tripsOf(sel.truck.id).length}<RecordFor what="a trip expense" cue={false}><button class="btn btn-secondary" onclick={() => openCost(sel!.truck.id)}><Plus size={16} />Trip expense</button></RecordFor>{/if}
        <button class="btn btn-primary" onclick={() => dlg?.close()}>Close</button>
      </div>
    </div>
  {/if}
</dialog>

<dialog class="sheet" bind:this={cDlg} aria-labelledby="cost-title">
  <form class="body stack" onsubmit={saveCost}>
    <div><h3 id="cost-title">Add a trip expense</h3><div class="caption">Goes into the trip's landing cost. Accounts record the payment; payments above the limit wait for a director.</div></div>
    <label class="field"><span>Trip</span><select class="select" bind:value={cTrip}>{#each tripChoices as t (t.shipment.id)}<option value={t.shipment.id}>{tripLabel(t)}</option>{/each}</select></label>
    <div class="form-grid">
      <label class="field"><span>Kind</span><select class="select" bind:value={cKind}>{#each KINDS as kd}<option>{kd}</option>{/each}</select></label>
      <label class="field"><span>Amount</span><span class="row"><select class="select cur" bind:value={cCur} aria-label="Currency">{#each ['USD', 'KES', 'UGX', 'TZS', 'RWF'] as c}<option>{c}</option>{/each}</select><input class="input num" type="number" min="0" step="0.01" bind:value={cAmount} aria-label="Amount" /></span></label>
    </div>
    <label class="field"><span>Receipt / reference</span><input class="input" bind:value={cDoc} placeholder="e.g. border clearing receipt CF-1234" /></label>
    {#if cErr}<p class="error" role="alert">{cErr}</p>{/if}
    <div class="row" style="justify-content:flex-end"><button type="button" class="btn btn-ghost" onclick={() => cDlg?.close()}>Cancel</button><button class="btn btn-primary" disabled={busy}>Add expense</button></div>
  </form>
</dialog>

<style>
  .tiles { margin-bottom: var(--space-4); }
  .chips { display: flex; flex-wrap: wrap; gap: var(--space-2); margin: var(--space-4) 0 var(--space-3); }
  .chip { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 var(--space-3); border-radius: 16px; border: 1px solid var(--border); background: var(--surface); color: var(--text); font: inherit; font-size: 13px; cursor: pointer; }
  .chip.on { background: var(--primary-subtle); border-color: var(--primary); font-weight: 600; }
  .chip .n { color: var(--text-muted); font-variant-numeric: tabular-nums; }
  .dot { width: 8px; height: 8px; border-radius: 4px; background: var(--text-subtle); }
  .dot.tone-danger { background: var(--danger-solid); } .dot.tone-warning { background: var(--warning-solid); } .dot.tone-info { background: var(--info); } .dot.tone-success { background: var(--success); } .dot.tone-accent { background: var(--accent); }
  .srch { display: flex; align-items: center; gap: var(--space-2); color: var(--text-muted); }
  .srch .input { min-width: 240px; }
  tr.click { cursor: pointer; }
  tr.click:hover, tr.click:focus-visible { background: var(--surface-sunken); outline: none; }
  tr.sel { background: var(--primary-subtle); }
  .late { color: var(--danger); font-weight: 600; }
  .stale { color: var(--warning); font-weight: 600; }
  .issue { display: inline-flex; align-items: center; gap: 4px; color: var(--danger); font-weight: 600; }
  .owed { color: var(--danger); }
  .linkish { background: none; border: 0; padding: 0; color: var(--link); font: inherit; cursor: pointer; text-align: left; }
  dialog.wide { width: min(860px, calc(100vw - 32px)); }
  .facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: var(--space-3); padding: var(--space-3); background: var(--surface-sunken); border-radius: var(--radius-md); }
  .facts div { display: flex; flex-direction: column; gap: 2px; }
  .issues { padding: var(--space-2) var(--space-3); background: var(--danger-subtle); color: var(--danger); border-radius: var(--radius-md); }
  .select.cur { width: 90px; }
  .error { color: var(--danger); font-weight: 600; margin: 0; }
  .mono { white-space: nowrap; }
</style>
