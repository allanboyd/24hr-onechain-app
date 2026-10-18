<script lang="ts">
  // More: every section the role may open that isn't a bottom tab, plus the web app for the big jobs.
  import type { User } from '@btw/api';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import { can, sectionsFor, tabsFor } from '../access';
  import { ICONS, TINT } from '../icons';
  import WebButton from '../components/WebButton.svelte';
  import type { View } from '../routes';
  let { user }: { user: User; view: View; query: URLSearchParams } = $props();
  const tabIds = $derived(tabsFor(user).map((t) => t.id));
  const rest = $derived(sectionsFor(user).filter((s) => !tabIds.includes(s.id) && s.id !== 'home'));
  const big = $derived([
    { path: '/plans/new', label: 'New purchase order', show: user.roles.some((r) => r === 'planner' || r === 'director') },
    { path: '/period-plans/new', label: 'New period plan', show: user.roles.some((r) => r === 'planner' || r === 'director') },
    { path: '/master', label: 'Master data (trucks, routes, products)', show: can(user, 'master-data') },
    { path: '/master?tab=providers', label: 'Providers, trucks & drivers', show: !can(user, 'master-data') && can(user, 'master-data.transport') },
    { path: '/trucks', label: 'Truck desk (charts, expenses, CSV)', show: can(user, 'trucks') },
    { path: '/users', label: 'Users & devices', show: can(user, 'users') },
  ].filter((x) => x.show));
</script>

<div class="t-list">
  {#each rest as s (s.id)}
    {@const Icon = ICONS[s.id]}
    <a class="t-item" href="#{s.path}">
      <span class="t-icon" style:color={TINT[s.id]}><Icon size={22} /></span>
      <span class="t-main"><span class="t-line1">{s.label}</span><span class="t-meta">{s.hint}</span></span>
      <ChevronRight class="t-chev" size={20} />
    </a>
  {/each}
</div>

{#if big.length}
  <h3 class="t-title">On a bigger screen</h3>
  <p class="t-meta">These need more room — they open in the web app, in the same company.</p>
  <div class="t-list">{#each big as b (b.path)}<WebButton path={b.path} label={b.label} />{/each}</div>
{/if}
<WebButton path="/" label="Open full web app" primary />
