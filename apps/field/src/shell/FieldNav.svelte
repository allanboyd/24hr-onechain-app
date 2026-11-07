<script lang="ts">
  // Three tabs for field roles (docs: Now = the job, List = the day's set, Me = identity / sync).
  import type { Component } from 'svelte';
  let { tabs, active }: { tabs: { id: string; short: string; path: string; icon: Component }[]; active: string } = $props();
</script>

<nav class="nav" aria-label="Main">
  {#each tabs as t (t.id)}
    {@const Icon = t.icon}
    <a href="#{t.path}" class="tab" class:on={active === t.id} aria-current={active === t.id ? 'page' : undefined}>
      <span class="pill"><Icon size={22} strokeWidth={active === t.id ? 2.4 : 2} /></span>
      <span class="lbl">{t.short}</span>
    </a>
  {/each}
</nav>

<style>
  .nav { position: fixed; z-index: 40; left: 0; right: 0; bottom: 0; display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; padding: 6px 6px calc(6px + env(safe-area-inset-bottom));
    background: color-mix(in srgb, var(--surface) 90%, transparent); backdrop-filter: saturate(1.6) blur(16px); -webkit-backdrop-filter: saturate(1.6) blur(16px); border-top: 1px solid var(--border); box-shadow: 0 -10px 30px -22px rgb(6 41 83 / .45); }
  .tab { display: flex; flex-direction: column; align-items: center; gap: 4px; min-height: 56px; padding-top: 4px; color: var(--text-muted); text-decoration: none; -webkit-tap-highlight-color: transparent; }
  .pill { position: relative; width: 60px; height: 32px; border-radius: 16px; display: grid; place-items: center; transition: background var(--motion-base) var(--motion-easing), transform var(--motion-fast); }
  .tab:active .pill { transform: scale(.92); }
  .lbl { font: 600 12px/14px var(--ff-body); letter-spacing: .01em; }
  .on { color: var(--text); }
  .on .pill { background: color-mix(in srgb, var(--accent) 18%, transparent); color: var(--text); }
  .on .lbl { font-weight: 800; }
</style>
