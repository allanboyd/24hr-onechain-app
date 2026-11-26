<script lang="ts">
  // Form dropdown: a field that opens a list, instead of the browser's own select.
  import Check from '@lucide/svelte/icons/check';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  let { value = $bindable(''), options, placeholder = 'Choose', label }: {
    value?: string;
    options: { value: string; label: string }[];
    placeholder?: string;
    label: string;
  } = $props();
  let open = $state(false);
  let el = $state<HTMLDivElement>();
  let place = $state({ top: 0, left: 0, width: 0, up: false });
  const current = $derived(options.find((o) => o.value === value)?.label ?? placeholder);
  const chosen = $derived(options.some((o) => o.value === value));
  function locate() {
    const btn = el?.querySelector('.trig');
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const below = window.innerHeight - r.bottom;
    place = { top: below < 220 && r.top > below ? r.top : r.bottom, left: r.left, width: r.width, up: below < 220 && r.top > below };
  }
  $effect(() => {
    if (!open) return;
    locate();
    const away = (e: PointerEvent) => { if (el && !el.contains(e.target as Node)) open = false; };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); open = false; } };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key, true);
    window.addEventListener('resize', locate);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', key, true); window.removeEventListener('resize', locate); };
  });
</script>

<div class="fs" bind:this={el}>
  <button type="button" class="trig" aria-haspopup="listbox" aria-expanded={open} aria-label={label} onclick={() => (open = !open)}>
    <span class:ph={!chosen}>{current}</span>
    <ChevronDown size={16} />
  </button>
  {#if open}
    <ul class="menu" class:up={place.up} role="listbox" aria-label={label} style:top="{place.top}px" style:left="{place.left}px" style:width="{place.width}px">
      {#each options as o (o.value)}
        <li>
          <button type="button" role="option" aria-selected={value === o.value} onclick={() => { value = o.value; open = false; }}>
            {#if value === o.value}<Check size={14} />{:else}<span class="sp"></span>{/if}
            {o.label}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .fs { position: relative; }
  .trig { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; height: 40px; padding: 0 12px; border: 1px solid var(--border-strong); border-radius: var(--radius-md); background: var(--surface); color: var(--text); font: inherit; font-size: 14px; text-align: left; cursor: pointer; }
  .trig:hover { border-color: var(--text-muted); }
  .trig:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 1px; }
  .ph { color: var(--text-muted); }
  .trig :global(svg) { flex: none; color: var(--text-muted); }
  .menu { position: fixed; z-index: 80; margin: 4px 0 0; max-height: 200px; padding: 6px; overflow: auto; list-style: none; background: var(--surface-raised); border: 1px solid var(--border); border-radius: var(--radius-md); box-shadow: var(--elevation-3); }
  .menu.up { margin: 0 0 4px; transform: translateY(calc(-100% - 4px)); }
  .menu button { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 36px; padding: 6px 8px; border: 0; border-radius: var(--radius-sm); background: none; color: var(--text); font: inherit; font-size: 14px; text-align: left; cursor: pointer; }
  .menu button:hover, .menu button:focus-visible { background: var(--primary-subtle); }
  .menu button[aria-selected='true'] { color: var(--primary); font-weight: 600; }
  .sp { width: 14px; flex: none; }
</style>
