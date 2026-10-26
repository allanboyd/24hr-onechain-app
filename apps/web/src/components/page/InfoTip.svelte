<script lang="ts">
  // ⓘ button with a small popover for the longer explanation of a page, tile or filter (docs/17 §3: no paragraphs).
  // Click / Enter toggles; Esc or a click outside closes and returns focus to the button.
  import Info from '@lucide/svelte/icons/info';
  let { text, title = '', label = 'More about this', size = 16, align = 'left' }: {
    /** the explanation (plain sentences) */ text: string;
    /** optional bold first line */ title?: string;
    /** accessible name of the button */ label?: string;
    size?: number;
    /** which edge of the button the popover lines up with */ align?: 'left' | 'right';
  } = $props();
  const uid = $props.id();
  let open = $state(false);
  let el = $state<HTMLSpanElement>();
  let btn = $state<HTMLButtonElement>();
  $effect(() => {
    if (!open) return;
    const away = (e: Event) => { if (el && !el.contains(e.target as Node)) open = false; };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { open = false; btn?.focus(); } };
    document.addEventListener('pointerdown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  });
</script>

<span class="tip" bind:this={el}>
  <button bind:this={btn} type="button" class="ibtn" aria-expanded={open} aria-controls="{uid}-pop" aria-label={label} onclick={() => (open = !open)}><Info {size} aria-hidden="true" /></button>
  {#if open}<span class="pop" class:right={align === 'right'} id="{uid}-pop" role="note">{#if title}<strong>{title}</strong>{/if}<span>{text}</span></span>{/if}
</span>

<style>
  .tip { position: relative; display: inline-flex; vertical-align: middle; }
  .ibtn { display: grid; place-items: center; width: 28px; height: 28px; margin: -4px 0; border-radius: var(--radius-full); border: 0; background: none; color: var(--text-subtle); cursor: pointer; }
  .ibtn:hover, .ibtn[aria-expanded='true'] { color: var(--text); background: var(--surface-sunken); }
  .ibtn:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 1px; }
  .pop { position: absolute; left: 0; top: calc(100% + 6px); z-index: 40; display: flex; flex-direction: column; gap: 4px; width: max-content; max-width: min(320px, calc(100vw - 32px));
    background: var(--surface-raised); color: var(--text); border: 1px solid var(--border); border-radius: var(--radius-md); box-shadow: var(--elevation-2);
    padding: var(--space-3); font: 400 var(--fs-body-sm) / var(--lh-body-sm) var(--ff-body); text-transform: none; letter-spacing: 0; white-space: normal; text-align: left; }
  .pop.right { left: auto; right: 0; }
</style>
