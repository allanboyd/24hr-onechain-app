<script lang="ts">
  // Pull down at the top of a screen to refresh it (the screen registers what refresh means via onRefresh()).
  import RefreshCw from '@lucide/svelte/icons/refresh-cw';
  import { refreshNow } from '../load.svelte';
  import { haptic } from '../../native';
  const TRIGGER = 72;
  let y0 = -1, pull = $state(0), busy = $state(false), armed = false;
  function start(e: TouchEvent) { y0 = scrollY <= 0 && !busy ? e.touches[0].clientY : -1; armed = false; }
  function move(e: TouchEvent) {
    if (y0 < 0) return;
    const dy = e.touches[0].clientY - y0;
    pull = dy > 0 ? Math.min(110, dy * 0.5) : 0;
    if (pull >= TRIGGER && !armed) { armed = true; haptic('tap'); }
  }
  async function end() {
    if (y0 < 0) return; y0 = -1;
    if (pull >= TRIGGER) { busy = true; pull = TRIGGER - 16; try { await refreshNow(); } finally { busy = false; pull = 0; } }
    else pull = 0;
  }
</script>
<svelte:window ontouchstart={start} ontouchmove={move} ontouchend={end} ontouchcancel={end} />
<div class="ptr" class:busy style:transform="translate(-50%, {pull}px)" style:opacity={pull ? Math.min(1, pull / TRIGGER) : 0} aria-hidden={!busy} role="status" aria-label={busy ? 'Refreshing' : undefined}>
  <span style:transform="rotate({pull * 4}deg)"><RefreshCw size={20} /></span>
</div>
<style>
  .ptr { position: fixed; z-index: 29; top: calc(env(safe-area-inset-top) + var(--t-bar) - 32px); left: 50%; width: 40px; height: 40px; border-radius: 50%; background: var(--surface); box-shadow: var(--elevation-2); display: grid; place-items: center; color: var(--t-accent); pointer-events: none; transition: opacity var(--motion-fast); }
  .ptr:not(.busy) { transition: transform 0ms, opacity var(--motion-fast); }
  span { display: grid; }
  .busy span { animation: spin .8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
