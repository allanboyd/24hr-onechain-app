<script lang="ts">
  // D-A4 on team screens: when this phone last synced, what is waiting to send, and how fresh the numbers are.
  import CloudOff from '@lucide/svelte/icons/cloud-off';
  import RefreshCw from '@lucide/svelte/icons/refresh-cw';
  import Upload from '@lucide/svelte/icons/upload';
  import { watchSync, syncedLabel, type SyncView } from '../../synced';
  let { refreshing = false }: { refreshing?: boolean } = $props();
  let s = $state<SyncView>({ online: true, pending: 0, syncing: false, lastSynced: null });
  $effect(() => watchSync((v) => (s = v)));
</script>
<p class="sl" role="status" class:off={!s.online} class:wait={s.pending > 0}>
  {#if !s.online}<CloudOff size={16} aria-hidden="true" /><span>Offline · {syncedLabel(s.lastSynced).replace('Synced', 'last synced')}</span>
  {:else if s.pending}<Upload size={16} aria-hidden="true" /><span>Waiting to send {s.pending} · {syncedLabel(s.lastSynced)}</span>
  {:else}<RefreshCw size={16} aria-hidden="true" class={refreshing ? 'spin' : ''} /><span>{refreshing ? 'Updating…' : syncedLabel(s.lastSynced)} · pull down to refresh</span>{/if}
</p>
<style>
  .sl { display: flex; align-items: center; justify-content: center; gap: 6px; margin: 0; font: 600 13px var(--ff-body); color: var(--text-muted); text-align: center; }
  .sl.off { color: var(--danger); } .sl.wait { color: var(--warning); }
  .sl :global(.spin) { animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
