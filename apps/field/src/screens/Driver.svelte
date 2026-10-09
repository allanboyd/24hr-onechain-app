<script lang="ts">
  // Driver (MA-02, TR-01, §17.5): map + one sheet + one action. Slide to check in at the next checkpoint,
  // 5-second undo, "Problem" in two taps, border-wait timer. Geofence events from the native layer check in automatically.
  import { field, type Checkpoint, type Leg, type LegView, type User } from '@btw/api';
  import { outbox, type OutboxState } from '@btw/api/outbox';
  import { Badge, fmtDateTime, fmtTime, hoursLabel, say, ago } from '@btw/ui';
  import { untrack } from 'svelte';
  import { startTracking, stopTracking, haptic } from '../native';
  import { cases, since } from '../lib';
  import MapView, { type MapPoint } from '../components/MapView.svelte';
  import Sheet from '../components/Sheet.svelte';
  import { live } from '../live';
  import TopBar from '../components/TopBar.svelte';
  import SlideToConfirm from '../components/SlideToConfirm.svelte';
  import MenuSheet from '../components/MenuSheet.svelte';
  import Shield from '@lucide/svelte/icons/shield';
  import MapPin from '@lucide/svelte/icons/map-pin';
  import Triangle from '@lucide/svelte/icons/triangle-alert';
  import Undo from '@lucide/svelte/icons/undo-2';
  import Wrench from '@lucide/svelte/icons/wrench';
  import FileText from '@lucide/svelte/icons/file-text';
  import Siren from '@lucide/svelte/icons/siren';
  import Scale from '@lucide/svelte/icons/scale';
  import Clock from '@lucide/svelte/icons/clock';
  let { user, onlogout }: { user: User; onlogout: () => void } = $props();

  const UNDO_SECONDS = 5;
  let driver = $state<LegView['driver'] | null>(null);
  let trips = $state<LegView[] | null>(null);
  let sync = $state<OutboxState>({ online: true, pending: [], syncing: false });
  let now = $state(Date.now());
  let menu = $state(false);
  let problem = $state<null | { reason: string; note: string; due: string }>(null);
  let sheetEl = $state<HTMLElement>();
  let sheetH = $state(300);
  let pendingCheck = $state<{ kind: 'arrived' | 'departed'; checkpointId: string; left: number } | null>(null);
  let timer: ReturnType<typeof setInterval> | undefined;

  // One call returns the driver's working set (trips with route, checkpoints + SMS codes, truck, ETA) — cached offline later.
  async function load() { const w = await field.driver(); driver = w.driver; trips = w.trips; }
  $effect(() => live(load));
  $effect(() => outbox.subscribe((s) => (sync = s)));
  $effect(() => { const t = setInterval(() => (now = Date.now()), 30_000); return () => { clearInterval(t); clearInterval(timer); }; });
  $effect(() => { if (!sheetEl) return; const ro = new ResizeObserver(() => (sheetH = sheetEl!.offsetHeight)); ro.observe(sheetEl); return () => ro.disconnect(); });

  const current = $derived(trips?.find((t) => !['Loaded', 'Planned'].includes(t.leg.status)) ?? trips?.[0]);
  // Optimistic: show queued check-ins immediately, even with no signal.
  const leg = $derived.by(() => {
    if (!current) return null;
    const l = structuredClone($state.snapshot(current.leg)) as Leg;
    for (const it of sync.pending) {
      const p = it.payload as { legId: string; checkpointId: string; kind: 'arrived' | 'departed'; issueId?: string };
      if (p.legId !== l.id) continue;
      if (it.op === 'issue.fix') { const iss = l.issues.find((x) => x.id === p.issueId); if (iss) iss.fixedAt = it.createdAt; continue; }
      if (it.op !== 'leg.pass') continue;
      const pass = l.passes.find((x) => x.checkpointId === p.checkpointId);
      if (!pass) continue;
      if (p.kind === 'arrived') pass.arrivedAt = it.createdAt; else { pass.departedAt = it.createdAt; pass.arrivedAt ??= it.createdAt; }
    }
    return l;
  });
  const idx = $derived(leg ? leg.passes.findIndex((p) => !p.departedAt) : -1);
  const pass = $derived(leg && idx >= 0 ? leg.passes[idx] : null);
  const cps = $derived(new Map<string, Checkpoint>((current?.checkpoints ?? []).map((c) => [c.id, c])));
  const cpShort = (id?: string) => (id ? (cps.get(id)?.name ?? id).replace(/\s*\(.*\)$/, '') : '—');
  const cp = $derived(pass ? cps.get(pass.checkpointId) ?? null : null);
  const atDestination = $derived(!!leg && !!pass && pass.checkpointId === leg.toId && !!pass.arrivedAt);
  const starting = $derived(!!leg && idx === 0 && !leg.passes[0].departedAt);
  const action = $derived.by(() => {
    if (!pass || atDestination) return null;
    if (starting) return { kind: 'departed' as const, label: `Start trip · leaving ${cpShort(pass.checkpointId)}` };
    return pass.arrivedAt ? { kind: 'departed' as const, label: `I'm leaving ${cpShort(pass.checkpointId)}` } : { kind: 'arrived' as const, label: `I've arrived at ${cpShort(pass.checkpointId)}` };
  });
  const wait = $derived.by(() => {
    if (!leg || !pass?.arrivedAt || atDestination || starting) return null;
    const stop = current?.route?.stops[idx];
    const h = Math.max(0, (now - Date.parse(pass.arrivedAt)) / 36e5);
    return { hours: h, planned: stop?.plannedDwellHours ?? 0, over: h > (stop?.plannedDwellHours ?? 0) + 2 };
  });
  const eta = $derived(current?.eta ?? null);
  const truck = $derived(current?.truck ?? null);
  const openIssue = $derived(leg?.issues.find((i) => !i.fixedAt) ?? null);
  const queued = $derived(sync.pending.filter((it) => (it.payload as { legId?: string })?.legId === leg?.id).length);

  // Map: route through every checkpoint, passed = green, next = orange; truck at last GPS ping or last checkpoint.
  const points = $derived<MapPoint[]>(leg ? leg.passes.map((p, i) => {
    const c = cps.get(p.checkpointId)!;
    return { id: c.id, lat: c.lat, lng: c.lng, label: cpShort(c.id), state: p.departedAt || (p.arrivedAt && i < idx) ? 'done' : i === idx ? 'next' : 'todo', border: c.kind === 'border' };
  }) : []);
  // Truck = the newest of its last GPS ping and its last check-in.
  const truckPos = $derived.by(() => {
    if (!leg || !truck) return [];
    let k = -1, t = 0;
    leg.passes.forEach((p, i) => { const at = Date.parse(p.departedAt ?? p.arrivedAt ?? ''); if (p.arrivedAt && at >= t) { k = i; t = at; } });
    const ping = leg.lastPing && (k < 0 || Date.parse(leg.lastPing.at) > t) ? leg.lastPing : null;
    const c = cps.get(leg.passes[Math.max(0, k)].checkpointId)!;
    return [{ id: truck.id, lat: ping?.lat ?? c.lat, lng: ping?.lng ?? c.lng, label: truck.reg, late: eta?.state === 'Late' }];
  });

  // Native geofencing: the next few checkpoints check in automatically (no undo window, source 'geofence').
  // Restart only when the trip or the next checkpoint changes (not on every redraw).
  const trackKey = $derived(leg && idx >= 0 ? `${leg.id}:${idx}` : '');
  $effect(() => {
    if (!trackKey) return;
    untrack(() => {
      const l = leg!;
      const next = l.passes.slice(idx, idx + 3).map((p) => cps.get(p.checkpointId)!).map((c) => ({ id: c.id, lat: c.lat, lng: c.lng, radiusM: c.radiusM }));
      startTracking({ legId: l.id, nextCheckpoints: next }, (e) => {
        const p = pass;
        if ((e.type !== 'enter' && e.type !== 'exit') || !p || e.checkpointId !== p.checkpointId) return;
        if (e.type === 'enter' && !p.arrivedAt) send('arrived', 'geofence', p.checkpointId);
        if (e.type === 'exit' && p.arrivedAt && !p.departedAt) send('departed', 'geofence', p.checkpointId);
      });
    });
    return () => { stopTracking(); };
  });

  function slide() {
    if (!action || !pass) return;
    pendingCheck = { kind: action.kind, checkpointId: pass.checkpointId, left: UNDO_SECONDS };
    clearInterval(timer);
    timer = setInterval(() => {
      if (!pendingCheck) return clearInterval(timer);
      pendingCheck.left -= 1;
      if (pendingCheck.left <= 0) { const p = pendingCheck; pendingCheck = null; clearInterval(timer); send(p.kind, 'driver', p.checkpointId); }
    }, 1000);
  }
  function undo() { clearInterval(timer); pendingCheck = null; haptic('tap'); say('Cancelled — nothing was recorded'); }
  async function send(kind: 'arrived' | 'departed', source: 'driver' | 'geofence', checkpointId: string) {
    if (!leg) return;
    try {
      const r = await outbox.send('leg.pass', { legId: leg.id, checkpointId, kind, source });
      say(r.queued ? 'Saved on the phone — sends when there is signal' : kind === 'arrived' ? `Arrived at ${cpShort(checkpointId)}` : 'On the road — safe journey');
    } catch (e) { say((e as Error).message); }
  }
  async function sendProblem() {
    if (!leg || !problem) return;
    const issue = { at: new Date().toISOString(), checkpointId: pass?.checkpointId, place: cpShort(pass?.checkpointId), reason: problem.note.trim() ? `${problem.reason} — ${problem.note.trim()}` : problem.reason, newDueDate: problem.due ? new Date(problem.due).toISOString() : undefined };
    const r = await outbox.send('leg.issue', { legId: leg.id, issue });
    problem = null; haptic('success');
    say(r.queued ? 'Saved — the office gets it when there is signal' : 'Sent — the office has been told');
  }
  async function moving() {
    if (!leg || !openIssue) return;
    const r = await outbox.send('issue.fix', { legId: leg.id, issueId: openIssue.id });
    haptic('success'); say(r.queued ? 'Saved — the office hears when there is signal' : 'Moving again — the office has been told');
  }
  const REASONS = [
    { reason: 'Breakdown', icon: Wrench },
    { reason: 'Border / documents', icon: FileText },
    { reason: 'Police or weighbridge', icon: Scale },
    { reason: 'Accident', icon: Siren },
  ];
  const smsHelp = $derived(pass && truck ? `${action?.kind === 'departed' ? 'DEP' : 'ARR'} ${cps.get(pass.checkpointId)?.code ?? cpShort(pass.checkpointId).split(' ')[0].toUpperCase()} ${truck.reg.replace(/\s/g, '')}` : '');
