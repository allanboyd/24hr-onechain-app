<script lang="ts">
  // Small square company mark (chips, switcher, tables). Uses the company's mark image when it exists,
  // else a monogram tile in the company colours. entityId null = the group (all companies).
  import { companyBrand, companyLabel, groupBrand } from '../lib/companies';
  let { entityId, size = 24 }: { entityId: string | null | undefined; size?: number } = $props();
  const b = $derived(entityId ? companyBrand(entityId) : null);
  const src = $derived(b ? b.mark : groupBrand().mark);
  const letters = $derived(b ? (b.code === 'KVD' ? 'KV' : b.code.slice(0, 3)) : 'G');
</script>
{#if src}
  <img class="mark" src={src} alt="" width={size} height={size} style:width="{size}px" style:height="{size}px" />
{:else}
  <span class="mono" aria-hidden="true" style:width="{size}px" style:height="{size}px" style:font-size="{Math.round(size * (letters.length > 2 ? 0.34 : 0.42))}px"
    style:background={b ? b.colors.primary : 'var(--surface-sunken)'} style:color={b ? '#fff' : 'var(--text)'} style:box-shadow={b ? `inset 0 -3px 0 ${b.colors.accent}` : 'none'}>{letters}</span>
{/if}
<span class="sr">{companyLabel(entityId)}</span>
<style>
  .mark { border-radius: var(--radius-sm); object-fit: contain; background: #fff; flex: none; }
  .mono { display: inline-grid; place-items: center; border-radius: var(--radius-sm); font: 800 12px var(--ff-display); letter-spacing: .02em; flex: none; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
</style>
