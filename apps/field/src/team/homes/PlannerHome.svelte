<script lang="ts">
  // Kabonge (purchase planner) — client §10: PO pipeline by stage (tap → list), ordered vs loaded vs delivered for his
  // open orders, open orders by age (<3, 3–7, >7 days), plan vs actual, alerts. Scope = his buyer–supplier pairs (API). Lazy chunk.
  import type { User } from '@btw/api';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import { co } from '../company.svelte';
  import { canIssuePO } from '../access';
  import { Res, onRefresh } from '../load.svelte';
  import { ageTiles, alertRows, gapTotals, loadPlanner, pvState, stageTiles, unreadCount, OPEN } from '../glance';
  import { num, plural } from '../fmt';
  import CountTiles from '../components/CountTiles.svelte';
  import GapBar from '../components/GapBar.svelte';
  import Meter from '../components/Meter.svelte';
  import StatusChip from '../components/StatusChip.svelte';
  import Skeleton from '../components/Skeleton.svelte';
  import ErrorNote from '../components/ErrorNote.svelte';
  import SyncLine from '../components/SyncLine.svelte';
  import WebButton from '../components/WebButton.svelte';
  let { user }: { user: User; pending?: number } = $props();

  const r = new Res(() => loadPlanner(user));
  $effect(() => r.live(60_000));
  $effect(() => onRefresh(() => r.reload()));
  const flows = $derived(r.data?.flows ?? []);
  const open = $derived(flows.filter((f) => OPEN.includes(f.stage)));
  const gap = $derived(gapTotals(flows));
  const ages = $derived(ageTiles(flows));
  const pv = $derived(r.data?.pv ?? null);
  const unread = $derived(unreadCount(r.data?.notes ?? null));
  const firstAlert = $derived(alertRows(r.data?.notes ?? null, 1)[0]);
</script>

<section aria-labelledby="pl-h">
  <h3 class="t-title" id="pl-h">Order pipeline <a href="#/glance/pipeline">All {flows.length}</a></h3>
  <ErrorNote error={r.error} onretry={() => r.reload()} />
  {#if r.loading}<Skeleton kind="kpis" rows={6} />{:else}<div class="gap10"><CountTiles tiles={stageTiles(flows)} label="Orders by stage" /></div>{/if}
</section>

<section aria-labelledby="fu-h">
  <h3 class="t-title" id="fu-h">Follow up</h3>
  {#if r.loading}<Skeleton rows={4} />{:else}
  <div class="t-list gap10">
    <a class="t-item card" href="#/glance/gaps">
      <span class="t-main">
        <span class="t-line1">Ordered vs loaded vs delivered</span>
        <span class="t-meta">{plural(open.length, 'open order')} · {num(Math.max(0, gap.ordered - gap.loaded))} cases still to load</span>
        <GapBar {gap} />
      </span>
      <ChevronRight class="t-chev" size={20} />
    </a>
    <a class="t-item card" href="#/glance/ageing">
      <span class="t-main">
        <span class="t-line1">Open orders by age</span>
        <span class="chips">{#each ages as a (a.id)}<StatusChip tone={a.count ? a.tone : 'neutral'} label="{a.label}: {a.count}" />{/each}</span>
      </span>
      <ChevronRight class="t-chev" size={20} />
    </a>
    {#if pv}
      {@const st = pvState(pv)}
      <a class="t-item card" href="#/orders?seg=period">
        <span class="t-main">
          <span class="t-line1"><span class="t-ellipsis">Plan vs actual</span><StatusChip tone={st.tone} label={st.label} /></span>
          <span class="t-meta">Ordered {num(pv.measures.ordered)} of {num(pv.measures.planned)} planned · {num(Math.round(pv.measures.expectedToDate))} expected by today</span>
          <Meter value={pv.measures.ordered} max={pv.measures.planned} label="Ordered of planned" />
        </span>
        <ChevronRight class="t-chev" size={20} />
      </a>
    {/if}
    <a class="t-item card" href="#/notifications">
      <span class="t-main">
        <span class="t-line1"><span class="t-ellipsis">Alerts</span><StatusChip tone={unread ? 'info' : 'success'} label={unread ? `${unread} new` : 'All read'} /></span>
        <span class="t-meta t-ellipsis">{firstAlert ? firstAlert.title : 'Revisions at loading, returned orders and plan warnings arrive here'}</span>
      </span>
      <ChevronRight class="t-chev" size={20} />
    </a>
  </div>
  {/if}
</section>

{#if canIssuePO(user) && co.active}
  <section class="t-card make">
    <strong>Need to raise a new purchase order or period plan?</strong>
    <span class="t-meta">Bigger forms work best on a computer.</span>
    <WebButton path="/plans/new" label="New purchase order" />
  </section>
{/if}
<SyncLine refreshing={r.refreshing} />

<style>
  .gap10 { margin-top: 10px; }
  .card { align-items: center; }
  .card .t-line1 { justify-content: space-between; }
  .t-main { gap: 6px !important; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .make { display: flex; flex-direction: column; gap: 6px; }
  .make :global(.btn) { margin-top: 6px; }
</style>
