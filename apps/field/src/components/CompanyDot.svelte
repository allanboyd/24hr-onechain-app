<script lang="ts">
  // Compact company mark for list rows (a receiver sees trucks from all three companies).
  import { company } from '../companies';
  let { entityId }: { entityId?: string | null } = $props();
  const c = $derived(company(entityId));
</script>
{#if c}{#if c.mark}<img src={c.mark} alt={c.short} title={c.name} />{:else}<span class="mono" style:background={c.primary} title={c.name}>{c.code === 'KVD' ? 'KV' : c.code}</span>{/if}{/if}
<style>
  img, .mono { width: 22px; height: 22px; border-radius: 6px; background: #fff; object-fit: contain; flex: none; margin-right: 8px; }
  .mono { display: inline-grid; place-items: center; color: #fff; font: 800 9px var(--ff-display); }
</style>
