<script lang="ts">
  // Company select in the sidebar (design v3, docs/work/plans/V3-1b.md SB-3). Shown when the user can see more than one
  // company; directors/admins also get "Group · all companies". A button opens a listbox: ↑ ↓ Home End move, Enter picks,
  // Esc / Tab / a click outside close, and focus goes back to the button. `compact` = the collapsed sidebar rail.
  import type { User } from '@btw/api';
  import { companyBrand, allCompanies, companyLabel } from '../lib/companies';
  import { company, GROUP, allowedIds, canGroup, setCompany } from '../lib/company.svelte';
  import CompanyMark from './CompanyMark.svelte';
  import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
  import Check from '@lucide/svelte/icons/check';
  let { user, compact = false }: { user: User; compact?: boolean } = $props();

  const ids = $derived(allowedIds(user));
  const companies = $derived(allCompanies().filter((c) => ids.includes(c.id)));
  const group = $derived(canGroup(user));
  const show = $derived(companies.length > 1 || group);
  const current = $derived(company.active === GROUP ? null : companyBrand(company.active));
  type Opt = { id: string; name: string; hint: string };
  const options = $derived<Opt[]>([
    ...(group ? [{ id: GROUP, name: 'Group', hint: 'All companies' }] : []),
    ...companies.map((c) => ({ id: c.id, name: c.shortName, hint: `${c.name} · ${companyLabel(c.id)}` })),
  ]);

  const uid = `cs-${Math.random().toString(36).slice(2, 7)}`;
  let open = $state(false);
  let activeIx = $state(0);
  let button = $state<HTMLButtonElement>();
  let list = $state<HTMLUListElement>();
  let root = $state<HTMLDivElement>();

  function openList() {
    activeIx = Math.max(0, options.findIndex((o) => o.id === company.active));
    open = true;
    queueMicrotask(() => list?.focus());
  }
  function close(focusButton = true) { open = false; if (focusButton) button?.focus(); }
  function pick(o: Opt) { if (o.id !== company.active) setCompany(user, o.id); close(); }
  function onButtonKey(e: KeyboardEvent) {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); openList(); }
  }
  function onListKey(e: KeyboardEvent) {
    const last = options.length - 1;
    if (e.key === 'ArrowDown') activeIx = Math.min(last, activeIx + 1);
    else if (e.key === 'ArrowUp') activeIx = Math.max(0, activeIx - 1);
    else if (e.key === 'Home') activeIx = 0;
    else if (e.key === 'End') activeIx = last;
    else if (e.key === 'Enter' || e.key === ' ') pick(options[activeIx]);
    else if (e.key === 'Escape') close();
    else if (e.key === 'Tab') { close(false); return; }
    else return;
    e.preventDefault();
  }
  $effect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (root && !root.contains(e.target as Node)) close(false); };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  });
</script>

{#if show}
  <div class="cs" class:compact bind:this={root}>
    <button bind:this={button} type="button" class="face" aria-haspopup="listbox" aria-expanded={open} aria-controls="{uid}-list"
      aria-label="Company: {current ? current.name : 'Group, all companies'}. Change company" title={compact ? (current?.shortName ?? 'Group') : undefined}
      onclick={() => (open ? close() : openList())} onkeydown={onButtonKey}>
      <CompanyMark entityId={current?.id ?? null} size={compact ? 28 : 26} />
      {#if !compact}
        <span class="txt"><span class="cap">Company</span><strong>{current ? current.shortName : 'Group'}</strong></span>
        <ChevronsUpDown size={16} aria-hidden="true" />
      {/if}
    </button>
    {#if open}
      <ul bind:this={list} id="{uid}-list" class="pop" role="listbox" tabindex="-1" aria-label="Companies"
        aria-activedescendant="{uid}-o{activeIx}" onkeydown={onListKey}>
        {#each options as o, i (o.id)}
          <!-- svelte-ignore a11y_click_events_have_key_events (the listbox handles the keys) -->
          <li id="{uid}-o{i}" role="option" aria-selected={o.id === company.active} class:act={i === activeIx}
            onclick={() => pick(o)} onpointermove={() => (activeIx = i)}>
            <CompanyMark entityId={o.id === GROUP ? null : o.id} size={24} />
            <span class="txt"><strong>{o.name}</strong><span class="cap">{o.hint}</span></span>
            {#if o.id === company.active}<Check size={16} aria-hidden="true" />{/if}
          </li>
        {/each}
      </ul>
    {/if}
  </div>
{:else if current}
  <div class="cs fixed" class:compact><CompanyMark entityId={current.id} size={26} />{#if !compact}<strong>{current.shortName}</strong>{/if}</div>
{/if}

<style>
  .cs { position: relative; margin: 0 var(--space-3) var(--space-3); }
  .face { width: 100%; display: flex; align-items: center; gap: var(--space-2); padding: 7px 10px; border: 1px solid var(--nav-line); border-radius: 12px; background: var(--nav-raised); color: var(--nav-strong); cursor: pointer; font: inherit; text-align: left; transition: background var(--motion-fast) var(--motion-easing), border-color var(--motion-fast) var(--motion-easing); }
  .face:hover, .face[aria-expanded='true'] { background: var(--nav-active-bg); border-color: var(--nav-text-muted); }
  .face :global(svg) { margin-left: auto; color: var(--nav-text-muted); flex: none; }
  .txt { display: flex; flex-direction: column; min-width: 0; line-height: 1.2; }
  .txt strong { font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cap { font-size: 11px; color: var(--nav-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pop { position: absolute; left: 0; right: 0; top: calc(100% + 6px); z-index: 60; margin: 0; padding: 6px; list-style: none; background: var(--surface-raised); color: var(--text); border: 1px solid var(--border); border-radius: 12px; box-shadow: var(--elevation-3); outline: none; animation: pop var(--motion-fast) var(--motion-easing); transform-origin: top; }
  .pop li { display: flex; align-items: center; gap: var(--space-2); padding: 8px 10px; border-radius: 8px; cursor: pointer; }
  .pop li.act { background: var(--surface-sunken); }
  .pop li[aria-selected='true'] strong { color: var(--link); }
  .pop li :global(svg) { margin-left: auto; color: var(--link); flex: none; }
  .pop .cap { color: var(--text-muted); }
  .compact { margin-inline: auto; width: max-content; }
  .compact .face { width: auto; padding: 6px; border-radius: 10px; }
  .compact .pop { left: calc(100% + 10px); right: auto; top: 0; width: 260px; transform-origin: left top; }
  .fixed { display: flex; align-items: center; gap: var(--space-2); color: var(--nav-strong); padding: 7px 10px; }
  @keyframes pop { from { opacity: 0; transform: translateY(-4px) scale(.98); } to { opacity: 1; transform: none; } }
</style>
