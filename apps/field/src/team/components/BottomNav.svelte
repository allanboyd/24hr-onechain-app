<script lang="ts">
  // Bottom navigation: 4–5 role tabs, big targets, pill indicator in the company accent, safe-area aware.
  import type { Section, SectionId } from '../access';
  import { ICONS } from '../icons';
  let { tabs, active, badges = {} }: { tabs: Section[]; active: SectionId; badges?: Partial<Record<SectionId, number>> } = $props();
</script>

<nav class="nav" aria-label="Main">
  {#each tabs as t (t.id)}
    {@const Icon = ICONS[t.id]}
    <a href="#{t.path}" class="tab" class:on={active === t.id} aria-current={active === t.id ? 'page' : undefined}>
      <span class="pill"><Icon size={22} strokeWidth={active === t.id ? 2.4 : 2} />{#if badges[t.id]}<span class="badge">{badges[t.id]}</span>{/if}</span>
      <span class="lbl">{t.short}</span>
    </a>
  {/each}
</nav>

<style>
  .nav { position: fixed; z-index: 30; left: 0; right: 0; bottom: 0; display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; padding: 6px 6px calc(6px + env(safe-area-inset-bottom));
    background: color-mix(in srgb, var(--surface) 90%, transparent); backdrop-filter: saturate(1.6) blur(16px); -webkit-backdrop-filter: saturate(1.6) blur(16px); border-top: 1px solid var(--t-line); box-shadow: 0 -10px 30px -22px rgb(6 41 83 / .45); }
  .tab { display: flex; flex-direction: column; align-items: center; gap: 4px; min-height: 56px; padding-top: 4px; color: var(--text-muted); text-decoration: none; -webkit-tap-highlight-color: transparent; }
  .pill { position: relative; width: 60px; height: 32px; border-radius: 16px; display: grid; place-items: center; transition: background var(--motion-base) var(--motion-easing), transform var(--motion-fast); }
  .tab:active .pill { transform: scale(.92); }
  .lbl { font: 600 12px/14px var(--ff-body); letter-spacing: .01em; }
  .on { color: var(--text); }
  .on .pill { background: color-mix(in srgb, var(--t-accent) 18%, transparent); color: var(--text); }
  .on .lbl { font-weight: 800; }
  .badge { position: absolute; top: -2px; right: 8px; min-width: 18px; height: 18px; border-radius: 9px; background: var(--danger-solid); color: var(--text-on-danger); font: 700 11px/18px var(--ff-body); padding: 0 5px; box-shadow: 0 0 0 2px var(--surface); }
  @media (min-width: 720px) { .nav { left: 50%; right: auto; transform: translateX(-50%); width: 560px; bottom: 12px; border-radius: 24px; border: 1px solid var(--t-line); padding-bottom: 6px; } }
</style>
