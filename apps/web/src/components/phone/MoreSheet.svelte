<script lang="ts">
  // V3-6: More (phone): who I am (opens Profile), Operations | Management, the company, every menu entry as a tile,
  // the theme, and Sign out. Theme and sign-out moved here from the top bar (decided 26 Nov).
  import type { User } from '@btw/api';
  import { router } from '@btw/ui';
  import Sheet from './Sheet.svelte';
  import CompanySwitcher from '../CompanySwitcher.svelte';
  import { navFor, sideOf, canSeeManagement } from '../../routes';
  import { theme, type Theme } from '../../lib/theme.svelte';
  import { signOut } from '../../lib/session.svelte';
  import { roleText } from '../../lib/roles';
  import LogOut from '@lucide/svelte/icons/log-out';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  let { open = $bindable(false), user }: { open?: boolean; user: User } = $props();
  const side = $derived(sideOf(router.path));
  const items = $derived(navFor(user, side).flatMap((g) => g.items));
  const initials = $derived(user.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase());
  const themes: { v: Theme; label: string }[] = [{ v: '', label: 'Device' }, { v: 'light', label: 'Light' }, { v: 'dark', label: 'Dark' }];
  const close = () => (open = false);
  // a tap on any link inside the sheet closes it
  function onclick(e: MouseEvent) { if ((e.target as HTMLElement).closest('a')) close(); }
</script>

<Sheet bind:open label="More">
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="more" {onclick}>
    <a class="me" href="#/system/profile"><span class="av" aria-hidden="true">{initials}</span><span class="who"><strong>{user.name}</strong><span class="caption">{roleText(user.roles)} · My profile</span></span><ChevronRight size={18} aria-hidden="true" /></a>
    {#if canSeeManagement(user)}
      <div class="seg" role="group" aria-label="Operations or management">
        <a href="#/" class:on={side === 'operations'} aria-current={side === 'operations' ? 'true' : undefined}>Operations</a>
        <a href="#/management/overview" class:on={side === 'management'} aria-current={side === 'management' ? 'true' : undefined}>Management</a>
      </div>
    {/if}
    <div class="co"><CompanySwitcher {user} /></div>
    <div class="tiles">
      {#each items as it, i (it.href + i)}{@const I = it.icon}
        <a href={it.href}><span class="ti"><I size={20} aria-hidden="true" /></span><span>{it.label}</span></a>
      {/each}
    </div>
    <div class="row-t"><span>Theme</span>
      <div class="seg small" role="radiogroup" aria-label="Theme">{#each themes as t (t.v)}<button type="button" role="radio" aria-checked={theme.value === t.v} class:on={theme.value === t.v} onclick={() => (theme.value = t.v)}>{t.label}</button>{/each}</div>
    </div>
    <button type="button" class="out" onclick={() => { close(); signOut(); }}><LogOut size={18} aria-hidden="true" />Sign out</button>
  </div>
</Sheet>

<style>
  .more { display: flex; flex-direction: column; gap: 14px; padding-top: 4px; }
  .me { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 14px; background: var(--surface-sunken); color: var(--text); text-decoration: none; }
  .me .who { display: flex; flex-direction: column; flex: 1; min-width: 0; }
  .av { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; background: var(--primary); color: var(--text-on-primary, #fff); font: 700 14px/1 var(--ff-body); }
  .seg { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 2px; padding: 3px; border-radius: 12px; background: var(--surface-sunken); }
  .seg a, .seg button { all: unset; box-sizing: border-box; text-align: center; padding: 8px; border-radius: 9px; font-size: 14px; font-weight: 600; color: var(--text-muted); cursor: pointer; }
  .seg .on { background: var(--surface); color: var(--text); box-shadow: 0 1px 2px rgb(0 0 0 / .1); }
  .seg.small { width: 220px; } .seg.small button { padding: 6px; font-size: 13px; }
  .tiles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
  .tiles a { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 12px 6px; border-radius: 14px; border: 1px solid var(--border); color: var(--text); text-decoration: none; font-size: 12.5px; font-weight: 600; text-align: center; }
  .tiles a:active { background: var(--surface-sunken); }
  .ti { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 12px; background: var(--primary-subtle); color: var(--primary); }
  .row-t { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-weight: 600; font-size: 14px; }
  .out { all: unset; box-sizing: border-box; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 12px; border-radius: 12px; border: 1px solid var(--border); color: var(--danger); font-weight: 600; cursor: pointer; }
</style>
