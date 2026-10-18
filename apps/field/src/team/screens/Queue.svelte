<script lang="ts">
  // Loading queue (truck planner): the trucks waiting at each of your loading points, first in line on top.
  // Big up / down buttons reorder (the loader is told), "Remove" asks why, "Add truck" queues a known truck.
  import { untrack } from 'svelte';
  import { loading, lookup, queue, ref, type User, type WaitingEntry } from '@btw/api';
  import { QUEUE_REMOVE_REASONS, seesLoadingPoint } from '@btw/api/rules';
  import { waitLabel } from '@btw/api/trucks';
  import { say } from '@btw/ui';
  import ArrowUp from '@lucide/svelte/icons/arrow-up';
  import ArrowDown from '@lucide/svelte/icons/arrow-down';
  import X from '@lucide/svelte/icons/x';
  import Plus from '@lucide/svelte/icons/plus';
  import Clock from '@lucide/svelte/icons/clock';
  import { canQueue } from '../access';
  import { co } from '../company.svelte';
  import { Res, onRefresh } from '../load.svelte';
  import Chips from '../components/Chips.svelte';
  import Skeleton from '../components/Skeleton.svelte';
  import Empty from '../components/Empty.svelte';
  import ErrorNote from '../components/ErrorNote.svelte';
  import type { View } from '../routes';
  let { user, query }: { user: User; view: View; query: URLSearchParams } = $props();

  const r = new Res(() => loading.waiting());
  $effect(() => r.live(20_000));
  $effect(() => onRefresh(() => r.reload()));
  const points = $derived(ref().suppliers.filter((s) => user.roles.some((x) => x === 'director' || x === 'admin') || seesLoadingPoint(user, s.id)));
  const waiting = $derived((r.data ?? []).filter((w) => w.status === 'Waiting'));
  let lp = $state(untrack(() => query.get('lp') ?? ''));
  $effect(() => { if (!lp && points.length) lp = (points.find((p) => waiting.some((w) => w.loadingPointId === p.id)) ?? points[0]).id; });
  const chips = $derived(points.map((p) => ({ id: p.id, label: `${p.code} ${p.city}`, count: waiting.filter((w) => w.loadingPointId === p.id).length })));
  const list = $derived(waiting.filter((w) => w.loadingPointId === lp).sort((a, b) => a.position - b.position));
  const hours = (w: WaitingEntry) => Math.max(0, (Date.now() - Date.parse(w.arrivedAt)) / 36e5);
  const editable = $derived(canQueue(user) && co.active !== null);
  let busy = $state<string | null>(null);
  async function move(w: WaitingEntry, dir: -1 | 1) {
    busy = w.id;
    try { await queue.move(w.id, dir); await r.reload(); say(`${lookup.truck(w.truckId)?.reg} moved ${dir < 0 ? 'up' : 'down'} · the loader is told`); }
    catch (e) { say((e as Error).message); } finally { busy = null; }
  }
  async function toFront(w: WaitingEntry) {
    busy = w.id;
    try { await queue.moveTo(w.id, 1); await r.reload(); say(`${lookup.truck(w.truckId)?.reg} is next to load`); } catch (e) { say((e as Error).message); } finally { busy = null; }
  }

  // remove with a reason
  let rm = $state<WaitingEntry | null>(null); let reason = $state<string>(QUEUE_REMOVE_REASONS[0]); let note = $state('');
  async function confirmRemove() {
    const why = reason === 'Other' ? note.trim() : `${reason}${note.trim() ? ` — ${note.trim()}` : ''}`;
    if (!why) { say('Say why the truck leaves the queue'); return; }
    try { await queue.remove(rm!.id, why.slice(0, 200)); rm = null; await r.reload(); say('Removed · the loader sees why'); } catch (e) { say((e as Error).message); }
  }

  // add a known truck
  let adding = $state(false); let truckId = $state(''); let driverId = $state('');
  const queued = $derived(new Set(waiting.map((w) => w.truckId)));
  const free = $derived(ref().trucks.filter((t) => t.active !== false && ref().providers.find((p) => p.id === t.providerId)?.active !== false && !queued.has(t.id)));
  function openAdd() { const t = free[0]; truckId = t?.id ?? ''; driverId = t?.defaultDriverId ?? ref().drivers[0]?.id ?? ''; adding = true; }
  async function add() {
    try { await loading.addWaiting(lp, truckId, driverId); adding = false; await r.reload(); say(`${lookup.truck(truckId)?.reg} joins the end of the queue`); } catch (e) { say((e as Error).message); }
  }
</script>

