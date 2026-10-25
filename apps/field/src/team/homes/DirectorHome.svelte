<script lang="ts">
  // Directors (Daniel, Michael) — client §10 "executive overview" on the phone: KPI scorecard with change vs the
  // previous period, the top exceptions (one list), quick links to profit, fleet, fees, stock and sales. Lazy chunk.
  import type { User } from '@btw/api';
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import TrendingUp from '@lucide/svelte/icons/trending-up';
  import Truck from '@lucide/svelte/icons/truck';
  import Wallet from '@lucide/svelte/icons/wallet';
  import Boxes from '@lucide/svelte/icons/boxes';
  import ShoppingCart from '@lucide/svelte/icons/shopping-cart';
  import { can } from '../access';
  import { Res, onRefresh } from '../load.svelte';
  import { directorExceptions, directorKpis, loadDirector } from '../glance';
  import KpiCard from '../components/KpiCard.svelte';
  import RowItem from '../components/RowItem.svelte';
  import Skeleton from '../components/Skeleton.svelte';
  import ErrorNote from '../components/ErrorNote.svelte';
  import SyncLine from '../components/SyncLine.svelte';
  let { user }: { user: User; pending?: number } = $props();

  const r = new Res(() => loadDirector(user));
  $effect(() => r.live(60_000));
  $effect(() => onRefresh(() => r.reload()));
  const kpis = $derived(r.data ? directorKpis(user, r.data) : []);
  const ex = $derived(r.data ? directorExceptions(user, r.data) : []);
  const links = $derived([
    { label: 'Profit & margin', href: '/glance/profit', icon: TrendingUp, ok: can(user, 'performance') },
    { label: 'Fleet', href: '/glance/fleet?state=road', icon: Truck, ok: can(user, 'trucks') },
    { label: 'Transport fees', href: '/glance/fees', icon: Wallet, ok: can(user, 'transport-fees') },
    { label: 'Stock', href: '/stock', icon: Boxes, ok: can(user, 'inventory') },
    { label: 'Sales', href: '/sales', icon: ShoppingCart, ok: can(user, 'sales') },
  ].filter((x) => x.ok));
</script>

<section aria-labelledby="sc-h">
  <h3 class="t-title" id="sc-h">Scorecard</h3>
  <ErrorNote error={r.error} onretry={() => r.reload()} />
  {#if r.loading}<Skeleton kind="kpis" rows={6} />
  {:else}<div class="kpis" class:odd={kpis.length % 2}>{#each kpis as k (k.key)}<KpiCard {k} />{/each}</div>{/if}
</section>

<section aria-labelledby="ex-h">
  <h3 class="t-title" id="ex-h">Top exceptions {#if ex.length > 5}<a href="#/glance/exceptions">See all {ex.length}</a>{/if}</h3>
  {#if r.loading}<Skeleton rows={3} />
  {:else if ex.length}<div class="t-list">{#each ex.slice(0, 5) as x (x.id)}<RowItem r={x} />{/each}</div>
  {:else if r.data}<div class="t-card clear"><CircleCheck size={24} /><span>All clear — nothing needs you right now.</span></div>{/if}
</section>

<section aria-labelledby="go-h">
  <h3 class="t-title" id="go-h">Go to</h3>
  <nav class="links" aria-labelledby="go-h">
    {#each links as l (l.href)}{@const Icon = l.icon}<a class="link t-press" href="#{l.href}"><Icon size={22} aria-hidden="true" /><span>{l.label}</span></a>{/each}
  </nav>
</section>
<SyncLine refreshing={r.refreshing} />

<style>
  .kpis { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
  .kpis.odd > :global(:last-child) { grid-column: 1 / -1; }
  section > :global(.t-list) { margin-top: 10px; }
  .clear { display: flex; align-items: center; gap: 10px; color: var(--success); font-weight: 600; margin-top: 10px; }
  .links { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; margin-top: 10px; }
  .link { display: flex; align-items: center; gap: 10px; min-height: 56px; padding: 0 14px; border-radius: var(--t-radius-sm); background: var(--t-card); border: 1px solid var(--t-line); box-shadow: var(--t-shadow); color: var(--text); text-decoration: none; font: 600 15px var(--ff-body); }
  .link :global(svg) { color: var(--t-accent); flex: none; }
</style>
