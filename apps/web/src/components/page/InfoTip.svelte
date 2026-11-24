<script lang="ts">
  // Icon button with a small popover. Info holds the extra detail. Alert holds the recommendation.
  // Click toggles; Esc or a click outside closes and returns focus to the button.
  import Info from '@lucide/svelte/icons/info';
  import CircleAlert from '@lucide/svelte/icons/circle-alert';
  let { text = '', lines = [], title = '', label = 'More about this', size = 16, align = 'left', kind = 'info', mark = false }: {
    /** the explanation (plain sentences) */ text?: string;
    /** one line each, when the note has several facts */ lines?: string[];
    /** optional bold first line */ title?: string;
    /** accessible name of the button */ label?: string;
    size?: number;
    /** which edge of the button the popover lines up with */ align?: 'left' | 'right';
    /** info = extra detail, alert = recommendation */ kind?: 'info' | 'alert';
    /** amber dot, used when the figures are old */ mark?: boolean;
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
  <button bind:this={btn} type="button" class="ibtn" class:alert={kind === 'alert'} class:mark aria-expanded={open} aria-controls="{uid}-pop" aria-label={label} onclick={() => (open = !open)}>
    {#if kind === 'alert'}<CircleAlert {size} aria-hidden="true" />{:else}<Info {size} aria-hidden="true" />{/if}
  </button>
  {#if open}<span class="pop" class:right={align === 'right'} id="{uid}-pop" role="note">{#if title}<strong>{title}</strong>{/if}{#if lines.length}{#each lines as line}<span>{line}</span>{/each}{:else}<span>{text}</span>{/if}</span>{/if}
</span>

<style>
  .tip { position: relative; display: inline-flex; flex: none; vertical-align: middle; }
  .ibtn { position: relative; display: grid; place-items: center; width: 28px; height: 28px; margin: 0; border-radius: var(--radius-full); border: 0; background: none; color: var(--text-subtle); cursor: pointer; }
  .ibtn:hover, .ibtn[aria-expanded='true'] { color: var(--text); background: var(--surface-sunken); }
  .ibtn.alert { color: var(--warning); }
  .ibtn.alert:hover, .ibtn.alert[aria-expanded='true'] { color: var(--warning); background: var(--warning-subtle); }
  .ibtn.mark::after { content: ''; position: absolute; top: 5px; right: 5px; width: 6px; height: 6px; border-radius: 50%; background: var(--warning); }
  .ibtn:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 1px; }
  .pop { position: absolute; left: 0; top: calc(100% + 6px); z-index: 40; display: flex; flex-direction: column; gap: 4px; width: max-content; max-width: min(320px, calc(100vw - 32px));
    background: var(--surface-raised); color: var(--text); border: 1px solid var(--border); border-radius: var(--radius-md); box-shadow: var(--elevation-2);
    padding: var(--space-3); font: 400 var(--fs-body-sm) / var(--lh-body-sm) var(--ff-body); text-transform: none; letter-spacing: 0; white-space: normal; text-align: left; }
  .pop.right { left: auto; right: 0; }
</style>
