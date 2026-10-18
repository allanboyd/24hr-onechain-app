<script lang="ts">
  // Searchable product combobox for long catalogues (131 SKUs): type to filter, grouped by source and category,
  // arrow keys + Enter to pick, Escape to close. Replaces plain <select>s on order and period-plan lines.
  import type { Product } from '@btw/api';
  import { groupProducts, matches, packToConfirm, productLabel } from '../lib/products';
  let { products, value = $bindable(''), label, invalid = false, onchange }: {
    products: Product[]; value?: string; label: string; invalid?: boolean; onchange?: (id: string) => void;
  } = $props();

  const uid = `pp-${Math.random().toString(36).slice(2, 8)}`;
  let open = $state(false);
  let q = $state('');
  let active = $state(0);
  let input: HTMLInputElement;
  const selected = $derived(products.find((p) => p.id === value));
  const filtered = $derived(products.filter((p) => matches(p, q)));
  const groups = $derived(groupProducts(filtered));
  const flat = $derived(groups.flatMap((g) => g.categories.flatMap((c) => c.products)));

  function show() { open = true; q = ''; active = Math.max(0, flat.findIndex((p) => p.id === value)); }
  function pick(p: Product) { value = p.id; open = false; q = ''; onchange?.(p.id); }
  function key(e: KeyboardEvent) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) { show(); e.preventDefault(); return; }
    if (!open) return;
    if (e.key === 'ArrowDown') { active = Math.min(flat.length - 1, active + 1); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { active = Math.max(0, active - 1); e.preventDefault(); }
    else if (e.key === 'Enter') { if (flat[active]) pick(flat[active]); e.preventDefault(); }
    else if (e.key === 'Escape') { open = false; q = ''; }
    queueMicrotask(() => document.getElementById(`${uid}-${active}`)?.scrollIntoView({ block: 'nearest' }));
  }
  $effect(() => { q; active = 0; });
</script>

<div class="pp" onfocusout={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) { open = false; q = ''; } }}>
  <input bind:this={input} class="input" role="combobox" aria-label={label} aria-expanded={open} aria-controls="{uid}-list"
    aria-activedescendant={open && flat[active] ? `${uid}-${active}` : undefined} aria-invalid={invalid || undefined} autocomplete="off"
    value={open ? q : selected ? productLabel(selected) : ''} placeholder={open ? 'Type brand, pack or source…' : 'Choose a product'}
    onfocus={show} onclick={() => { if (!open) show(); }} oninput={(e) => { q = (e.currentTarget as HTMLInputElement).value; open = true; }} onkeydown={key} />
  {#if open}
    <div class="menu" id="{uid}-list" role="listbox" aria-label={label}>
      {#if !flat.length}<div class="empty small">No product matches “{q}”.</div>{/if}
      {#each groups as g}
        <div class="src overline" role="presentation">{g.source}</div>
        {#each g.categories as c}
          <div class="cat caption" role="presentation">{c.category}</div>
          {#each c.products as p}
            {@const i = flat.indexOf(p)}
            <button type="button" id="{uid}-{i}" role="option" aria-selected={p.id === value} class:active={i === active}
              tabindex="-1" onmousedown={(e) => e.preventDefault()} onclick={() => pick(p)} onmouseenter={() => (active = i)}>
              <span class="grow">{p.brand}</span>
              <span class="pack" class:tbc={packToConfirm(p)}>{packToConfirm(p) ? 'pack to confirm' : p.pack}</span>
            </button>
          {/each}
        {/each}
      {/each}
    </div>
  {/if}
</div>

<style>
  .pp { position: relative; min-width: 240px; }
  .pp .input { width: 100%; }
  .menu { position: absolute; z-index: 30; top: calc(100% + 2px); left: 0; width: max(100%, 380px); max-height: 320px; overflow: auto; background: var(--surface-raised, var(--surface)); border: 1px solid var(--border-strong); border-radius: var(--radius-md); box-shadow: var(--elevation-2); padding: var(--space-1) 0; }
  .src { padding: var(--space-2) var(--space-3) 2px; color: var(--text); position: sticky; top: calc(-1 * var(--space-1)); background: var(--surface-raised, var(--surface)); }
  .cat { padding: 2px var(--space-3); }
  button { display: flex; gap: var(--space-3); align-items: baseline; width: 100%; padding: 6px var(--space-3) 6px var(--space-5); border: 0; background: none; color: var(--text); font: inherit; text-align: left; cursor: pointer; }
  button.active, button:hover { background: var(--primary-subtle); }
  button[aria-selected='true'] { font-weight: 600; }
  .pack { color: var(--text-muted); font-size: var(--fs-body-sm); white-space: nowrap; }
  .pack.tbc { color: var(--warning); }
  .empty { padding: var(--space-3); }
</style>
