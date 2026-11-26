<script lang="ts">
  // V3-6: the phone bottom bar: the role's four places and More (the full menu as a sheet). Hides while the keyboard is
  // open (typing in a form) and keeps clear of the phone's home bar (safe area).
  import { router } from '@btw/ui';
  import type { User } from '@btw/api';
  import { bottomFor } from '../../routes';
  import Menu from '@lucide/svelte/icons/layout-grid';
  let { user, unread = 0, onmore, moreOpen = false }: { user: User; unread?: number; onmore: () => void; moreOpen?: boolean } = $props();
  const places = $derived(bottomFor(user));
  let typing = $state(false);
  $effect(() => {
    const vv = window.visualViewport; if (!vv) return;
    const on = () => (typing = vv.height < window.innerHeight * 0.75);
    vv.addEventListener('resize', on); return () => vv.removeEventListener('resize', on);
  });
</script>

<nav class="bb" class:typing aria-label="Main places">
  {#each places as p (p.href)}{@const I = p.icon}{@const on = !moreOpen && p.match(router.path)}
    <a href={p.href} class:on aria-current={on ? 'page' : undefined}>
      <span class="ic"><I size={21} aria-hidden="true" />{#if p.badge === 'unread' && unread}<span class="badge" aria-label="{unread} unread">{unread > 99 ? '99+' : unread}</span>{/if}</span>
      <span class="lb">{p.label}</span>
    </a>
  {/each}
  <button type="button" class:on={moreOpen} aria-expanded={moreOpen} aria-haspopup="dialog" onclick={onmore}>
    <span class="ic"><Menu size={21} aria-hidden="true" /></span><span class="lb">More</span>
  </button>
</nav>

<style>
  .bb { position: fixed; left: 0; right: 0; bottom: 0; z-index: 60; display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; padding: 6px 6px calc(6px + env(safe-area-inset-bottom)); background: var(--surface); backdrop-filter: blur(12px); border-top: 1px solid var(--border); box-shadow: 0 -4px 16px rgb(0 0 0 / .06); transition: transform .2s var(--motion-easing, ease); }
  .bb.typing { transform: translateY(110%); }
  a, button { all: unset; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 4px 0; border-radius: 12px; color: var(--text-muted); cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .ic { position: relative; display: grid; place-items: center; width: 52px; height: 30px; border-radius: 99px; transition: background .15s; }
  .on { color: var(--primary); } .on .ic { background: var(--primary-subtle); }
  .lb { font-size: 11px; font-weight: 600; letter-spacing: .01em; }
  .badge { position: absolute; top: -2px; right: 6px; min-width: 17px; height: 17px; padding: 0 4px; border-radius: 9px; display: grid; place-items: center; background: var(--danger-solid, var(--danger)); color: #fff; font: 700 10px/1 var(--ff-body); border: 2px solid var(--surface); }
  a:focus-visible, button:focus-visible { outline: 2px solid var(--primary); outline-offset: -2px; }
</style>
