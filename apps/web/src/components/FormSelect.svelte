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
  const current = $derived(options.find((o) => o.value === value)?.label ?? placeholder);
  const chosen = $derived(options.some((o) => o.value === value));
  $effect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (el && !el.contains(e.target as Node)) open = false; };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') open = false; };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', key); };
  });
</script>

<div class="fs" bind:this={el}>
  <button type="button" class="trig" aria-haspopup="listbox" aria-expanded={open} aria-label={label} onclick={() => (open = !open)}>
    <span class:ph={!chosen}>{current}</span>
    <ChevronDown size={16} />
  </button>
  {#if open}
    <ul class="menu" role="listbox" aria-label={label}>
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
  .menu { position: absolute; z-index: 40; top: calc(100% + 6px); left: 0; right: 0; max-height: 240px; margin: 0; padding: 6px; overflow: auto; list-style: none; background: var(--surface-raised); border: 1px solid var(--border); border-radius: var(--radius-md); box-shadow: var(--elevation-2); }
  .menu button { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 36px; padding: 6px 8px; border: 0; border-radius: var(--radius-sm); background: none; color: var(--text); font: inherit; font-size: 14px; text-align: left; cursor: pointer; }
  .menu button:hover, .menu button:focus-visible { background: var(--primary-subtle); }
  .menu button[aria-selected='true'] { color: var(--primary); font-weight: 600; }
  .sp { width: 14px; flex: none; }
</style>