<Chips options={chips} bind:value={lp} label="Loading point" />
<ErrorNote error={r.error} onretry={() => r.reload()} />
{#if co.active === null && canQueue(user)}<p class="t-hint">Pick one company (top right) to change a queue — the Group view only reads.</p>{/if}
{#if r.loading}
  <Skeleton rows={5} />
{:else if list.length}
  <div class="t-list">
    {#each list as w, i (w.id)}
      {@const t = lookup.truck(w.truckId)}
      {@const h = hours(w)}
      <div class="t-item q" class:long={h > 24}>
        <span class="pos" aria-label="Position {i + 1}">{i + 1}</span>
        <span class="t-main">
          <span class="t-line1" style="white-space: nowrap">{t?.reg ?? '—'}</span>
          <span class="t-meta t-ellipsis">{#if t?.trailer}{t.trailer} · {/if}{lookup.provider(t?.providerId ?? '')?.name ?? ''} · {lookup.driver(w.driverId)?.name ?? ''}</span>
          <span class="t-meta wait"><Clock size={14} />waiting {waitLabel(h)}{h > 24 ? ' · long wait' : ''}</span>
        </span>
        {#if editable}
          <span class="btns">
            <button class="big" aria-label="Move {t?.reg} up" disabled={i === 0 || busy === w.id} onclick={() => move(w, -1)}><ArrowUp size={26} /></button>
            <button class="big" aria-label="Move {t?.reg} down" disabled={i === list.length - 1 || busy === w.id} onclick={() => move(w, 1)}><ArrowDown size={26} /></button>
          </span>
        {/if}
      </div>
      {#if editable}
        <div class="sub">
          {#if i > 0}<button class="link" onclick={() => toFront(w)} disabled={busy === w.id}>Load next</button>{/if}
          <button class="link danger" onclick={() => { rm = w; reason = QUEUE_REMOVE_REASONS[0]; note = ''; }}><X size={14} />Remove</button>
        </div>
      {/if}
    {/each}
  </div>
{:else}
  <Empty title="No trucks waiting" text="When a truck arrives at {lookup.supplier(lp)?.code ?? 'the loading point'} it joins this queue." />
{/if}

{#if editable && lp}<button class="t-fab" onclick={openAdd}><Plus size={22} />Add truck</button>{/if}

{#if rm}
  <div class="sheet-bg" role="presentation" onclick={() => (rm = null)}></div>
  <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="rm-h">
    <h3 id="rm-h">Remove {lookup.truck(rm.truckId)?.reg}?</h3>
    <p class="t-meta">The loader at {lookup.supplier(rm.loadingPointId)?.code} sees the reason.</p>
    <div class="reasons">{#each QUEUE_REMOVE_REASONS as x}<button class:on={reason === x} onclick={() => (reason = x)}>{x}</button>{/each}</div>
    <input class="input" bind:value={note} maxlength="150" placeholder={reason === 'Other' ? 'What happened?' : 'Note (optional)'} aria-label="Note" />
    <div class="t-actions"><button class="btn btn-secondary btn-lg" onclick={() => (rm = null)}>Cancel</button><button class="btn btn-danger btn-lg" onclick={confirmRemove}>Remove</button></div>
  </div>
{/if}

{#if adding}
  <div class="sheet-bg" role="presentation" onclick={() => (adding = false)}></div>
  <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="add-h">
    <h3 id="add-h">Add a truck to {lookup.supplier(lp)?.code} {lookup.supplier(lp)?.city}</h3>
    <label class="field"><span>Truck</span><select class="select" bind:value={truckId} onchange={() => (driverId = lookup.truck(truckId)?.defaultDriverId ?? driverId)}>{#each free as t (t.id)}<option value={t.id}>{t.reg} · {lookup.provider(t.providerId)?.name}</option>{/each}</select></label>
    <label class="field"><span>Driver</span><select class="select" bind:value={driverId}>{#each ref().drivers.filter((d) => d.active !== false) as d (d.id)}<option value={d.id}>{d.name}</option>{/each}</select></label>
    <p class="t-meta">New provider or truck? Add it in the web app (Master data → Providers & trucks) first.</p>
    <div class="t-actions"><button class="btn btn-secondary btn-lg" onclick={() => (adding = false)}>Cancel</button><button class="btn btn-primary btn-lg" disabled={!truckId || !driverId} onclick={add}>Add to queue</button></div>
  </div>
{/if}

<style>
  .q { cursor: default; padding: 12px; }
  .q.long { border-color: var(--warning); }
  .pos { width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; flex: none; background: var(--primary-subtle, var(--surface-sunken)); color: var(--primary, var(--text)); font: 800 20px var(--ff-display); }
  .wait { display: inline-flex; align-items: center; gap: 4px; }
  .q.long .wait { color: var(--warning); font-weight: 600; }
  .btns { display: flex; gap: 6px; flex: none; }
  .big { width: 56px; height: 56px; border-radius: 16px; border: 1px solid var(--t-line); background: var(--surface-sunken); color: var(--text); display: grid; place-items: center; cursor: pointer; }
  .big:active { transform: scale(.94); }
  .big:disabled { opacity: .35; cursor: default; }
  .sub { display: flex; gap: 18px; justify-content: flex-end; margin: -4px 4px 4px; }
  .link { background: none; border: 0; color: var(--link); font: 600 14px var(--ff-body); padding: 6px 0; min-height: 36px; display: inline-flex; align-items: center; gap: 4px; cursor: pointer; }
  .link.danger { color: var(--danger); }
  .sheet-bg { position: fixed; inset: 0; background: rgb(0 0 0 / .4); z-index: 40; }
  .sheet { position: fixed; left: 0; right: 0; bottom: 0; z-index: 41; background: var(--surface); border-radius: 22px 22px 0 0; padding: 20px 16px calc(env(safe-area-inset-bottom) + 20px); display: flex; flex-direction: column; gap: 12px; max-width: 720px; margin: 0 auto; box-shadow: var(--elevation-3); }
  .sheet h3 { margin: 0; font: 700 20px var(--ff-display); }
  .reasons { display: flex; flex-wrap: wrap; gap: 8px; }
  .reasons button { height: 40px; padding: 0 14px; border-radius: 20px; border: 1px solid var(--t-line); background: var(--t-card); color: var(--text); font: 600 14px var(--ff-body); cursor: pointer; }
  .reasons button.on { background: var(--text); color: var(--bg); border-color: var(--text); }
  .field { display: flex; flex-direction: column; gap: 4px; font-size: 14px; color: var(--text-muted); }
  .select, .input { height: 48px; font-size: 16px; }
</style>
