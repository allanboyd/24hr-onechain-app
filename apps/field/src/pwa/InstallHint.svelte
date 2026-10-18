<script lang="ts">
  // "Add to home screen" card, first visit in a browser only (lazy chunk). Android/Chrome: real Install button;
  // iPhone/iPad: Safari's Share → Add to Home Screen steps. Dismissed once = never again on this browser.
  import { dismissHint, installPrompt, isIos } from './index';
  import X from '@lucide/svelte/icons/x';
  import Share from '@lucide/svelte/icons/share';
  import SquarePlus from '@lucide/svelte/icons/square-plus';
  import Download from '@lucide/svelte/icons/download';
  let { onclose }: { onclose: () => void } = $props();
  const ios = isIos();
  let prompt = $state(installPrompt);
  // The browser may fire its install event a moment after the page loads.
  $effect(() => { const t = setInterval(() => { if (installPrompt && !prompt) prompt = installPrompt; }, 500); return () => clearInterval(t); });
  function close() { dismissHint(); onclose(); }
  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    const r = await prompt.userChoice.catch(() => null);
    if (r?.outcome === 'accepted') close();
  }
</script>

<div class="hint" role="dialog" aria-label="Install the app">
  <img src="./icons/icon-192.png" alt="" width="48" height="48" />
  <div class="grow">
    <strong>Put BTW Team on your home screen</strong>
    {#if prompt}
      <p>Opens full screen like an app, works with a weak signal.</p>
    {:else if ios}
      <p>Tap <Share size={16} aria-label="Share" /> <b>Share</b>, then <SquarePlus size={16} aria-hidden="true" /> <b>Add to Home Screen</b>.</p>
    {:else}
      <p>Open your browser menu <b>⋮</b> and choose <b>Install app</b> or <b>Add to Home screen</b>.</p>
    {/if}
    {#if prompt}<button class="btn btn-accent install" onclick={install}><Download size={18} />Install</button>{/if}
  </div>
  <button class="x" aria-label="Not now" onclick={close}><X size={20} /></button>
</div>

<style>
  .hint { position: fixed; z-index: 70; left: 12px; right: 12px; bottom: calc(12px + env(safe-area-inset-bottom)); max-width: 480px; margin: 0 auto; display: flex; gap: 12px; align-items: flex-start;
    padding: 14px 10px 14px 14px; border-radius: 20px; background: var(--surface-raised); color: var(--text); border: 1px solid var(--border); box-shadow: 0 18px 40px -12px rgb(4 21 43 / .45); animation: rise 320ms var(--motion-easing); }
  img { border-radius: 12px; flex: none; }
  strong { font: 700 16px/22px var(--ff-display); display: block; }
  p { margin: 4px 0 0; font-size: 14px; line-height: 20px; color: var(--text-muted); }
  p :global(svg) { vertical-align: -3px; }
  .install { margin-top: 10px; min-height: 44px; border-radius: 12px; }
  .x { flex: none; width: 44px; height: 44px; margin: -8px 0 0; border: 0; border-radius: 50%; background: transparent; color: var(--text-muted); display: grid; place-items: center; cursor: pointer; }
  @keyframes rise { from { transform: translateY(24px); opacity: 0; } }
</style>
