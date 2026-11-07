<script lang="ts">
  // Field roles share one shell: Now (the job) · List (today's set) · Me. Team's five tabs are unchanged.
  import type { User } from '@btw/api';
  import { fieldRole, type FieldRole } from '../lib';
  import Navigation from '@lucide/svelte/icons/navigation';
  import List from '@lucide/svelte/icons/list';
  import ListChecks from '@lucide/svelte/icons/list-checks';
  import Truck from '@lucide/svelte/icons/truck';
  import UserIcon from '@lucide/svelte/icons/user';
  import FieldNav from './FieldNav.svelte';
  import Driver from '../screens/Driver.svelte';
  import LoadingPoint from '../screens/LoadingPoint.svelte';
  import Receiver from '../screens/Receiver.svelte';
  import MenuSheet from '../components/MenuSheet.svelte';

  let { user, onlogout }: { user: User; onlogout: () => void } = $props();
  const role = $derived(fieldRole(user) as FieldRole);
  const LIST: Record<FieldRole, { short: string; icon: typeof List }> = {
    driver: { short: 'Trips', icon: Truck },
    loader: { short: 'Today', icon: ListChecks },
    receiver: { short: 'Incoming', icon: List },
  };
  const tabs = $derived([
    { id: 'now', short: 'Now', path: '/', icon: Navigation },
    { id: 'list', short: LIST[role].short, path: '/list', icon: LIST[role].icon },
    { id: 'me', short: 'Me', path: '/me', icon: UserIcon },
  ]);
  const parse = () => {
    const h = (location.hash.replace(/^#/, '') || '/').split('?')[0];
    if (h === '/list' || h === '/trips' || h === '/today' || h === '/incoming') return 'list';
    if (h === '/me') return 'me';
    return 'now';
  };
  let tab = $state(parse());
  $effect(() => {
    const on = () => (tab = parse());
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  });
</script>

<div class="field-shell">
  {#if tab === 'now'}
    {#if role === 'driver'}<Driver {user} {onlogout} shell />
    {:else if role === 'loader'}<LoadingPoint {user} {onlogout} shell />
    {:else}<Receiver {user} {onlogout} shell />{/if}
  {:else if tab === 'list'}
    {#if role === 'driver'}
      {#await import('./Trips.svelte') then m}<m.default {user} />{/await}
    {:else if role === 'loader'}
      {#await import('./Today.svelte') then m}<m.default {user} />{/await}
    {:else}
      {#await import('./Incoming.svelte') then m}<m.default {user} />{/await}
    {/if}
  {:else}
    <MenuSheet page {user} {onlogout} />
  {/if}
  <FieldNav {tabs} active={tab} />
</div>

<style>
  .field-shell { min-height: 100dvh; background: var(--bg); --field-nav: calc(68px + env(safe-area-inset-bottom)); }
</style>
