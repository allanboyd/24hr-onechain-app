<script lang="ts">
  // BTW Team — the office roles' phone app (director, planner, accounts, fleet, operations, sales, admin).
  // Shell: top bar (menu · title · company · bell), side drawer, bottom tabs; screens load on first open.
  import './team.css';
  import { untrack } from 'svelte';
  import { analytics, notifications, onChange, type User } from '@btw/api';
  import { router } from '@btw/ui';
  import { SECTIONS, can, mayApprovePayments, mayApprovePOs, tabsFor, type SectionId } from './access';
  import { clearCompanyPaint, co, initCompany } from './company.svelte';
  import { isDetail, parse, tabOf, type View } from './routes';
  import { settle } from './load.svelte';
  import AppBar from './components/AppBar.svelte';
  import BottomNav from './components/BottomNav.svelte';
  import Drawer from './components/Drawer.svelte';
  import CompanySheet from './components/CompanySheet.svelte';
  import PullToRefresh from './components/PullToRefresh.svelte';
  import Empty from './components/Empty.svelte';
  import WebButton from './components/WebButton.svelte';
  import Home from './screens/Home.svelte';
  let { user, onlogout }: { user: User; onlogout: () => void } = $props();

  untrack(() => initCompany(user));
  $effect(() => () => clearCompanyPaint());

  // Screens other than Home are their own chunks.
  const screens: Record<string, () => Promise<{ default: any }>> = {
    trucks: () => import('./screens/Trucks.svelte'),
    queue: () => import('./screens/Queue.svelte'),
    fleet: () => import('./screens/Fleet.svelte'),
    'fleet/id': () => import('./screens/FleetDetail.svelte'),
    'trucks/id': () => import('./screens/TruckDetail.svelte'),
    orders: () => import('./screens/Orders.svelte'),
    'orders/po': () => import('./screens/PODetail.svelte'),
    'orders/draft': () => import('./screens/DraftDetail.svelte'),
    'orders/period': () => import('./screens/PeriodDetail.svelte'),
    stock: () => import('./screens/Stock.svelte'),
    sales: () => import('./screens/Sales.svelte'),
    money: () => import('./screens/Money.svelte'),
    'money/id': () => import('./screens/TripDetail.svelte'),
    notifications: () => import('./screens/Notifications.svelte'),
    reports: () => import('./screens/Reports.svelte'),
    approvals: () => import('./screens/Approvals.svelte'),
    more: () => import('./screens/More.svelte'),
  };
  const keyOf = (v: View) => (v.tab === 'orders' && v.kind && v.id ? `orders/${v.kind}` : isDetail(v) ? `${v.tab}/id` : v.tab);
  const TITLES: Record<string, string> = {
    home: 'Home', trucks: 'Trucks', 'trucks/id': 'Shipment', queue: 'Loading queue', fleet: 'Truck desk', 'fleet/id': 'Truck', orders: 'Orders', 'orders/po': 'Purchase order', 'orders/draft': 'Order draft', 'orders/period': 'Period plan',
    stock: 'Stock', sales: 'Sales', money: 'Money', 'money/id': 'Trip payments', notifications: 'Notifications', reports: 'Reports', approvals: 'Approvals', more: 'More',
  };

  const view = $derived(parse(router.path));
  const key = $derived(keyOf(view));
  const tabs = $derived(tabsFor(user));
  const activeTab = $derived(tabOf(view, tabs.map((t) => t.id)));
  const section = $derived(SECTIONS[view.tab as SectionId]);
  const allowed = $derived(!section?.feature || can(user, section.feature));
  const canSwitch = $derived(user.canGroup || user.allowedEntityIds.length > 1);

  let drawer = $state(false);
  let picking = $state(false);
  // Badges: unread notifications; things waiting for this user's approval.
  let unread = $state(0);
  let pending = $state(0);
  async function counts() {
    const [list, sum] = await Promise.all([settle(notifications.list(), []), settle(analytics.summary(), null)]);
    unread = list.filter((n) => !n.read).length;
    pending = (mayApprovePayments(user) ? sum?.paymentsPending ?? 0 : 0) + (mayApprovePOs(user) ? sum?.plansPending ?? 0 : 0);
  }
  $effect(() => { void co.rev; counts(); const t = setInterval(counts, 60_000); const off = onChange(() => counts()); return () => { clearInterval(t); off(); }; });
  const badges = $derived<Partial<Record<SectionId, number>>>({ approvals: pending, notifications: unread, more: pending });

  // Detail screens show a back arrow; Android/browser back works through the hash history.
  const back = $derived(isDetail(view));
  function goBack() { if (history.length > 1) history.back(); else router.go(SECTIONS[view.tab as SectionId]?.path ?? '/'); }
  $effect(() => { void router.path; drawer = false; });
</script>

<div class="team">
  <AppBar title={TITLES[key] ?? 'BTW Team'} {back} {unread} {canSwitch} onmenu={() => (drawer = true)} onback={goBack} oncompany={() => (picking = true)} onbell={() => router.go('/notifications')} />
  <PullToRefresh />

  {#key `${co.rev}|${router.path.split('?')[0]}`}
    <main class="t-page t-fade">
      {#if !allowed}
        <Empty title="Not available for your role" text="Ask an administrator if you need {section.label.toLowerCase()}.">
          <WebButton path="/" />
        </Empty>
      {:else if key === 'home'}
        <Home {user} {pending} />
      {:else}
        {#await screens[key]()}
          <div class="boot" aria-busy="true"></div>
        {:then m}
          <m.default {user} {view} query={router.query} />
        {:catch}
          <Empty title="Couldn't open this screen" text="Check your connection and try again." />
        {/await}
      {/if}
    </main>
  {/key}

  <BottomNav {tabs} active={activeTab} {badges} />
  <Drawer {user} open={drawer} active={activeTab === 'more' ? (view.tab as SectionId) : activeTab} {badges} {canSwitch} onclose={() => (drawer = false)} oncompany={() => { drawer = false; picking = true; }} {onlogout} />
  {#if picking}<CompanySheet {user} onclose={() => (picking = false)} />{/if}
</div>

<style>.boot { min-height: 50dvh; }</style>
