<script lang="ts">
  // Home: greeting, then the person's own home (docs/11 D-A1, dashboards document §10) — directors, Kabonge and Testfie
  // get their lazy persona home (homes/*); other office roles keep main menu · KPI cards · needs attention.
  import { analytics, finance, plans, shipments, type User } from '@btw/api';
  import { reportsApi } from '../reports';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import { can, canIssuePO, canTransport, loadLabel, mayApprovePOs, menuFor } from '../access';
  import { loadDesk } from '../desk';
  import { ICONS, TINT } from '../icons';
  import { activeBrand, co } from '../company.svelte';
  import { firstName, greeting, longToday } from '../fmt';
  import { Res, onRefresh, settle } from '../load.svelte';
  import { attentionFor, kpisFor, type HomeData } from '../insights';
  import KpiCard from '../components/KpiCard.svelte';
  import Skeleton from '../components/Skeleton.svelte';
  import ErrorNote from '../components/ErrorNote.svelte';
  import WebButton from '../components/WebButton.svelte';
  let { user, pending = 0 }: { user: User; pending?: number } = $props();

  const HOMES = {
    director: () => import('../homes/DirectorHome.svelte'),
    planner: () => import('../homes/PlannerHome.svelte'),
    truck_planner: () => import('../homes/TruckHome.svelte'),
  } as const;
  const persona = (Object.keys(HOMES) as (keyof typeof HOMES)[]).find((r) => user.roles.includes(r));

  const r = new Res<HomeData>(async () => {
    if (persona) return { sum: null, dash: null, trips: null, ships: null, inv: null, drafts: null };
    const reports = await reportsApi();
    const [sum, dash, trips, ships, inv, drafts, desk] = await Promise.all([
      settle(analytics.summary(), null),
      can(user, 'dashboard') ? settle(reports.dashboard(), null) : null,
      can(user, 'finance') || can(user, 'truck-expenses') ? settle(finance.trips(), null) : null,
      can(user, 'logistics') ? settle(shipments.list(), null) : null,
      can(user, 'inventory') ? settle(reports.inventory(), null) : null,
      can(user, 'purchase-orders') && (canIssuePO(user) || mayApprovePOs(user)) ? settle(plans.list(), null) : null,
      can(user, 'trucks') && user.roles.includes('truck_planner') ? settle(loadDesk(user), null) : null,
    ]);
    if (!sum && !dash) throw new Error('Could not load your numbers. Check your connection.');
    return { sum, dash, trips: desk?.trips ?? trips, ships, inv, drafts, desk };
  });
  $effect(() => { if (!persona) return r.live(60_000); });
  $effect(() => { if (!persona) return onRefresh(() => r.reload()); });

  const menu = $derived(menuFor(user, pending));
  const kpis = $derived(r.data ? kpisFor(user, r.data) : []);
  const attention = $derived(r.data ? attentionFor(user, r.data) : []);
  const b = $derived((co.active, activeBrand()));
</script>

<section class="hello">
  <p class="date">{longToday()}</p>
  <h2 class="t-h1">{greeting()}, {firstName(user.name)}</h2>
  <p class="t-sub">{b ? b.short : 'Group · all companies'}{co.active === null ? ' · read-only overview' : ''}</p>
</section>

