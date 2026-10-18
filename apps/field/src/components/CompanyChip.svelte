<script lang="ts">
  // "Which company is this for?" — mark + short name, accent bar in the company colour.
  import { company } from '../companies';
  let { entityId, big = false }: { entityId?: string | null; big?: boolean } = $props();
  const c = $derived(company(entityId));
</script>
{#if c}
  <span class="chip" class:big style:--acc={c.accent} title={c.name}>
    {#if c.mark}<img src={c.mark} alt="" />{:else}<span class="mono" style:background={c.primary}>{c.code === 'KVD' ? 'KV' : c.code}</span>{/if}
    <span>{c.short}</span>
  </span>
{/if}
<style>
  .chip { display: inline-flex; align-items: center; gap: 6px; padding: 2px 10px 2px 3px; border-radius: 999px; background: var(--surface-sunken); border-left: 4px solid var(--acc); font: 600 13px var(--ff-body); color: var(--text); max-width: 100%; }
  .chip img, .mono { width: 22px; height: 22px; border-radius: 6px; background: #fff; object-fit: contain; flex: none; }
  .mono { display: inline-grid; place-items: center; color: #fff; font: 800 9px var(--ff-display); }
  .big { font-size: 15px; padding: 4px 14px 4px 4px; }
  .big img, .big .mono { width: 30px; height: 30px; }
</style>