</script>

<MapView {points} route={points.map((p) => [p.lat, p.lng] as [number, number])} trucks={truckPos} padBottom={sheetH} />
<TopBar onmenu={() => (menu = true)} />

<Sheet bind:el={sheetEl}>
  {#if !trips}
    <div class="skeleton" style="height:24px;width:60%"></div><div class="skeleton" style="height:64px"></div>
  {:else if !driver}
    <p class="headline">Phone not linked</p>
    <p class="subline">This account isn't linked to a driver yet. Ask the office to add your phone number to your driver record.</p>
  {:else if !current || !leg}
    <p class="eyebrow">No trip right now</p>
    <p class="headline">You're all clear</p>
    <p class="subline">When a truck is loaded for you, the trip appears here and your phone buzzes.</p>
  {:else}
    <div class="trip">
      <div class="grow">
        <p class="eyebrow">{truck?.reg} · {current.route?.name}</p>
        {#if atDestination}<p class="headline">Arrived at {cpShort(leg.toId)}</p>
        {:else}<p class="headline">{starting ? 'Ready to go' : pass?.arrivedAt ? `At ${cpShort(pass.checkpointId)}` : `Next: ${cpShort(pass?.checkpointId)}`}</p>{/if}
      </div>
      {#if eta && !atDestination}<div class="eta"><Badge status={eta.state}>{eta.state}{eta.state !== 'On time' ? ` ${hoursLabel(eta.hours)}` : ''}</Badge><span class="caption">ETA {fmtDateTime(eta.eta)}</span></div>{/if}
    </div>

    {#if wait}
      <div class="note" class:over={wait.over}>
        {#if cp?.kind === 'border'}<Shield size={18} />{:else}<Clock size={18} />{/if}
        <span>{cp?.kind === 'border' ? 'Waiting at the border' : 'Stopped here'} <strong>{since(wait.hours)}</strong>{#if wait.planned} · usually {hoursLabel(wait.planned)}{/if}</span>
      </div>
    {:else if pass && !pass.arrivedAt && !starting}
      <div class="note"><MapPin size={18} /><span>Expected {fmtTime(pass.plannedAt)} · {cases(leg.lines.reduce((a, l) => a + l.loadedQty, 0))} on board</span></div>
    {/if}

    {#if openIssue}
      <div class="note issue"><Triangle size={18} /><span class="grow">Problem reported: {openIssue.reason} · {ago(openIssue.at)}</span></div>
      <button class="btn btn-primary btn-lg btn-block" onclick={moving}>Fixed — moving again</button>
    {:else if pendingCheck}
      <div class="undo" role="status" aria-live="polite">
        <div class="bar"><span style="width:{(pendingCheck.left / UNDO_SECONDS) * 100}%"></span></div>
        <p><strong>{pendingCheck.kind === 'arrived' ? 'Arrived at' : 'Leaving'} {cpShort(pendingCheck.checkpointId)}</strong> · sending in {pendingCheck.left} s</p>
        <button class="btn btn-secondary btn-lg btn-block" onclick={undo}><Undo size={20} />Undo</button>
      </div>
    {:else if action}
      <SlideToConfirm label={action.label} onconfirm={slide} />
    {:else if atDestination}
      <p class="subline">The receiver counts the cargo and signs. You'll get a buzz when the delivery is accepted.</p>
    {/if}

    {#if !openIssue}
      <div class="row-actions">
        <button class="text-btn danger" onclick={() => (problem = { reason: atDestination ? 'Waiting to offload' : '', note: '', due: '' })}><Triangle size={16} /> {atDestination ? 'Waiting to offload?' : 'Problem'}</button>
        {#if queued}<span class="caption">{queued} saved on phone</span>{/if}
      </div>
    {/if}
  {/if}
</Sheet>

{#if problem}
  <Sheet modal title="What's the problem?" onclose={() => (problem = null)}>
    <div class="reasons">
      {#each atDestination ? [{ reason: 'Waiting to offload', icon: Clock }, ...REASONS] : REASONS as r}
        {@const Icon = r.icon}
        <button class="reason" aria-pressed={problem.reason === r.reason} onclick={() => (problem!.reason = r.reason)}><Icon size={26} /><span>{r.reason}</span></button>
      {/each}
    </div>
    <label class="field"><span>Anything to add? (optional)</span><input class="input" bind:value={problem.note} placeholder="e.g. waiting for a mechanic" /></label>
    <label class="field"><span>New arrival time, if you know (optional)</span><input class="input" type="datetime-local" bind:value={problem.due} /></label>
    <button class="btn btn-primary btn-lg btn-block" disabled={!problem.reason} onclick={sendProblem}>Tell the office</button>
  </Sheet>
{/if}

{#if menu}<MenuSheet {user} {onlogout} {smsHelp} onclose={() => (menu = false)} />{/if}

<style>
  .headline { text-wrap: balance; }
  .trip { display: flex; align-items: flex-start; gap: var(--space-3); }
  .grow { flex: 1; min-width: 0; }
  .eta { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; text-align: right; flex: none; }
  .note { display: flex; align-items: center; gap: var(--space-2); padding: 10px 12px; border-radius: var(--radius-md); background: var(--surface-sunken); color: var(--text); font-size: 15px; }
  .note.over { background: var(--danger-subtle); color: var(--danger); }
  .note.issue { background: var(--warning-subtle); color: var(--warning); }
  .undo { display: flex; flex-direction: column; gap: var(--space-2); }
  .undo p { margin: 0; }
  .bar { height: 6px; border-radius: 3px; background: var(--surface-sunken); overflow: hidden; }
  .bar span { display: block; height: 100%; background: var(--accent); transition: width 1s linear; }
  .row-actions { display: flex; align-items: center; justify-content: space-between; }
  .text-btn { display: inline-flex; align-items: center; gap: 6px; }
  .reasons { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); }
  .reason { min-height: 96px; border-radius: var(--radius-lg); border: 2px solid var(--border); background: var(--surface); color: var(--text); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; font: 600 15px var(--ff-body); cursor: pointer; text-align: center; padding: 8px; }
  .reason[aria-pressed='true'] { border-color: var(--accent); background: var(--accent-subtle); }
</style>
