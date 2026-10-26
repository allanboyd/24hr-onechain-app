<script lang="ts">
  // Empty list / no results: one line saying what is empty, an optional hint and an action (e.g. "Clear filters").
  import type { Snippet } from 'svelte';
  import Inbox from '@lucide/svelte/icons/inbox';
  let { title, hint = '', icon, compact = false, children }: {
    /** e.g. "No shipments match these filters" */ title: string;
    hint?: string;
    /** a lucide icon component (default inbox) */ icon?: any;
    /** less padding (inside a table cell) */ compact?: boolean;
    /** actions */ children?: Snippet;
  } = $props();
  const Icon = $derived(icon ?? Inbox);
</script>
<div class="es" class:compact role="status">
  <Icon size={compact ? 20 : 28} aria-hidden="true" />
  <strong>{title}</strong>
  {#if hint}<span class="small">{hint}</span>{/if}
  {#if children}<div class="acts">{@render children()}</div>{/if}
</div>
<style>
  .es { display: flex; flex-direction: column; align-items: center; gap: var(--space-1); text-align: center; color: var(--text-muted); padding: var(--space-10) var(--space-4); }
  .es.compact { padding: var(--space-5) var(--space-3); }
  .es :global(svg) { color: var(--text-subtle); margin-bottom: var(--space-1); }
  strong { color: var(--text); font-weight: 600; }
  .acts { display: flex; gap: var(--space-2); margin-top: var(--space-2); flex-wrap: wrap; justify-content: center; }
</style>
