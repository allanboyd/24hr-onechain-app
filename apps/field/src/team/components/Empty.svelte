<script lang="ts">
  // Friendly empty state with an optional action.
  import type { Snippet } from 'svelte';
  import Inbox from '@lucide/svelte/icons/inbox';
  let { title, text = '', children }: { title: string; text?: string; children?: Snippet } = $props();
</script>
<div class="empty-s">
  <span class="ic"><Inbox size={28} /></span>
  <strong>{title}</strong>
  {#if text}<p>{text}</p>{/if}
  {#if children}{@render children()}{/if}
</div>
<style>
  .empty-s { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 8px; padding: 36px 20px; color: var(--text-muted); }
  .ic { width: 64px; height: 64px; border-radius: 22px; background: var(--surface-sunken); display: grid; place-items: center; color: var(--text-subtle); margin-bottom: 4px; }
  strong { color: var(--text); font: 700 17px var(--ff-display); }
  p { margin: 0; font-size: 15px; max-width: 32ch; }
</style>
