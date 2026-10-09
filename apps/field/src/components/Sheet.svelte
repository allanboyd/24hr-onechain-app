<script lang="ts">
  // Bottom sheet. `modal` = slides over the screen with a backdrop (task sheets); otherwise it docks above the map.
  import type { Snippet } from 'svelte';
  import X from '@lucide/svelte/icons/x';
  let { children, modal = false, title = '', onclose, el = $bindable() }: { children: Snippet; modal?: boolean; title?: string; onclose?: () => void; el?: HTMLElement } = $props();
</script>
{#if modal}<button class="backdrop" aria-label="Close" onclick={onclose}></button>{/if}
<section class="sheet" class:modal bind:this={el} role={modal ? 'dialog' : undefined} aria-modal={modal || undefined} aria-label={title || undefined}>
  <div class="handle" aria-hidden="true"></div>
  {#if modal && title}
    <header><h2>{title}</h2>{#if onclose}<button class="close" aria-label="Close" onclick={onclose}><X size={22} /></button>{/if}</header>
  {/if}
  <div class="content">{@render children()}</div>
</section>
<style>
  .sheet { position: fixed; left: 0; right: 0; bottom: 0; z-index: 30; max-width: 560px; margin: 0 auto; background: var(--surface); color: var(--text); border-radius: 20px 20px 0 0; box-shadow: 0 -8px 24px -8px rgb(4 21 43 / .25); padding: 8px var(--space-5) calc(var(--space-5) + env(safe-area-inset-bottom)); max-height: 78dvh; display: flex; flex-direction: column; }
  .sheet.modal { z-index: 50; max-height: 92dvh; animation: up var(--motion-slow) var(--motion-easing); }
  .handle { width: 40px; height: 5px; border-radius: 3px; background: var(--border-strong); margin: 0 auto 10px; flex: none; }
  header { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-3); flex: none; }
  header h2 { flex: 1; font-size: var(--fs-h3); line-height: var(--lh-h3); }
  .close { width: 44px; height: 44px; border-radius: 50%; border: 0; background: var(--surface-sunken); color: var(--text); display: grid; place-items: center; cursor: pointer; }
  .content > :global(*) { flex-shrink: 0; }
  .content { overflow-y: auto; display: flex; flex-direction: column; gap: var(--space-4); overscroll-behavior: contain; }
  .backdrop { position: fixed; inset: 0; z-index: 45; border: 0; background: rgb(4 21 43 / .45); cursor: default; animation: fade var(--motion-base); }
  @keyframes up { from { transform: translateY(40px); opacity: 0; } }
  @keyframes fade { from { opacity: 0; } }
</style>
