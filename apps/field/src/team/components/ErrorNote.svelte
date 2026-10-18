<script lang="ts">
  // Inline load error with retry (keeps whatever was already on screen).
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  let { error, onretry }: { error: string; onretry: () => void } = $props();
</script>
{#if error}
  <div class="err" role="alert"><TriangleAlert size={18} /><span class="grow">{error}</span><button onclick={onretry}>Try again</button></div>
{/if}
<style>
  .err { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 14px; background: var(--danger-subtle); color: var(--danger); font-size: 15px; }
  .grow { flex: 1; }
  button { border: 0; background: none; color: inherit; font: 700 15px var(--ff-body); text-decoration: underline; cursor: pointer; min-height: 40px; }
</style>
