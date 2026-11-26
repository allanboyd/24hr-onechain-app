<script lang="ts">
  // V3-6: a bottom sheet for phones (More, Search, Filters): slides up, a grab handle, closes on the backdrop, Escape or
  // a swipe down on the handle. Focus moves into the sheet and back to the opener.
  import type { Snippet } from 'svelte';
  let { open = $bindable(false), label, children, full = false }: { open?: boolean; label: string; children: Snippet; full?: boolean } = $props();
  let el = $state<HTMLDivElement>();
  let startY = 0, dy = $state(0);
  $effect(() => { if (open) { const prev = document.activeElement as HTMLElement | null; queueMicrotask(() => el?.querySelector<HTMLElement>('input, button, a')?.focus()); const k = (e: KeyboardEvent) => { if (e.key === 'Escape') open = false; }; addEventListener('keydown', k); document.body.style.overflow = 'hidden'; return () => { removeEventListener('keydown', k); document.body.style.overflow = ''; prev?.focus?.(); }; } });
</script>

{#if open}
  <button class="bd" aria-label="Close" onclick={() => (open = false)}></button>
  <div class="sh" class:full bind:this={el} role="dialog" aria-modal="true" aria-label={label} style:transform={dy > 0 ? `translateY(${dy}px)` : undefined}>
    <div class="grab" role="presentation" ontouchstart={(e) => { startY = e.touches[0].clientY; }} ontouchmove={(e) => { dy = Math.max(0, e.touches[0].clientY - startY); }} ontouchend={() => { if (dy > 80) open = false; dy = 0; }}><span></span></div>
    {@render children()}
  </div>
{/if}

<style>
  .bd { all: unset; position: fixed; inset: 0; z-index: 70; background: rgb(4 21 43 / .45); animation: fade .2s; }
  .sh { position: fixed; left: 0; right: 0; bottom: 0; z-index: 71; max-height: 86vh; overflow-y: auto; background: var(--surface); border-radius: 20px 20px 0 0; padding: 0 16px calc(16px + env(safe-area-inset-bottom)); box-shadow: 0 -10px 40px rgb(0 0 0 / .2); animation: up .25s var(--motion-easing, ease); }
  .sh.full { top: 8vh; max-height: none; }
  .grab { position: sticky; top: 0; display: grid; place-items: center; padding: 10px 0 8px; background: var(--surface); z-index: 1; }
  .grab span { width: 40px; height: 4px; border-radius: 2px; background: var(--border-strong, var(--border)); }
  @keyframes up { from { transform: translateY(100%); } } @keyframes fade { from { opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .sh, .bd { animation: none; } }
</style>
