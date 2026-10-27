<script lang="ts">
  // Drill-down behind every home tile / row (#/glance/<key>?…): ONE list per screen, grouped, status chips with icon +
  // words, every row opens its record (order, shipment, truck, trip payments). Data = the person's own scope (API).
  import { finance, type TransportFeeRow, type User } from '@btw/api';
  import { can } from '../access';
  import { loadDesk, type Desk } from '../desk';
  import { Res, onRefresh } from '../load.svelte';
  import { agreedList, ageingList, directorExceptions, driversList, feesList, fleetList, gapsList, issuesList, loadDirector, loadPlanner, pipelineList, profitList, type DirectorData, type GList, type PlannerData } from '../glance';
  import RowItem from '../components/RowItem.svelte';
  import X from '@lucide/svelte/icons/x';
  import Skeleton from '../components/Skeleton.svelte';
  import Empty from '../components/Empty.svelte';
  import ErrorNote from '../components/ErrorNote.svelte';
  import SyncLine from '../components/SyncLine.svelte';
  import type { View } from '../routes';
  let { user, view, query }: { user: User; view: View; query: URLSearchParams } = $props();

  const key = $derived('id' in view ? view.id ?? '' : '');
  type Raw = { kind: 'director'; d: DirectorData } | { kind: 'planner'; d: PlannerData } | { kind: 'desk'; d: Desk } | { kind: 'fees'; d: TransportFeeRow[] } | { kind: 'none' };
  const FEES = ['fees', 'agreed'], PLANNER = ['pipeline', 'gaps', 'ageing'], DESK = ['fleet', 'issues', 'drivers'], DIRECTOR = ['exceptions', 'profit'];
  const r = new Res<Raw>(async () => {
    const k = key;
    if (FEES.includes(k)) { if (!can(user, 'transport-fees')) return { kind: 'none' }; return { kind: 'fees', d: await finance.fees() }; }
    if (PLANNER.includes(k)) return { kind: 'planner', d: await loadPlanner(user) };
    if (DESK.includes(k)) { if (!can(user, 'trucks')) return { kind: 'none' }; return { kind: 'desk', d: await loadDesk(user) }; }
    if (DIRECTOR.includes(k)) return { kind: 'director', d: await loadDirector(user) };
    return { kind: 'none' };
  });
  $effect(() => r.live(60_000));
  $effect(() => onRefresh(() => r.reload()));

  const list = $derived.by<GList | null>(() => {
    const x = r.data; if (!x) return null;
    const q = (n: string) => query.get(n) ?? '';
    if (x.kind === 'fees') return key === 'agreed' ? agreedList(x.d) : feesList(x.d, q('age'));
    if (x.kind === 'planner') return key === 'gaps' ? gapsList(x.d.flows) : key === 'ageing' ? ageingList(x.d.flows, q('b')) : pipelineList(x.d.flows, q('stage'));
    if (x.kind === 'desk') return key === 'issues' ? issuesList(x.d.rows) : key === 'drivers' ? driversList(x.d.rows) : fleetList(x.d.rows, q('state'));
    if (x.kind === 'director') return key === 'profit' ? (can(user, 'performance') ? profitList(x.d) : null) : { title: 'Open alerts', sub: 'Most urgent first', groups: [{ label: 'Needs a decision or a call', rows: directorExceptions(user, x.d) }], empty: 'All clear — nothing needs you right now.' };
    return null;
  });
  // keep the chosen chip in view (a scrolled-away choice reads as "nothing chosen")
  function centerChosen(node: HTMLElement, _v: unknown) {
    const go = () => { const c = node.querySelector<HTMLElement>('.on'); if (c) node.scrollLeft = Math.max(0, c.offsetLeft - (node.clientWidth - c.offsetWidth) / 2); };
    go(); return { update: go };
  }
  const total = $derived(list ? list.groups.reduce((a, g) => a + g.rows.length, 0) : 0);
</script>

<ErrorNote error={r.error} onretry={() => r.reload()} />
{#if r.loading}
  <Skeleton rows={6} />
{:else if !list}
  <Empty title="Not available for your role" text="This list is not part of your home screen." />
{:else}
  <header class="hd">
    <h2 class="t-h1">{list.title}</h2>
    {#if list.sub}<p class="t-sub">{list.sub}</p>{/if}
  </header>
  {#if list.filters}
    {@const allF = list.filters.find((f) => f.id === 'all')}
    {@const curF = list.filters.find((f) => f.on)}
    <nav class="chips" aria-label="Filter" use:centerChosen={curF?.id}>
      {#each list.filters as f (f.id)}<a href="#{f.on && allF && f !== allF ? allF.href : f.href}" class="sel-ticked" class:on={f.on} aria-current={f.on ? 'true' : undefined}>{f.label}<span class="n">{f.count}</span></a>{/each}
    </nav>
    {#if allF && curF && curF !== allF}
      <p class="note" aria-live="polite"><span>Showing: <b>{curF.label}</b> ({curF.count} of {allF.count})</span><a href="#{allF.href}">Show all ({allF.count})<X size={16} aria-hidden="true" /></a></p>
    {/if}
  {/if}
  {#if !total}
    <Empty title={list.empty} />
  {:else}
    {#each list.groups as g (g.label)}
      <section aria-label={g.label}>
        <h3 class="t-title">{g.label}</h3>
        <div class="t-list">{#each g.rows as x (x.id)}<RowItem r={x} />{/each}</div>
      </section>
    {/each}
  {/if}
  <SyncLine refreshing={r.refreshing} />
{/if}

<style>
  .hd { display: flex; flex-direction: column; gap: 2px; }
  .t-h1 { font-size: 22px !important; line-height: 28px !important; }
  section { display: flex; flex-direction: column; gap: 10px; }
  .chips { position: relative; display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; margin: 0 calc(-1 * var(--t-pad)); padding: 2px var(--t-pad); }
  .chips::-webkit-scrollbar { display: none; }
  .chips a { flex: none; height: 44px; padding: 0 14px; border-radius: 22px; border: 1px solid var(--border-strong); background: var(--t-card); color: var(--text); font: 600 15px var(--ff-body); display: inline-flex; align-items: center; gap: 8px; white-space: nowrap; text-decoration: none; }
  /* chosen chip: the shared selection look (base.css "Selection states") — filled primary, tick, bold */
  .chips a.on { background: var(--sel-fill); color: var(--sel-on-fill); border-color: var(--sel-fill); font-weight: 700; }
  .note { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 0; padding: 4px 4px 4px 12px; border-radius: 12px; background: var(--sel-bg); box-shadow: inset 3px 0 0 var(--sel-line); font-size: 14px; }
  .note b { color: var(--sel-ink); }
  .note a { display: inline-flex; align-items: center; gap: 4px; min-height: 36px; padding: 0 10px; color: var(--link); font-weight: 600; text-decoration: none; }
  .n { min-width: 22px; height: 22px; padding: 0 6px; border-radius: 11px; background: var(--surface-sunken); color: var(--text-muted); font: 700 12px/22px var(--ff-body); text-align: center; }
  .on .n { background: color-mix(in srgb, var(--sel-on-fill) 22%, transparent); color: inherit; }
</style>
