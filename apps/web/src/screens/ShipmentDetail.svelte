<script lang="ts">
  import { watch } from '../lib/load.svelte';
  import ErrorState from '../components/ErrorState.svelte';
  import { lookup, ref, shipments, tracking, type Acknowledgement, type Leg, type Shipment, type User } from '@btw/api';
  import { Badge, CheckpointTimeline, fmtDateTime, fmtNum, hoursLabel, say } from '@btw/ui';
  import Plus from '@lucide/svelte/icons/plus';
  import AlertTriangle from '@lucide/svelte/icons/triangle-alert';
  import Clock from '@lucide/svelte/icons/clock';
  let { params, user }: { params: { id: string }; user: User } = $props();

  const r = ref();
  let sh = $state<Shipment | null>(null);
  let acks = $state<Record<string, Acknowledgement>>({});
  let poRef = $state('');
  async function load() {
    sh = await shipments.get(params.id);
    if (!sh) return;
    poRef = lookup.poRef(sh.poId);
    acks = Object.fromEntries((await tracking.acks(sh.id)).map((a) => [a.legId, a]));
  }
  const w = watch(load);

  const office = $derived(user.roles.some((x) => ['director', 'operations', 'fleet', 'admin', 'planner'].includes(x)));
  const finalCp = $derived(sh ? lookup.warehouse(sh.warehouseId)?.checkpointId : undefined);
  const last = $derived(sh?.legs.at(-1));
  const canAddLeg = $derived(!!last && last.status === 'Acknowledged' && last.toId !== finalCp);

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
    if (tooSmall(nl.truckId)) { legErr = `${lookup.truck(nl.truckId)?.reg} holds ${lookup.truck(nl.truckId)?.capacityCases} cases; this leg carries ${carry}. Pick a bigger truck.`; return; }
    await shipments.addLeg(sh!.id, nl.routeId, nl.truckId, nl.driverId); legDlg?.close(); say('Next leg planned'); }

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
      <div class="muted small">PO <a class="mono" href="#/pos/{sh.poId}">{poRef}</a> · Delivered to {lookup.company(sh.receivingCompanyId)?.name} · {lookup.warehouse(sh.warehouseId)?.name} · {sh.legs.length} leg{sh.legs.length > 1 ? 's' : ''}</div>
    </div>
    <div class="row">
      <a class="btn btn-secondary" href="#/finance">Trip costs & landing cost</a>
      {#if canAddLeg && office}<button class="btn btn-primary" onclick={openLeg}><Plus size={16} />Add next leg (transfer)</button>{/if}
    </div>
  </div>

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
            {#if office && (a || leg.status !== 'Acknowledged')}
              <div class="stack-sm">
                <div class="overline">Office actions</div>
                {#if a}<button class="btn {leg.status === 'Planned' || leg.status === 'Loaded' ? 'btn-primary' : 'btn-secondary'} btn-block wrap" onclick={() => act(leg, a)}>{a.label}</button>{/if}
                {#each transferPoints(leg) as tp}<button class="btn btn-secondary btn-block wrap" onclick={() => split(leg, tp.checkpointId)}>Unload & transfer at {lookup.checkpoint(tp.checkpointId)?.name}</button>{/each}
                {#if leg.status !== 'Acknowledged'}<button class="btn btn-ghost btn-block wrap" onclick={() => openIssue(leg)}><AlertTriangle size={16} />Log truck issue</button>{/if}
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
                    {#if !i.fixedAt && office}<button class="btn btn-ghost btn-sm" onclick={() => fix(leg, i.id)}>Mark fixed</button>{/if}
                  </div>
                {/each}
              </div>
            {/if}
            {#if acks[leg.id]}
              {@const k = acks[leg.id]}
              <div class="card {k.hasDiscrepancy ? 'flag-warning' : ''}" style="padding:var(--space-3)">
                <div class="row between"><span class="overline">Acknowledgement</span>{#if k.hasDiscrepancy}<Badge tone="warning">Discrepancy</Badge>{:else}<Badge tone="success">Clean</Badge>{/if}</div>
                <div class="small">{k.receiverName} · {fmtDateTime(k.at)}</div>
                <div class="caption">{lookup.warehouse(k.warehouseId)?.name}{k.signature ? ' · signed' : ''}{k.photos.length ? ` · ${k.photos.length} photo(s)` : ''}</div>
                {#each k.lines.filter((x) => x.remarks) as x}<div class="caption">“{x.remarks}”</div>{/each}
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
      <h3>Add next leg (transfer)</h3>
      <p class="caption">Goods received at {last ? lookup.checkpoint(last.toId)?.name : ''} are reloaded onto another truck. The new leg carries forward the good quantity received.</p>
      {#if legErr}<p class="error">{legErr}</p>{/if}
      <label class="field"><span>Route</span><select class="select" bind:value={nl.routeId}>{#each nextRoutes as rt}<option value={rt.id}>{rt.name}{rt.stops.at(-1)!.checkpointId === finalCp ? ' — to final destination' : ''}</option>{:else}<option value="">No route starts here</option>{/each}</select></label>
      <label class="field"><span>Truck</span><select class="select" bind:value={nl.truckId} onchange={() => (nl.driverId = lookup.truck(nl.truckId)?.defaultDriverId ?? nl.driverId)}>{#each r.trucks as t}<option value={t.id} disabled={busyTrucks.has(t.id) || tooSmall(t.id)}>{t.reg} · {lookup.provider(t.providerId)?.name} · {t.capacityCases} cases{busyTrucks.has(t.id) ? ' (on the road)' : tooSmall(t.id) ? ' (too small)' : ''}</option>{/each}</select><span class="help">This leg carries {carry} cases.</span></label>
      <label class="field"><span>Driver</span><select class="select" bind:value={nl.driverId}>{#each r.drivers as d}<option value={d.id}>{d.name}</option>{/each}</select></label>
      <div class="row" style="justify-content:flex-end"><button class="btn btn-ghost" onclick={() => legDlg?.close()}>Cancel</button><button class="btn btn-primary" onclick={addLeg}>Plan leg</button></div>
    </div>
  </dialog>
{/if}

<style>
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
