<script lang="ts">
  // Mounted on <body> by main.ts (outside the shell): the "new version" banner and a one-time Install card.
  import { pwa, install, dismissInstall } from './index.svelte';
  import RefreshCw from '@lucide/svelte/icons/refresh-cw';
  import MonitorDown from '@lucide/svelte/icons/monitor-down';
  let hideUpdate = $state(false);
</script>

{#if pwa.update && !hideUpdate}
  <div class="pwa" role="status" aria-live="polite">
    <RefreshCw size={18} aria-hidden="true" />
    <span class="grow">A new version is ready.</span>
    <button type="button" class="btn btn-ghost btn-sm" onclick={() => (hideUpdate = true)}>Later</button>
    <button type="button" class="btn btn-primary btn-sm" onclick={() => location.reload()}>Update</button>
  </div>
{:else if pwa.canInstall}
  <div class="pwa" role="region" aria-label="Install BTW Office">
    <MonitorDown size={18} aria-hidden="true" />
    <span class="grow">Install <b>BTW Office</b> to open it like an app.</span>
    <button type="button" class="btn btn-ghost btn-sm" onclick={dismissInstall}>Not now</button>
    <button type="button" class="btn btn-primary btn-sm" onclick={install}>Install</button>
  </div>
{/if}

<style>
  .pwa { position: fixed; right: 16px; bottom: 16px; z-index: 200; display: flex; align-items: center; gap: var(--space-2); width: min(420px, calc(100vw - 32px)); padding: var(--space-3) var(--space-4); border-radius: var(--radius-lg); background: var(--surface-raised); color: var(--text); box-shadow: var(--elevation-3); font-size: var(--fs-body-sm); }
  .pwa :global(svg) { color: var(--link); flex: none; }
</style>
