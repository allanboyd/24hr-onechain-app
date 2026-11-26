<script lang="ts" module>
  import type { User } from '@btw/api';
  import { canAny } from '../lib/features';
  /** V3-1g: the pages behind "System settings & logs" in the sidebar, each with the feature that opens it. */
  export const SYSTEM_PAGES = [
    { key: 'users', label: 'Users & access', href: '#/users', feature: 'users' },
    { key: 'audit', label: 'Audit log', href: '#/audit', feature: 'audit' },
    { key: 'settings', label: 'Settings', href: '#/system/settings', feature: 'reports' },
  ] as const;
  export type SystemPage = (typeof SYSTEM_PAGES)[number]['key'];
  export const systemPagesFor = (u: User | null) => SYSTEM_PAGES.filter((p) => canAny(u, p.feature));
</script>

<script lang="ts">
  // System settings & logs: one sidebar entry; this row switches between its pages (each keeps its own address).
  import Tabs from './page/Tabs.svelte';
  let { user, current }: { user: User; current: SystemPage } = $props();
  const pages = $derived(systemPagesFor(user));
</script>

{#if pages.length > 1}
  <div class="sysnav"><Tabs label="System settings & logs" tabs={pages.map((p) => ({ key: p.key, label: p.label }))} value={current} hrefOf={(k) => SYSTEM_PAGES.find((p) => p.key === k)!.href} /></div>
{/if}

<style>
  .sysnav { margin-bottom: var(--space-4); }
</style>
