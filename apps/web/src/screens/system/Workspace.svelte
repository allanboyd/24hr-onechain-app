<script lang="ts">
  // V3-13: Settings & alerts. A menu inside the page on the left (grouped, icons, the chosen item highlighted), the chosen
  // section on the right. Each section keeps its own address (#/system/<key>); older addresses open the same section.
  // On a phone the menu becomes a row of pills above the section.
  import type { User } from '@btw/api';
  import { router } from '@btw/ui';
  import { GROUPS, sectionOf, sectionsFor } from './sections';
  let { user }: { user: User; params?: Record<string, string> } = $props();
  const mine = $derived(sectionsFor(user));
  const current = $derived(sectionOf(router.path, user));
</script>

<div class="ws">
  <nav class="side" aria-label="Settings & alerts">
    <div class="ttl">Settings & alerts</div>
    {#each GROUPS as g (g)}
      {@const items = mine.filter((s) => s.group === g)}
      {#if items.length}
        <div class="grp">{g}</div>
        {#each items as s (s.key)}
          {@const Icon = s.icon}
          <a href="#/system/{s.key}" class:on={current?.key === s.key} aria-current={current?.key === s.key ? 'page' : undefined}><Icon size={16} aria-hidden="true" /><span>{s.label}</span></a>
        {/each}
      {/if}
    {/each}
  </nav>
  <div class="content">
    {#if current}
      {#key current.key}
        {#await current.load()}<div class="card"><div class="skeleton" style="height:120px"></div></div>
        {:then M}<M.default {user} params={{}} section />{/await}
      {/key}
    {:else}
      <div class="card empty"><h3>Not available for your role</h3><p class="small">Pick a section on the left.</p></div>
    {/if}
  </div>
</div>

<style>
  .ws { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: var(--space-5); align-items: start; }
  .side { position: sticky; top: var(--space-4); display: flex; flex-direction: column; gap: 2px; padding: var(--space-3); border: 1px solid var(--border); border-radius: 14px; background: var(--surface); }
  .ttl { font-weight: 700; font-size: 15px; padding: 4px 10px 6px; }
  .grp { font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--text-subtle); padding: 10px 10px 4px; }
  .side a { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 9px; color: var(--text-muted); text-decoration: none; font-size: 14px; font-weight: 500; }
  .side a:hover { background: var(--surface-sunken); color: var(--text); text-decoration: none; }
  .side a.on { background: var(--primary-subtle); color: var(--primary); font-weight: 600; }
  .content { min-width: 0; }
  @media (max-width: 860px) {
    .ws { grid-template-columns: minmax(0, 1fr); gap: var(--space-3); }
    .side { position: static; flex-direction: row; overflow-x: auto; padding: 6px; gap: 6px; border-radius: 12px; scrollbar-width: none; }
    .ttl, .grp { display: none; }
    .side a { flex: none; white-space: nowrap; border: 1px solid var(--border); border-radius: 99px; padding: 6px 12px; }
    .side a.on { border-color: transparent; }
  }
</style>
