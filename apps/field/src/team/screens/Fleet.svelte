<script lang="ts">
  // Truck desk (team app): every truck by state — on the road, delayed, at a border, loading, waiting, arrived, idle —
  // as a list or on the map; tap → truck. "Providers" shows what each transporter is owed.
  import { untrack } from 'svelte';
  import type { User } from '@btw/api';
  import { Badge } from '@btw/ui';
  import { ON_ROAD, TRUCK_STATES, costsByProvider, waitLabel, type TruckRow } from '@btw/api/trucks';
  import { ref } from '@btw/api';
  import Search from '@lucide/svelte/icons/search';
  import TruckIcon from '@lucide/svelte/icons/truck';
  import MapIcon from '@lucide/svelte/icons/map';
  import List from '@lucide/svelte/icons/list';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import CompanyDot from '../../components/CompanyDot.svelte';
  import { canTransport } from '../access';
  import { co } from '../company.svelte';
  import { loadDesk } from '../desk';
  import { Res, onRefresh } from '../load.svelte';
  import { usd, num } from '../fmt';
  import Chips from '../components/Chips.svelte';
  import Segmented from '../components/Segmented.svelte';
  import Meter from '../components/Meter.svelte';
  import Skeleton from '../components/Skeleton.svelte';
  import Empty from '../components/Empty.svelte';
  import ErrorNote from '../components/ErrorNote.svelte';
  import WebButton from '../components/WebButton.svelte';
  import type { View } from '../routes';
  let { user, query }: { user: User; view: View; query: URLSearchParams } = $props();

  const r = new Res(() => loadDesk(user));
  $effect(() => r.live());
  $effect(() => onRefresh(() => r.reload()));
  const q0 = untrack(() => ({ f: query.get('f') ?? 'road', seg: query.get('seg') === 'providers' ? 'providers' : 'trucks', map: query.get('view') === 'map' }));
  let seg = $state(q0.seg); let f = $state(q0.f); let q = $state(''); let mapView = $state(q0.map);
  const rows = $derived(r.data?.rows ?? []);
  const FILTERS: Record<string, (x: TruckRow) => boolean> = {
    road: (x) => ON_ROAD.includes(x.state), all: () => true,
    ...Object.fromEntries(TRUCK_STATES.map((s) => [s.state, (x: TruckRow) => x.state === s.state])),
  };
  const chips = $derived([
    { id: 'road', label: 'On the road', count: rows.filter(FILTERS.road).length },
    ...TRUCK_STATES.map((s) => ({ id: s.state, label: s.state === 'Waiting' ? 'In queue' : s.state === 'Arrived' ? 'Arrived' : s.label, count: rows.filter(FILTERS[s.state]).length })).filter((c) => c.count),
    { id: 'all', label: 'All', count: rows.length },
  ]);
  const list = $derived(rows.filter(FILTERS[f] ?? FILTERS.all).filter((x) => !q.trim() || `${x.truck.reg} ${x.provider?.name ?? ''} ${x.driver?.name ?? ''} ${x.where}`.toLowerCase().includes(q.trim().toLowerCase())));
  const tone = (s: string) => TRUCK_STATES.find((x) => x.state === s)?.tone ?? 'neutral';
  const pins = $derived(list.filter((x) => x.position).map((x) => ({ id: x.truck.id, lat: x.position!.lat, lng: x.position!.lng, label: x.truck.reg, late: x.state === 'Delayed' })));
  let MapView = $state<any>(null);
  $effect(() => { if (mapView && !MapView) import('../../components/MapView.svelte').then((m) => (MapView = m.default)); });
  const prov = $derived(r.data?.trips ? costsByProvider(r.data.trips, ref().trucks, ref().providers) : []);
</script>

