<script lang="ts">
  // V3-1g: System settings & logs → Settings (approval of advances, my email / SMS for money news). The same page as
  // Management → Settings, reached from Operations.
  import type { User } from '@btw/api';
  import { router } from '@btw/ui';
  import SystemNav, { systemPagesFor } from '../components/SystemNav.svelte';
  import Settings from './management/Settings.svelte';
  let { user, params = {} }: { user: User; params?: Record<string, string> } = $props();
  // #/system opens the first page this person may see
  $effect(() => { if (!params.page) { const first = systemPagesFor(user)[0]; if (first) router.go(first.href.slice(1)); } });
</script>

{#if params.page === 'settings'}
  <SystemNav {user} current="settings" />
  <Settings />
{/if}
