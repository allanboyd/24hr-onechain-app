<script lang="ts">
  // Error panel for a failed load: what happened, what to do, and Retry.
  import { describe } from '../lib/errors';
  import WifiOff from '@lucide/svelte/icons/wifi-off';
  import Lock from '@lucide/svelte/icons/lock';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  let { error, onretry, compact = false }: { error: unknown; onretry?: () => void; compact?: boolean } = $props();
  const d = $derived(describe(error));
  const Icon = $derived(d.kind === 'offline' ? WifiOff : d.kind === 'forbidden' ? Lock : TriangleAlert);
</script>
{#if error}
  <div class="err card {d.kind === 'forbidden' ? 'flag-warning' : 'flag-danger'}" class:compact role="alert">
    <span class="ico"><Icon size={compact ? 18 : 22} /></span>
    <div class="grow"><strong>{d.title}</strong><div class="small muted">{d.message}</div></div>
    {#if onretry && d.kind !== 'forbidden'}<button class="btn btn-secondary btn-sm" onclick={onretry}>Retry</button>{/if}
  </div>
{/if}
<style>
  .err { display: flex; gap: var(--space-3); align-items: center; margin-bottom: var(--space-4); }
  .err.compact { padding: var(--space-3) var(--space-4); }
  .ico { color: var(--danger); display: grid; }
  .flag-warning .ico { color: var(--warning); }
</style>
