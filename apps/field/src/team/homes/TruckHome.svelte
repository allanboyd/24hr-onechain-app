<script lang="ts">
  // Testfie (truck follow-up) — client §10: live fleet by status (tap → list grouped by route), delayed trucks, open
  // issues, driver last-update badges, agreed prices not recorded, unpaid fees 2 weeks+ / 1 month+, "Load at GBI Mombasa".
  import type { User } from '@btw/api';
  import PackagePlus from '@lucide/svelte/icons/package-plus';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import { canTransport, loadLabel, loadsHere } from '../access';
  import { Res, onRefresh } from '../load.svelte';
  import { fleetTiles, loadTrucks, truckActions } from '../glance';
  import CountTiles from '../components/CountTiles.svelte';
  import ActionList from '../components/ActionList.svelte';
  import Skeleton from '../components/Skeleton.svelte';
  import ErrorNote from '../components/ErrorNote.svelte';
  import SyncLine from '../components/SyncLine.svelte';
  import WebButton from '../components/WebButton.svelte';
  let { user }: { user: User; pending?: number } = $props();

  const r = new Res(() => loadTrucks(user));
  $effect(() => r.live(60_000));
  $effect(() => onRefresh(() => r.reload()));
  const tiles = $derived(r.data ? fleetTiles(r.data.desk.rows) : []);
  const actions = $derived(r.data ? truckActions(user, r.data) : []);
</script>

{#if loadsHere(user)}
  <a class="load t-press" href="#/load"><span class="ic"><PackagePlus size={26} /></span><span class="t-main"><strong>{loadLabel(user)}</strong><span>Record a loading — quantities and documents, no prices</span></span><ChevronRight size={22} /></a>
{/if}

<section aria-labelledby="fl-h">
  <h3 class="t-title" id="fl-h">Live fleet <a href="#/glance/fleet?state=all">All trucks</a></h3>
  <ErrorNote error={r.error} onretry={() => r.reload()} />
  {#if r.loading}<Skeleton kind="kpis" rows={6} />{:else}<div class="gap10"><CountTiles {tiles} label="Trucks by status" /></div>{/if}
</section>

<section aria-labelledby="fu-h">
  <h3 class="t-title" id="fu-h">Follow up</h3>
  {#if r.loading}<Skeleton rows={5} />{:else}<div class="gap10"><ActionList rows={actions} label="Follow up" /></div>{/if}
</section>

{#if canTransport(user)}
  <section class="t-card make">
    <strong>Onboarding a transporter, sacco or truck?</strong>
    <span class="t-meta">Provider, truck and driver forms work best on a computer.</span>
    <WebButton path="/master?tab=providers" label="Add provider or truck" />
  </section>
{/if}
<SyncLine refreshing={r.refreshing} />

<style>
  .gap10 { margin-top: 10px; }
  .load { display: flex; align-items: center; gap: 14px; min-height: 76px; padding: 14px 16px; border-radius: var(--t-radius); background: var(--t-accent); color: #fff; text-decoration: none; box-shadow: 0 12px 24px -12px color-mix(in srgb, var(--t-accent) 70%, transparent); }
  .load .ic { width: 48px; height: 48px; border-radius: 16px; display: grid; place-items: center; background: rgb(255 255 255 / .18); flex: none; }
  .load .t-main { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .load strong { font: 800 18px var(--ff-display); }
  .load span span { font-size: 14px; opacity: .9; }
  .make { display: flex; flex-direction: column; gap: 6px; }
  .make :global(.btn) { margin-top: 6px; }
</style>