{#if persona}
  {#await HOMES[persona]()}
    <Skeleton kind="kpis" rows={6} />
  {:then m}
    <m.default {user} {pending} />
  {:catch}
    <ErrorNote error="Couldn't open your home screen. Check your connection." onretry={() => location.reload()} />
  {/await}
{:else}
<section aria-labelledby="menu-h">
  <h3 class="t-title" id="menu-h">Main menu</h3>
  <div class="menu">
    {#each menu as m (m.id)}
      {@const Icon = ICONS[m.id]}
      <a class="tile t-press" href="#{m.path}" style:--tint={TINT[m.id]}>
        <span class="ic"><Icon size={26} /></span>
        <span class="name">{m.id === 'load' ? loadLabel(user) : m.label}</span>
        {#if m.id === 'approvals' && pending}<span class="badge-n">{pending}</span>{/if}
      </a>
    {/each}
  </div>
</section>

<section aria-labelledby="kpi-h">
  <h3 class="t-title" id="kpi-h">At a glance {#if r.refreshing}<span class="caption">updating…</span>{/if}</h3>
  <ErrorNote error={r.error} onretry={() => r.reload()} />
  {#if r.loading}
    <Skeleton kind="kpis" rows={4} />
  {:else if kpis.length}
    <div class="kpis">{#each kpis as k (k.key)}<KpiCard {k} />{/each}</div>
  {/if}
</section>

<section aria-labelledby="att-h">
  <h3 class="t-title" id="att-h">Needs attention {#if attention.length}<span class="pill">{attention.length}</span>{/if}</h3>
  {#if r.loading}
    <Skeleton rows={3} />
  {:else if attention.length}
    <div class="t-list">
      {#each attention as a (a.id)}
        <a class="t-item" href="#{a.href}">
          <span class="t-dot tone-{a.tone}" aria-hidden="true"></span>
          <span class="t-main"><span class="t-line1"><span class="t-ellipsis">{a.title}</span></span><span class="t-meta t-ellipsis">{a.text}</span></span>
          <ChevronRight class="t-chev" size={20} />
        </a>
      {/each}
    </div>
  {:else if r.data}
    <div class="t-card clear"><CircleCheck size={24} /><span>All clear — nothing needs you right now.</span></div>
  {/if}
</section>

{#if user.roles.includes('truck_planner') && canTransport(user)}
  <section class="t-card make">
    <strong>Onboarding a transporter, sacco or truck?</strong>
    <span class="t-meta">Provider, truck and driver forms work best on a computer.</span>
    <WebButton path="/master?tab=providers" label="Add provider or truck" />
  </section>
{/if}

{#if canIssuePO(user) && co.active}
  <section class="t-card make">
    <strong>Need to raise a new purchase order or period plan?</strong>
    <span class="t-meta">Bigger forms work best on a computer.</span>
    <WebButton path="/plans/new" label="New purchase order" />
  </section>
{/if}
{/if}

<style>
  .hello { padding: 4px 2px 0; }
  .date { margin: 0 0 2px; font: 600 14px var(--ff-body); color: var(--text-muted); }
  .menu { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 10px; }
  .tile { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; min-height: 104px; padding: 14px 6px 12px; border-radius: var(--t-radius); background: var(--t-card); border: 1px solid var(--t-line); box-shadow: var(--t-shadow); color: var(--text); text-decoration: none; text-align: center; transition: transform var(--motion-fast); }
  .ic { width: 52px; height: 52px; border-radius: 18px; display: grid; place-items: center; color: var(--tint); background: color-mix(in srgb, var(--tint) 13%, transparent); }
  :global(:root[data-theme='dark']) .ic { color: color-mix(in srgb, var(--tint) 45%, #fff); background: color-mix(in srgb, var(--tint) 30%, transparent); }
  @media (prefers-color-scheme: dark) { :global(:root:not([data-theme='light'])) .ic { color: color-mix(in srgb, var(--tint) 45%, #fff); background: color-mix(in srgb, var(--tint) 30%, transparent); } }
  .name { font: 600 14px/18px var(--ff-body); }
  .badge-n { position: absolute; top: 10px; right: 10px; min-width: 22px; height: 22px; border-radius: 11px; background: var(--danger-solid); color: var(--text-on-danger); font: 700 12px/22px var(--ff-body); padding: 0 6px; }
  .kpis { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
  section > :global(.t-list), section > :global(.list) { margin-top: 10px; }
  .pill { min-width: 24px; height: 24px; border-radius: 12px; background: var(--danger-subtle); color: var(--danger); font: 700 13px/24px var(--ff-body); text-align: center; padding: 0 8px; letter-spacing: 0; }
  .t-dot.tone-danger { background: var(--danger-solid); } .t-dot.tone-warning { background: var(--warning-solid); } .t-dot.tone-info { background: var(--info); }
  .clear { display: flex; align-items: center; gap: 10px; color: var(--success); font-weight: 600; margin-top: 10px; }
  .make { display: flex; flex-direction: column; gap: 6px; }
  .make :global(.btn) { margin-top: 6px; }
  @media (min-width: 560px) { .menu { grid-template-columns: repeat(4, 1fr); } .kpis { grid-template-columns: repeat(3, 1fr); } }
</style>
