<script lang="ts">
  // Side drawer: who I am · every section my role may open · company · theme · full web app · sign out.
  import { demo, mode, type User } from '@btw/api';
  import { say } from '@btw/ui';
  import X from '@lucide/svelte/icons/x';
  import Moon from '@lucide/svelte/icons/moon';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import LogOut from '@lucide/svelte/icons/log-out';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import { roleLabel, sectionsFor, type SectionId } from '../access';
  import { ICONS } from '../icons';
  import { activeBrand, co, groupMark, shortName } from '../company.svelte';
  import { webLink } from '../web';
  import { APP_VERSION } from '../../lib';
  import { theme } from '../theme.svelte';
  let { user, open, active, badges = {}, canSwitch, onclose, oncompany, onlogout }:
    { user: User; open: boolean; active: SectionId; badges?: Partial<Record<SectionId, number>>; canSwitch: boolean; onclose: () => void; oncompany: () => void; onlogout: () => void } = $props();
  const items = $derived(sectionsFor(user));
  const b = $derived((co.active, activeBrand()));
  let panel = $state<HTMLElement>();
  $effect(() => { if (open) panel?.focus(); });
  function key(e: KeyboardEvent) { if (open && e.key === 'Escape') onclose(); }
  // Swipe the drawer closed (left).
  let x0 = 0, dx = $state(0);
  function ts(e: TouchEvent) { x0 = e.touches[0].clientX; }
  function tm(e: TouchEvent) { dx = Math.min(0, e.touches[0].clientX - x0); }
  function te() { if (dx < -70) onclose(); dx = 0; }
</script>

