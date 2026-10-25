<script lang="ts">
  import { destinationLabel } from '../lib/planning';
  import { chainModel, chainOf, journeySteps, sendOn, type ChainShipment } from '../lib/journey';
  import { router } from '@btw/ui';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import RecordFor from '../components/RecordFor.svelte';
  import { company, GROUP } from '../lib/company.svelte';
  const groupView = $derived(company.active === GROUP);
  import { watch } from '../lib/load.svelte';
  import ErrorState from '../components/ErrorState.svelte';
  import { finance, lookup, ref, shipments, tracking, type Acknowledgement, type Leg, type Shipment, type User } from '@btw/api';
  import { canDispatch, canSendOn, canSplitLeg, canUpdateTrip } from '@btw/api/access';
  import { can } from '../lib/features';
  import { describe } from '../lib/errors';
  import { Badge, CheckpointTimeline, fmtDateTime, fmtNum, hoursLabel, say } from '@btw/ui';
  import Plus from '@lucide/svelte/icons/plus';
  import AlertTriangle from '@lucide/svelte/icons/triangle-alert';
  import Clock from '@lucide/svelte/icons/clock';
  let { params, user }: { params: { id: string }; user: User } = $props();

  const r = ref();
  let sh = $state<Shipment | null>(null);
  let acks = $state<Record<string, Acknowledgement>>({});
  let poRef = $state('');
  let chain = $state<ChainShipment[]>([]);
  let chainAcks = $state<Record<string, Acknowledgement>>({});
  async function load() {
    sh = await shipments.get(params.id);
    if (!sh) return;
    const all = await shipments.list();
    chain = chainOf(all.some((x) => x.id === sh!.id) ? all : [...all, sh], sh);
    const others = chain.filter((c) => c.id !== sh!.id);
    chainAcks = Object.fromEntries((await Promise.all(others.map((c) => tracking.acks(c.id)))).flat().map((a) => [a.legId, a]));
    poRef = lookup.poRef(sh.poId);
    acks = Object.fromEntries((await tracking.acks(sh.id)).map((a) => [a.legId, a]));
    if (canMoney) { const t = (await finance.trips()).find((x) => x.shipment.id === sh!.id); agreed = t ? { recorded: t.agreedRecorded !== false, usd: t.transport } : null; }
  }
  // docs/12 A-04: the agreed transport price is recorded after loading (Testfie, directors)
  const canMoney = $derived(can(user, 'truck-expenses'));
  let agreed = $state<{ recorded: boolean; usd: number } | null>(null);
  let apDlg = $state<HTMLDialogElement>();
  let apAmount = $state<number | ''>(''); let apCur = $state<'USD' | 'KES' | 'UGX' | 'TZS' | 'RWF'>('USD'); let apErr = $state('');
  async function saveAgreed(e: Event) {
    e.preventDefault(); apErr = '';
    if (!(Number(apAmount) > 0)) { apErr = 'Enter the agreed price (above zero)'; return; }
    try { await finance.setAgreedPrice(sh!.id, { amount: Number(apAmount), currency: apCur }); apDlg?.close(); say('Agreed transport price recorded'); } catch (err) { apErr = describe(err).message; }
  }
  const w = watch(load);

  // docs/12 §7: directors and Kabonge view trips; Testfie updates every trip; loaders dispatch at their point; the
  // re-export planner sends goods on from her warehouse.
  const myLoadingCps = $derived(r.suppliers.filter((s) => user.loadingPointIds.includes(s.id)).map((s) => s.checkpointId));
  const myWarehouseCps = $derived(r.warehouses.filter((w) => user.warehouseIds.includes(w.id)).map((w) => w.checkpointId));
  const mayAct = (leg: Leg, a: { cp: string; kind: string } | null) => !!a && (a.cp === leg.passes[0].checkpointId && a.kind === 'departed' ? canDispatch(user, leg, { myLoadingCps, myWarehouseCps }) : canUpdateTrip(user, leg));
  const tripWrite = (leg: Leg) => canUpdateTrip(user, leg) || mayAct(leg, nextAction(leg));
  const office = $derived(!!sh && sh.legs.some((l) => tripWrite(l)));
  const mayOnward = $derived(!!sh && !!sh.legs.at(-1) && canSendOn(user, r.warehouses.find((w) => w.checkpointId === sh!.legs.at(-1)!.toId)?.id ?? ''));
  const finalCp = $derived(sh ? lookup.warehouse(sh.warehouseId)?.checkpointId : undefined);
  const last = $derived(sh?.legs.at(-1));

  function nextAction(leg: Leg): { cp: string; kind: 'arrived' | 'departed'; label: string } | null {
    if (leg.status === 'Acknowledged' || leg.status === 'Cancelled') return null;
    const i = leg.passes.reduce((a, p, k) => (p.arrivedAt ? k : a), -1);
    if (i >= 0 && !leg.passes[i].departedAt && i < leg.passes.length - 1)
      return { cp: leg.passes[i].checkpointId, kind: 'departed', label: `Mark departed ${lookup.checkpoint(leg.passes[i].checkpointId)?.name}` };
    const nx = leg.passes[i + 1];
    if (!nx) return null;
    if (i < 0) return { cp: nx.checkpointId, kind: 'departed', label: `Dispatch from ${lookup.checkpoint(nx.checkpointId)?.name}` };
    return { cp: nx.checkpointId, kind: 'arrived', label: `Mark arrived ${lookup.checkpoint(nx.checkpointId)?.name}` };
  }
  async function act(leg: Leg, a: NonNullable<ReturnType<typeof nextAction>>) {
    if (a.cp === leg.passes[0].checkpointId && a.kind === 'departed') { await tracking.dispatch(leg.id); say('Truck dispatched (source: office)'); return; }
    await shipments.pass(leg.id, a.cp, a.kind, 'office'); say(`${a.kind === 'arrived' ? 'Arrival' : 'Departure'} recorded (source: office)`);
  }

  // Truck issue
  let issueDlg = $state<HTMLDialogElement>();
  let issueLeg = $state<Leg | null>(null);
  let iss = $state({ checkpointId: '', place: '', reason: '', due: '' });
  let issErr = $state('');
  function openIssue(leg: Leg) {
    issueLeg = leg;
    const i = leg.passes.reduce((a, p, k) => (p.arrivedAt ? k : a), 0);
    const cp = leg.passes[i].checkpointId;
    iss = { checkpointId: cp, place: lookup.checkpoint(cp)?.name ?? '', reason: '', due: '' }; issErr = '';
    issueDlg?.showModal();
  }
  async function saveIssue() {
    if (!iss.reason.trim()) { issErr = 'Give a reason — e.g. breakdown, documents, police check'; return; }
    await shipments.issue(issueLeg!.id, { at: new Date().toISOString(), checkpointId: iss.checkpointId || undefined, place: iss.place, reason: iss.reason, newDueDate: iss.due ? new Date(iss.due).toISOString() : undefined });
    issueDlg?.close(); say('Issue logged — fleet and directors notified');
  }
  // DS-02: plan where goods are unloaded and reloaded (intermediate warehouse on the route, not yet reached)
  const transferPoints = (leg: Leg) => leg.passes.slice(1, -1).filter((p) => !p.arrivedAt && lookup.checkpoint(p.checkpointId)?.kind === 'warehouse');
  async function split(leg: Leg, cp: string) { try { await tracking.splitAt(leg.id, cp); say(`Leg ${leg.seq} now ends at ${lookup.checkpoint(cp)?.name}`); } catch (e) { say((e as Error).message); } }
  async function fix(leg: Leg, id: string) { await shipments.fixIssue(leg.id, id); say('Issue marked fixed'); }

  // Transfer leg (DS-02)
  let legDlg = $state<HTMLDialogElement>();
  let nl = $state({ routeId: '', truckId: '', driverId: '' });
  // Routes from the transfer point; the ones reaching the shipment's final warehouse first
  const nextRoutes = $derived(last ? r.routes.filter((rt) => rt.stops[0].checkpointId === last.toId)
    .sort((x, y) => Number(y.stops.at(-1)!.checkpointId === finalCp) - Number(x.stops.at(-1)!.checkpointId === finalCp)) : []);
  // Chain model: any warehouse that received the goods into stock can send them on (once), e.g. Gisenyi → Goma or a
  // re-export to Juba. Older model: only an intermediate warehouse.
  const sentOn = $derived(!!sh && chain.some((c) => c.parentShipmentId === sh!.id));
  const canAddLeg = $derived(!!last && last.status === 'Acknowledged' && !sentOn && (chainModel()
    ? lookup.checkpoint(last.toId)?.kind === 'warehouse' && nextRoutes.length > 0
    : last.toId !== finalCp));
  let busyTrucks = $state<Set<string>>(new Set());
  // Cases the next leg carries (what the last leg holds); trucks that can't take it are not offered.
  const carry = $derived(last ? last.lines.reduce((a, l) => a + l.loadedQty, 0) : 0);
  const tooSmall = (truckId: string) => (lookup.truck(truckId)?.capacityCases ?? Infinity) < carry;
  async function openLeg() {
    const all = await shipments.list();
    busyTrucks = new Set(all.flatMap((x) => x.legs.filter((l) => !['Acknowledged', 'Cancelled'].includes(l.status)).map((l) => l.truckId)));
    const free = r.trucks.find((t) => !busyTrucks.has(t.id) && !tooSmall(t.id)) ?? r.trucks[0];
    nl = { routeId: nextRoutes[0]?.id ?? '', truckId: free.id, driverId: free.defaultDriverId ?? r.drivers[0].id }; legErr = '';
    legDlg?.showModal();
  }
  let legErr = $state('');
  async function addLeg() { if (!nl.routeId) { legErr = 'No route starts at this point — add one in Master data'; return; }
    if (tooSmall(nl.truckId)) { legErr = `${lookup.truck(nl.truckId)?.reg} holds ${lookup.truck(nl.truckId)?.capacityCases} cases; this shipment carries ${carry}. Pick a bigger truck.`; return; }
    try {
      const id = await sendOn(sh!, nl); legDlg?.close();
      if (id) { say('New shipment created from the warehouse'); router.go(`/shipments/${id}`); } else say('Onward move planned');
    } catch (e) { legErr = (e as Error).message; } }
  // Journey: every shipment (or leg) from the loading point to the final warehouse
  const steps = $derived(sh ? journeySteps(chain.length ? chain : [sh], sh.id, (legId) => {
    const a = acks[legId] ?? chainAcks[legId];
    return a ? { received: a.lines.reduce((x, y) => x + y.received, 0), damaged: a.lines.reduce((x, y) => x + y.damaged, 0) } : undefined;
  }) : []);
  const atWarehouse = $derived(canAddLeg && last ? lookup.checkpoint(last.toId)?.name ?? '' : '');

  // DS-03 reconciliation
  const products = $derived(sh ? [...new Set(sh.legs.flatMap((l) => l.lines.map((x) => x.productId)))] : []);
  function rec(leg: Leg, pid: string) {
    const loaded = leg.lines.find((x) => x.productId === pid)?.loadedQty ?? 0;
    const a = acks[leg.id]?.lines.find((x) => x.productId === pid);
    return { loaded, received: a?.received, damaged: a?.damaged, short: a ? a.received - loaded : undefined, good: a ? a.received - a.damaged : undefined, loss: a ? loaded - a.received + a.damaged : undefined };
  }
