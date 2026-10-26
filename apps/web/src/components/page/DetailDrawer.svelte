<script lang="ts">
  // Record detail beside the list (docs/17 §3 "Shared page layout" 5): a right-side drawer on desktop, a full-screen
  // sheet on phones. Built on a modal <dialog>: the page behind is inert (focus stays inside), Esc closes, focus returns
  // to whatever opened it. Bind `open`; `onclose` runs on every close (Esc, ✕, backdrop click).
  import type { Snippet } from 'svelte';
  import X from '@lucide/svelte/icons/x';
  let { open = $bindable(false), title, subtitle = '', width = 480, onclose, header, footer, children }: {
    open?: boolean;
    title: string;
    subtitle?: string;
    /** desktop width in px */ width?: number;
    onclose?: () => void;
    /** extra header content under the title (status badges) */ header?: Snippet;
    /** sticky footer (actions) */ footer?: Snippet;
    children: Snippet;
  } = $props();
  const uid = $props.id();
  let dlg = $state<HTMLDialogElement>();
  let opener: HTMLElement | null = null;

  $effect(() => {
    if (!dlg) return;
    if (open && !dlg.open) { opener = document.activeElement as HTMLElement | null; dlg.showModal(); }
    else if (!open && dlg.open) dlg.close();
  });
  function closed() {
    open = false;
    onclose?.();
    opener?.focus?.(); opener = null;
  }
  // a click on the backdrop (outside the panel) closes
  const backdrop = (e: MouseEvent) => { if (e.target === dlg) dlg?.close(); };
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog class="drawer" bind:this={dlg} aria-labelledby="{uid}-t" style:--w="{width}px" onclose={closed} onclick={backdrop}>
  <div class="panel">
    <header>
      <div class="ttl">
        <h2 id="{uid}-t">{title}</h2>
        {#if subtitle}<p class="caption">{subtitle}</p>{/if}
        {#if header}<div class="hx">{@render header()}</div>{/if}
      </div>
      <button type="button" class="x" aria-label="Close" onclick={() => dlg?.close()}><X size={20} aria-hidden="true" /></button>
    </header>
    <div class="body">{@render children()}</div>
    {#if footer}<footer>{@render footer()}</footer>{/if}
  </div>
</dialog>

<style>
  .drawer { margin: 0 0 0 auto; padding: 0; border: 0; height: 100dvh; max-height: 100dvh; width: min(var(--w), 100vw); max-width: 100vw;
    background: var(--surface-raised); color: var(--text); box-shadow: var(--elevation-3); border-left: 1px solid var(--border); }
  .drawer[open] { animation: slide var(--motion-base, .2s) var(--motion-easing, ease-out); }
  .drawer::backdrop { background: rgb(4 21 43 / .45); }
  .panel { display: flex; flex-direction: column; height: 100%; }
  header { display: flex; align-items: flex-start; gap: var(--space-3); padding: var(--space-4) var(--space-5); border-bottom: 1px solid var(--border); }
  .ttl { flex: 1; min-width: 0; }
  h2 { margin: 0; font-size: var(--fs-h3); line-height: var(--lh-h3); overflow-wrap: anywhere; }
  .ttl .caption { margin: 2px 0 0; }
  .hx { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-2); }
  .x { display: grid; place-items: center; flex: none; width: 40px; height: 40px; margin: -6px -10px 0 0; border: 0; border-radius: var(--radius-full); background: none; color: var(--text-muted); cursor: pointer; }
  .x:hover { background: var(--surface-sunken); color: var(--text); }
  .x:focus-visible { outline: 2px solid var(--focus-ring); }
  .body { flex: 1; overflow-y: auto; padding: var(--space-4) var(--space-5); overscroll-behavior: contain; }
  footer { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--space-2); padding: var(--space-3) var(--space-5); border-top: 1px solid var(--border); background: var(--surface); }
  @keyframes slide { from { transform: translateX(24px); opacity: 0; } }
  @media (max-width: 600px) {
    .drawer { width: 100vw; border-left: 0; }
    .drawer[open] { animation-name: rise; }
    header, .body { padding-left: var(--space-4); padding-right: var(--space-4); }
    footer { padding: var(--space-3) var(--space-4) calc(var(--space-3) + env(safe-area-inset-bottom)); }
    footer :global(.btn) { flex: 1; }
  }
  @keyframes rise { from { transform: translateY(24px); opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .drawer[open] { animation: none; } }
</style>