<svelte:window onkeydown={key} />
<div class="scrim" class:open onclick={onclose} aria-hidden="true"></div>
<aside class="drawer" class:open bind:this={panel} tabindex="-1" aria-label="Menu" aria-hidden={!open} inert={!open}
  style:transform={open && dx ? `translateX(${dx}px)` : undefined} ontouchstart={ts} ontouchmove={tm} ontouchend={te}>
  <div class="head" style:--brand={b?.primary ?? '#062953'}>
    <div class="t-row between">
      <span class="logo">{#if b?.logo}<img src={b.logo} alt={b.name} />{:else if groupMark}<img src={groupMark} alt="Group" class="sq" />{/if}</span>
      <button class="x" aria-label="Close menu" onclick={onclose}><X size={22} /></button>
    </div>
    <div class="me">
      <span class="avatar" aria-hidden="true">{user.name.slice(0, 1)}</span>
      <div class="who"><strong>{user.name}</strong><span>{roleLabel(user)}</span></div>
    </div>
    {#if canSwitch}
      <button class="cosw" onclick={oncompany}><span>Working in <b>{b?.short ?? 'Group · all companies'}</b></span><ChevronRight size={18} /></button>
    {:else}
      <div class="cosw static"><span>Working in <b>{b?.short ?? shortName(co.active)}</b></span></div>
    {/if}
  </div>

  <nav class="items" aria-label="Sections">
    {#each items as s (s.id)}
      {@const Icon = ICONS[s.id]}
      <a href="#{s.path}" class="it" class:on={active === s.id} onclick={onclose} aria-current={active === s.id ? 'page' : undefined}>
        <Icon size={22} /><span class="grow">{s.label}</span>{#if badges[s.id]}<span class="n">{badges[s.id]}</span>{/if}
      </a>
    {/each}
  </nav>

  <div class="foot">
    <label class="it toggle"><Moon size={22} /><span class="grow">Dark mode</span><input type="checkbox" class="switch-input" checked={theme.dark} onchange={(e) => theme.set((e.currentTarget as HTMLInputElement).checked ? 'dark' : 'light')} /></label>
    <a class="it" href={webLink('/')} target="_blank" rel="noopener"><ExternalLink size={22} /><span class="grow">Open full web app</span></a>
    <button class="it" onclick={onlogout}><LogOut size={22} /><span class="grow">Sign out</span></button>
    <div class="ver"><span>BTW Team {APP_VERSION}</span>{#if mode === 'mock'}<button class="link" onclick={() => { demo.reset(); say('Demo data reset'); onclose(); }}>Reset demo data</button>{/if}</div>
  </div>
</aside>

<style>
  .scrim { position: fixed; inset: 0; z-index: 60; background: rgb(4 21 43 / .5); opacity: 0; pointer-events: none; transition: opacity var(--motion-slow) var(--motion-easing); }
  .scrim.open { opacity: 1; pointer-events: auto; }
  .drawer { position: fixed; z-index: 61; top: 0; bottom: 0; left: 0; width: min(86vw, 340px); background: var(--surface); color: var(--text); display: flex; flex-direction: column; overflow-y: auto; overscroll-behavior: contain;
    transform: translateX(-104%); transition: transform var(--motion-slow) var(--motion-easing); border-radius: 0 24px 24px 0; box-shadow: 0 0 40px rgb(4 21 43 / .35); outline: none; }
  .drawer.open { transform: translateX(0); }
  .head { background: linear-gradient(160deg, var(--brand), color-mix(in srgb, var(--brand) 70%, #000)); color: #fff; padding: calc(env(safe-area-inset-top) + 14px) 16px 16px; display: flex; flex-direction: column; gap: 14px; border-radius: 0 24px 0 0; }
  .logo { background: #fff; border-radius: 12px; padding: 6px 10px; display: inline-flex; height: 48px; align-items: center; }
  .logo img { height: 36px; width: auto; max-width: 180px; object-fit: contain; }
  .logo img.sq { height: 36px; width: 36px; }
  .x { width: 44px; height: 44px; border-radius: 50%; border: 0; background: rgb(255 255 255 / .14); color: #fff; display: grid; place-items: center; cursor: pointer; }
  .me { display: flex; align-items: center; gap: 12px; }
  .avatar { width: 48px; height: 48px; border-radius: 50%; display: grid; place-items: center; background: var(--t-accent); color: #fff; font: 800 20px var(--ff-display); flex: none; }
  .who { display: flex; flex-direction: column; min-width: 0; }
  .who strong { font: 700 17px/22px var(--ff-display); }
  .who span { opacity: .85; font-size: 14px; }
  .cosw { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; min-height: 44px; padding: 0 12px; border-radius: 12px; border: 0; background: rgb(255 255 255 / .14); color: #fff; font: 15px var(--ff-body); cursor: pointer; text-align: left; }
  .cosw.static { cursor: default; }
  .items { display: flex; flex-direction: column; padding: 10px 8px; gap: 2px; }
  .it { display: flex; align-items: center; gap: 14px; min-height: 52px; padding: 0 14px; border-radius: 14px; color: var(--text); text-decoration: none; font: 600 16px var(--ff-body); border: 0; background: none; cursor: pointer; width: 100%; text-align: left; }
  .it:active { background: var(--surface-sunken); }
  .it.on { background: color-mix(in srgb, var(--t-accent) 16%, transparent); }
  .it :global(svg) { color: var(--text-muted); flex: none; }
  .it.on :global(svg) { color: var(--text); }
  .n { min-width: 22px; height: 22px; border-radius: 11px; background: var(--danger-solid); color: var(--text-on-danger); font: 700 12px/22px var(--ff-body); text-align: center; padding: 0 6px; }
  .foot { margin-top: auto; border-top: 1px solid var(--border); padding: 8px 8px calc(env(safe-area-inset-bottom) + 12px); display: flex; flex-direction: column; gap: 2px; }
  .switch-input { appearance: none; -webkit-appearance: none; width: 52px; height: 32px; border-radius: 16px; background: var(--border-strong); position: relative; margin: 0; cursor: pointer; transition: background var(--motion-fast); flex: none; }
  .switch-input::after { content: ''; position: absolute; top: 3px; left: 3px; width: 26px; height: 26px; border-radius: 50%; background: #fff; box-shadow: var(--elevation-1); transition: transform var(--motion-fast) var(--motion-easing); }
  .switch-input:checked { background: var(--t-accent); }
  .switch-input:checked::after { transform: translateX(20px); }
  .ver { display: flex; justify-content: space-between; align-items: center; padding: 8px 14px 0; font-size: 13px; color: var(--text-subtle); }
  .link { border: 0; background: none; color: var(--link); font: 600 13px var(--ff-body); cursor: pointer; min-height: 36px; }
</style>