</script>

{#if !sh}
  {#if w.error}<ErrorState error={w.error} onretry={w.retry} />
  {:else if w.loaded}<div class="empty"><h2>Shipment not found</h2><a href="#/shipments">Back to shipments</a></div>
  {:else}<div class="skeleton" style="height:40px;width:40%"></div>{/if}
{:else}
  <ErrorState error={w.error} onretry={w.retry} compact />
  <div class="page-head">
    <div>
      <div class="overline crumb"><a href="#/shipments">Shipments</a> / Truck No. {sh.truckNo}</div>
      <h1 class="row"><span class="mono">{sh.ref}</span> <Badge status={sh.status} /></h1>
      <div class="muted small">PO <a class="mono" href="#/pos/{sh.poId}">{poRef}</a> · Delivered to {lookup.company(sh.receivingCompanyId)?.name} · {destinationLabel(sh.warehouseId)} · {sh.legs.length} leg{sh.legs.length > 1 ? 's' : ''}</div>
    </div>
    <div class="row">
      <a class="btn btn-secondary" href="#/finance">Trip costs & landing cost</a>
      {#if canMoney && agreed}{#if agreed.recorded}<span class="caption">Agreed transport USD {fmtNum(agreed.usd, 2)}</span>{:else}<Badge tone="warning">Agreed price: not recorded yet</Badge><button class="btn btn-secondary" onclick={() => { apAmount = ''; apErr = ''; apDlg?.showModal(); }}>Record agreed price</button>{/if}{/if}
      {#if canAddLeg && mayOnward}<RecordFor entityId={(sh as { entityId?: string }).entityId} cue={false}><button class="btn btn-primary" onclick={openLeg}><Plus size={16} />Send on — new shipment</button></RecordFor>{/if}
    </div>
  </div>

  <section class="card journey" aria-label="Journey">
    <header><h3>Journey</h3><span class="caption">{steps.length > 1 ? `${steps.length} ${chainModel() || chain.length > 1 ? 'shipments' : 'legs'} · goods are received into stock at each warehouse, the next move is a new shipment` : 'direct to the final warehouse'}</span></header>
    <ol class="steps">
      <li class="end"><span class="dot"></span><div><div class="caption">Loaded at</div><strong>{steps[0]?.from}</strong></div></li>
      {#each steps as st (st.key)}
        <li class:current={st.current}>
          <span class="dot"></span>
          <div class="grow">
            <div class="row between"><span>{#if st.current}<strong class="mono">{st.ref}</strong>{:else}<a class="mono" href="#/shipments/{st.shipmentId}">{st.ref}</a>{/if} <Badge status={st.status} /></span>
              <span class="caption">{st.truck} · {st.driver}</span></div>
            <div class="caption">{st.from} <ArrowRight size={12} /> {st.to} · loaded {fmtNum(st.loaded)}{#if st.received != null} · received {fmtNum(st.received)}{#if st.damaged} · {fmtNum(st.damaged)} damaged{/if}{#if st.received !== st.loaded} · <span class="loss">{fmtNum(st.received - st.loaded)}</span>{/if}{/if}</div>
          </div>
        </li>
      {/each}
      <li class="end"><span class="dot"></span><div><div class="caption">Final warehouse</div><strong>{destinationLabel(sh.warehouseId)}</strong></div></li>
    </ol>
    {#if atWarehouse && mayOnward}<p class="small note">Goods are in stock at <strong>{atWarehouse}</strong>. {last?.toId === finalCp ? 'To move them further (e.g. on to Goma or a re-export), send them on as a new shipment.' : 'Send them on as a new shipment when the next truck is ready.'}</p>{/if}
  </section>

  <div class="stack">
    {#each sh.legs as leg (leg.id)}
      {@const t = lookup.truck(leg.truckId)}
      {@const eta = shipments.eta(leg)}
      {@const a = nextAction(leg)}
      {@const dw = tracking.dwell(leg)}
      {@const od = tracking.overdue(leg)}
      <section class="card">
        <header>
          <div>
            <div class="overline">Leg {leg.seq} · {lookup.route(leg.routeId)?.name}</div>
            <h3 class="row">{t?.reg} <span class="caption">/ {t?.trailer}</span> <Badge status={leg.status} /></h3>
            <div class="small muted">{lookup.driver(leg.driverId)?.name} · {lookup.driver(leg.driverId)?.phone} · {t ? lookup.provider(t.providerId)?.name : ''}</div>
          </div>
          <div style="text-align:right">
            {#if leg.status !== 'Acknowledged'}<Badge status={eta.state}>{eta.state}{eta.state !== 'On time' ? ` ${hoursLabel(eta.hours)}` : ''}</Badge>{/if}
            <div class="caption">{leg.status === 'Acknowledged' ? 'Arrived' : 'ETA'} {fmtDateTime(eta.eta)}</div>
            <div class="caption">Planned {fmtDateTime(leg.plannedArrival)}</div>
          </div>
        </header>
        {#if od}
          <div class="alert danger" role="status"><AlertTriangle size={18} /><div><strong>No check-in at {lookup.checkpoint(od.checkpointId)?.name}</strong> — expected {fmtDateTime(od.expectedAt)}, now {hoursLabel(od.hours)} overdue. Call the driver ({lookup.driver(leg.driverId)?.phone}) or record the position below.</div></div>
        {:else if dw}
          <div class="alert {dw.over ? 'warning' : 'info'}" role="status"><Clock size={18} /><div><strong>At {lookup.checkpoint(dw.checkpointId)?.name} for {hoursLabel(dw.hours)}</strong> — planned stop {hoursLabel(dw.plannedDwellHours)}{dw.over ? `, ${hoursLabel(dw.hours - dw.plannedDwellHours)} longer than planned` : ''}.</div></div>
        {/if}
        <div class="leg-grid">
          <CheckpointTimeline {leg} />
          <div class="stack">
            {#if tripWrite(leg) && (a || leg.status !== 'Acknowledged') && groupView}
              <div class="stack-sm"><div class="overline">Office actions</div><RecordFor entityId={(sh as { entityId?: string }).entityId} cue={false}><span></span></RecordFor></div>
            {:else if tripWrite(leg) && (a || leg.status !== 'Acknowledged')}
              <div class="stack-sm">
                <div class="overline">Office actions</div>
                {#if a && mayAct(leg, a)}<button class="btn {leg.status === 'Planned' || leg.status === 'Loaded' ? 'btn-primary' : 'btn-secondary'} btn-block wrap" onclick={() => act(leg, a)}>{a.label}</button>{/if}
                {#each canSplitLeg(user) ? transferPoints(leg) : [] as tp}<button class="btn btn-secondary btn-block wrap" onclick={() => split(leg, tp.checkpointId)}>Unload & transfer at {lookup.checkpoint(tp.checkpointId)?.name}</button>{/each}
                {#if leg.status !== 'Acknowledged' && canUpdateTrip(user, leg)}<button class="btn btn-ghost btn-block wrap" onclick={() => openIssue(leg)}><AlertTriangle size={16} />Log truck issue</button>{/if}
                <p class="caption">Normally recorded by the driver app or geofence; use these when the driver has no app (SMS) or the GPS provider is down.</p>
              </div>
            {/if}
            {#if leg.issues.length}
              <div class="stack-sm">
                <div class="overline">Truck issues</div>
                {#each leg.issues as i}
                  <div class="card {i.fixedAt ? '' : 'flag-danger'}" style="padding:var(--space-3)">
                    <div class="row between"><strong class="small">{i.reason}</strong>{#if i.fixedAt}<Badge tone="success">Fixed</Badge>{:else}<Badge tone="danger">Open</Badge>{/if}</div>
                    <div class="caption">{i.place} · since {fmtDateTime(i.at)}{#if i.newDueDate} · new due {fmtDateTime(i.newDueDate)}{/if}{#if i.fixedAt} · fixed {fmtDateTime(i.fixedAt)}{/if}</div>
                    {#if !i.fixedAt && canUpdateTrip(user, leg)}<button class="btn btn-ghost btn-sm" onclick={() => fix(leg, i.id)}>Mark fixed</button>{/if}
                  </div>
                {/each}
              </div>
            {/if}
            {#if acks[leg.id]}
              {@const k = acks[leg.id]}
              <div class="card {k.hasDiscrepancy ? 'flag-warning' : ''}" style="padding:var(--space-3)">
                <div class="row between"><span class="overline">Acknowledgement</span>{#if k.hasDiscrepancy}<Badge tone="warning">Discrepancy</Badge>{:else}<Badge tone="success">Clean</Badge>{/if}</div>
                <div class="small">{k.receiverName} · {fmtDateTime(k.at)}</div>
                <div class="caption">{destinationLabel(k.warehouseId)}{k.signature ? ' · signed' : ''}{k.photos.length ? ` · ${k.photos.length} photo(s)` : ''}</div>
                {#each k.lines.filter((x) => x.remarks || x.reason) as x}<div class="caption">{#if x.reason}<strong>{x.reason}</strong>{x.remarks ? ' · ' : ''}{/if}{#if x.remarks}“{x.remarks}”{/if}</div>{/each}
              </div>
            {/if}
          </div>
        </div>
      </section>
    {/each}

    <section class="card flush">
      <header><div><h3>Quantity reconciliation</h3><div class="caption">Loaded vs received per leg — losses show on the leg where they happened (DS-03)</div></div></header>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Leg</th><th>Brand · Package</th><th class="num">Loaded</th><th class="num">Received</th><th class="num">Short / over</th><th class="num">Damaged</th><th class="num">Good (carried on)</th><th class="num">Loss on leg</th></tr></thead>
        <tbody>
          {#each sh.legs as leg}
            {#each products as pid}
              {@const x = rec(leg, pid)}
              {#if x.loaded}
                <tr>
                  <td>{leg.seq} · {lookup.checkpoint(leg.fromId)?.name?.split(' (')[0]} → {lookup.checkpoint(leg.toId)?.name?.split(' (')[0]}</td>
                  <td>{lookup.product(pid)?.brand} · {lookup.product(pid)?.pack}</td>
                  <td class="num">{fmtNum(x.loaded)}</td>
                  <td class="num">{x.received != null ? fmtNum(x.received) : '—'}</td>
                  <td class="num">{x.short == null ? '—' : x.short === 0 ? '0' : (x.short > 0 ? '+' : '−') + fmtNum(Math.abs(x.short))}</td>
                  <td class="num">{x.damaged != null ? fmtNum(x.damaged) : '—'}</td>
                  <td class="num">{x.good != null ? fmtNum(x.good) : '—'}</td>
                  <td class="num">{#if x.loss == null}<span class="caption">Not yet received</span>{:else if x.loss > 0}<Badge tone="danger">{fmtNum(x.loss)} cases</Badge>{:else}<Badge tone="success">None</Badge>{/if}</td>
                </tr>
              {/if}
            {/each}
          {/each}
        </tbody>
      </table></div>
    </section>
  </div>

  <dialog class="sheet" bind:this={issueDlg}>
    <div class="body stack">
      <h3>Log truck issue</h3>
      <p class="caption">{issueLeg ? lookup.truck(issueLeg.truckId)?.reg : ''} — where it stopped, why, and the new due date (§17.5).</p>
      {#if issueLeg}
        <label class="field"><span>Checkpoint</span><select class="select" bind:value={iss.checkpointId} onchange={() => (iss.place = lookup.checkpoint(iss.checkpointId)?.name ?? iss.place)}><option value="">Between checkpoints</option>{#each issueLeg.passes as p}<option value={p.checkpointId}>{lookup.checkpoint(p.checkpointId)?.name}</option>{/each}</select></label>
      {/if}
      <label class="field"><span>Place</span><input class="input" bind:value={iss.place} /></label>
      <label class="field"><span>Reason</span><input class="input" bind:value={iss.reason} aria-invalid={!!issErr} placeholder="e.g. Breakdown — gearbox; documents pending" />{#if issErr}<span class="error">{issErr}</span>{/if}</label>
      <div class="row" style="gap:var(--space-2)">{#each ['Breakdown', 'Clearing documents pending', 'Border queue', 'Police / weighbridge', 'Accident', 'Driver rest'] as q}<button type="button" class="badge tone-neutral chip" onclick={() => (iss.reason = q)}>{q}</button>{/each}</div>
      <label class="field"><span>New due date at destination</span><input class="input" type="datetime-local" bind:value={iss.due} /></label>
      <div class="row" style="justify-content:flex-end"><button class="btn btn-ghost" onclick={() => issueDlg?.close()}>Cancel</button><button class="btn btn-primary" onclick={saveIssue}>Log issue</button></div>
    </div>
  </dialog>

  <dialog class="sheet" bind:this={legDlg}>
    <div class="body stack">
      <h3>Send on — new shipment from {atWarehouse || 'this warehouse'}</h3>
      <p class="small muted">The goods were received into this warehouse's stock. Sending them on creates a new shipment with its own truck, driver and route; it takes the stock out here and posts it at the next warehouse when received.</p>
      <p class="caption">Goods received at {last ? lookup.checkpoint(last.toId)?.name : ''} are reloaded onto another truck. The new leg carries forward the good quantity received.</p>
      {#if legErr}<p class="error">{legErr}</p>{/if}
      <label class="field"><span>Route</span><select class="select" bind:value={nl.routeId}>{#each nextRoutes as rt}<option value={rt.id}>{rt.name}{rt.stops.at(-1)!.checkpointId === finalCp ? ' — to final destination' : ''}</option>{:else}<option value="">No route starts here</option>{/each}</select></label>
      <label class="field"><span>Truck</span><select class="select" bind:value={nl.truckId} onchange={() => (nl.driverId = lookup.truck(nl.truckId)?.defaultDriverId ?? nl.driverId)}>{#each r.trucks as t}<option value={t.id} disabled={busyTrucks.has(t.id) || tooSmall(t.id)}>{t.reg} · {lookup.provider(t.providerId)?.name} · {t.capacityCases} cases{busyTrucks.has(t.id) ? ' (on the road)' : tooSmall(t.id) ? ' (too small)' : ''}</option>{/each}</select><span class="help">This leg carries {carry} cases.</span></label>
      <label class="field"><span>Driver</span><select class="select" bind:value={nl.driverId}>{#each r.drivers as d}<option value={d.id}>{d.name}</option>{/each}</select></label>
      <div class="row" style="justify-content:flex-end"><button class="btn btn-ghost" onclick={() => legDlg?.close()}>Cancel</button><button class="btn btn-primary" onclick={addLeg}>Create shipment</button></div>
    </div>
  </dialog>
  <dialog class="sheet" bind:this={apDlg} aria-labelledby="ap-t">
    <form class="body stack" onsubmit={saveAgreed}>
      <div><h3 id="ap-t">Agreed transport price · {sh.ref}</h3><div class="caption">{lookup.truck(sh.legs[0]?.truckId ?? '')?.reg} · agreed with the transporter after loading; it becomes the trip's transport cost.</div></div>
      <label class="field"><span>Agreed price</span><span class="row"><select class="select" style="width:90px" bind:value={apCur} aria-label="Currency">{#each ['USD', 'KES', 'UGX', 'TZS', 'RWF'] as c}<option>{c}</option>{/each}</select><input class="input num" type="number" min="0" step="0.01" bind:value={apAmount} aria-label="Agreed price" /></span></label>
      {#if apErr}<p class="error" role="alert">{apErr}</p>{/if}
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn btn-ghost" onclick={() => apDlg?.close()}>Cancel</button><button class="btn btn-primary">Record price</button></div>
    </form>
  </dialog>
{/if}

<style>
  .journey { margin-bottom: var(--space-4); }
  .steps { list-style: none; margin: 0; padding: 0 var(--space-1); }
  .steps li { position: relative; display: flex; gap: var(--space-3); padding: 0 0 var(--space-3) var(--space-1); }
  .steps li::before { content: ""; position: absolute; left: 10px; top: 14px; bottom: 0; width: 2px; background: var(--border); }
  .steps li:last-child::before { display: none; }
  .steps .dot { width: 14px; height: 14px; margin-top: 3px; border-radius: 50%; background: var(--surface); border: 2px solid var(--border-strong); flex: none; z-index: 1; }
  .steps li.end .dot { background: var(--primary); border-color: var(--primary); }
  .steps li.current .dot { background: var(--accent); border-color: var(--accent); }
  .steps li.current > .grow { background: var(--primary-subtle); border-radius: var(--radius-md); padding: var(--space-1) var(--space-2); margin: calc(-1 * var(--space-1)) 0; }
  .loss { color: var(--danger); }
  .note { margin: var(--space-2) 0 0; padding: var(--space-2) var(--space-3); background: var(--info-subtle); color: var(--info); border-radius: var(--radius-md); }
  .chip { border: 0; cursor: pointer; }
  .alert { display: flex; gap: var(--space-3); align-items: flex-start; padding: var(--space-3) var(--space-4); border-radius: var(--radius-md); margin-bottom: var(--space-4); font-size: var(--fs-body); }
  .alert.danger { background: var(--danger-subtle); color: var(--danger); }
  .alert.warning { background: var(--warning-subtle); color: var(--warning); }
  .alert.info { background: var(--info-subtle); color: var(--info); }
  .alert :global(svg) { flex: none; margin-top: 1px; }
  .btn.wrap { white-space: normal; height: auto; min-height: var(--control-md); padding-top: var(--space-2); padding-bottom: var(--space-2); line-height: 1.25; text-align: center; }
  .leg-grid { display: grid; grid-template-columns: 1fr 300px; gap: var(--space-6); }
  @media (max-width: 900px) { .leg-grid { grid-template-columns: 1fr; } }
</style>