{#if mapView && seg === 'trucks'}
  {#if MapView}<MapView trucks={pins} padBottom={260} />{/if}
  <div class="map-ui">
    <button class="toggle" onclick={() => (mapView = false)}><List size={18} />List</button>
    <div class="strip">
      {#each list.filter((x) => x.position) as x (x.truck.id)}
        <a class="mini t-press" href="#/fleet/{x.truck.id}"><span class="t-row between"><strong>{x.truck.reg}</strong><Badge tone={tone(x.state)}>{x.state}</Badge></span><span class="t-meta t-ellipsis">{x.where}</span>{#if x.issues.length}<span class="t-meta warn">{x.issues[0].reason}</span>{/if}</a>
      {:else}<div class="mini"><strong>No trucks here</strong></div>{/each}
    </div>
  </div>
{:else}
  <Segmented options={[{ id: 'trucks', label: 'Trucks' }, ...(r.data?.trips ? [{ id: 'providers', label: 'Providers & costs' }] : [])]} bind:value={seg} label="Truck desk view" />
  <ErrorNote error={r.error} onretry={() => r.reload()} />
  {#if seg === 'trucks'}
    <div class="t-row">
      <label class="t-search grow"><Search size={20} /><input type="search" placeholder="Truck, driver, provider, place" bind:value={q} aria-label="Search trucks" /></label>
      <button class="maptoggle t-press" onclick={() => (mapView = true)} aria-label="Show on map"><MapIcon size={22} /></button>
    </div>
    <Chips options={chips} bind:value={f} label="Truck state" />
    {#if r.loading}
      <Skeleton rows={6} />
    {:else if list.length}
      <div class="t-list">
        {#each list as x (x.truck.id)}
          <a class="t-item" href="#/fleet/{x.truck.id}">
            <span class="t-icon st-{x.state.replace(/\s/g, '')}"><TruckIcon size={22} /></span>
            <span class="t-main">
              <span class="t-line1">{#if co.active === null && x.entityId}<CompanyDot entityId={x.entityId} />{/if}<span class="t-ellipsis">{x.truck.reg}</span><Badge tone={tone(x.state)}>{x.state === 'Waiting' ? `#${x.queuePosition} in queue` : x.state}</Badge></span>
              <span class="t-meta t-ellipsis">{x.where}</span>
              <span class="t-meta t-ellipsis">{x.provider?.name ?? ''}{x.driver ? ` · ${x.driver.name}` : ''}{x.state === 'Waiting' ? ` · ${waitLabel(x.waitingHours)}` : x.daysSinceMove ? ` · moved ${x.daysSinceMove} d ago` : ''}</span>
              {#if x.issues.length}<span class="t-meta warn"><TriangleAlert size={14} />{x.issues[0].reason}</span>{/if}
            </span>
            <ChevronRight class="t-chev" size={20} />
          </a>
        {/each}
      </div>
    {:else}
      <Empty title={q ? 'No match' : 'No trucks here'} text={q ? 'Try another truck or driver.' : 'Nothing in this list right now.'} />
    {/if}
  {:else}
    {#if r.loading}<Skeleton rows={4} />
    {:else}
      <section class="t-card glance">
        <span class="t-meta">Transport owed to providers</span>
        <strong>{usd(r.data?.kpis.owed ?? 0)}</strong>
        <span class="t-meta">{r.data?.kpis.pending ? `${usd(r.data.kpis.pending)} waiting for a director` : 'agreed transport − payments made'}</span>
      </section>
      <div class="t-list">
        {#each prov as c (c.id)}
          <div class="t-card pc">
            <div class="t-row between"><strong class="t-ellipsis">{c.label}</strong><span class="t-amount" class:owed={c.balance > 0}>{usd(c.balance)}</span></div>
            <Meter value={c.paid} max={c.agreed} label="Paid of agreed transport for {c.label}" />
            <dl class="t-kv">
              <dt>Trips</dt><dd>{num(c.trips)}</dd>
              <dt>Agreed transport</dt><dd>{usd(c.agreed)}</dd>
              <dt>Extra costs</dt><dd>{usd(c.extras)}</dd>
              <dt>Paid</dt><dd>{usd(c.paid)}</dd>
              <dt>Trip cost per case</dt><dd>${c.perCase.toFixed(2)}</dd>
            </dl>
          </div>
        {:else}<Empty title="No trips yet" text="Costs appear once trucks are loaded." />{/each}
      </div>
    {/if}
  {/if}
  {#if canTransport(user)}
    <section class="t-card make">
      <strong>New transport provider, sacco or truck?</strong>
      <span class="t-meta">Onboarding forms work best on a computer.</span>
      <WebButton path="/master?tab=providers" label="Add provider or truck" />
    </section>
  {/if}
{/if}

<style>
  .grow { flex: 1; min-width: 0; }
  .maptoggle { width: 48px; height: 48px; border-radius: 14px; border: 1px solid var(--t-line); background: var(--t-card); color: var(--text); display: grid; place-items: center; box-shadow: var(--t-shadow); cursor: pointer; flex: none; }
  .t-icon.st-Delayed { background: var(--danger-subtle); color: var(--danger); }
  .t-icon.st-Atborder { background: var(--warning-subtle); color: var(--warning); }
  .t-icon.st-Intransit { background: var(--info-subtle); color: var(--info); }
  .t-icon.st-Arrived { background: var(--success-subtle); color: var(--success); }
  .t-icon.st-Loading { background: var(--accent-subtle, var(--surface-sunken)); color: var(--accent); }
  .warn { color: var(--danger); font-weight: 600; display: inline-flex; align-items: center; gap: 4px; }
  .glance { display: flex; flex-direction: column; gap: 4px; }
  .glance strong { font: 800 30px var(--ff-display); }
  .pc { display: flex; flex-direction: column; gap: 10px; }
  .owed { color: var(--danger); }
  .make { display: flex; flex-direction: column; gap: 6px; }
  .make :global(.btn) { margin-top: 6px; }
  .map-ui { position: fixed; left: 0; right: 0; bottom: calc(env(safe-area-inset-bottom) + var(--t-nav) + 12px); z-index: 5; display: flex; flex-direction: column; gap: 10px; pointer-events: none; }
  .map-ui > * { pointer-events: auto; }
  .toggle { align-self: flex-start; margin-left: 16px; height: 44px; padding: 0 16px; border-radius: 22px; border: 0; background: var(--surface); color: var(--text); box-shadow: var(--elevation-2); font: 700 15px var(--ff-body); display: inline-flex; align-items: center; gap: 8px; cursor: pointer; }
  .strip { display: flex; gap: 10px; overflow-x: auto; padding: 4px 16px 6px; scroll-snap-type: x mandatory; scrollbar-width: none; }
  .mini { flex: none; width: 250px; scroll-snap-align: start; display: flex; flex-direction: column; gap: 4px; padding: 12px 14px; border-radius: 18px; background: var(--surface); color: var(--text); text-decoration: none; box-shadow: var(--elevation-3); border: 1px solid var(--t-line); }
</style>
