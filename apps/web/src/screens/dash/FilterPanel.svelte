<script lang="ts">
  import type { Snippet } from 'svelte';
  import X from '@lucide/svelte/icons/x';

  let {
    open = $bindable(false),
    title = 'Filters',
    onApply,
    onClear,
    children,
  }: {
    open?: boolean;
    title?: string;
    onApply?: () => void;
    onClear?: () => void;
    children?: Snippet;
  } = $props();

  const uid = $props.id();
  let dlg = $state<HTMLDialogElement>();
  let opener: HTMLElement | null = null;

  $effect(() => {
    if (!dlg) return;
    if (open && !dlg.open) {
      opener = document.activeElement as HTMLElement | null;
      dlg.showModal();
    } else if (!open && dlg.open) dlg.close();
  });

  function closed() {
    open = false;
    opener?.focus?.();
    opener = null;
  }

  const backdrop = (e: MouseEvent) => {
    if (e.target === dlg) dlg?.close();
  };

  function apply() {
    onApply?.();
    dlg?.close();
  }

  function clear() {
    onClear?.();
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog
  class="overlay"
  bind:this={dlg}
  aria-labelledby="{uid}-t"
  onclose={closed}
  onclick={backdrop}
>
  <div class="panel">
    <header>
      <h2 id="{uid}-t">{title}</h2>
      <button type="button" class="close" aria-label="Close filters" onclick={() => dlg?.close()}>
        <X size={20} aria-hidden="true" />
      </button>
    </header>
    <div class="body">{@render children?.()}</div>
    <footer>
      {#if onClear}
        <button type="button" class="btn btn-ghost" onclick={clear}>Clear</button>
      {/if}
      <button type="button" class="btn btn-primary" onclick={apply}>Apply</button>
    </footer>
  </div>
</dialog>

<style>
  .overlay {
    margin: auto;
    padding: 0;
    border: 0;
    max-width: min(520px, calc(100vw - var(--space-6)));
    width: 100%;
    background: transparent;
    color: var(--text);
  }
  .overlay::backdrop {
    background: rgb(4 21 43 / 0.45);
  }
  .overlay[open] .panel {
    animation: in var(--motion-base, 0.2s) var(--motion-easing, ease-out);
  }
  .panel {
    display: flex;
    flex-direction: column;
    max-height: min(85dvh, 640px);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    box-shadow: var(--elevation-3);
    overflow: hidden;
  }
  header {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-5);
    border-bottom: 1px solid var(--border);
    background: var(--surface-raised);
  }
  h2 {
    margin: 0;
    flex: 1;
    font-size: var(--fs-h3);
    line-height: var(--lh-h3);
  }
  .close {
    display: grid;
    place-items: center;
    flex: none;
    width: 40px;
    height: 40px;
    margin: -6px -10px -6px 0;
    border: 0;
    border-radius: var(--radius-full);
    background: none;
    color: var(--text-muted);
    cursor: pointer;
  }
  .close:hover {
    background: var(--surface-sunken);
    color: var(--text);
  }
  .close:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }
  .body {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-4) var(--space-5);
    overscroll-behavior: contain;
  }
  footer {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-5);
    border-top: 1px solid var(--border);
    background: var(--surface);
  }
  @keyframes in {
    from {
      transform: translateY(12px) scale(0.98);
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .overlay[open] .panel {
      animation: none;
    }
  }
</style>