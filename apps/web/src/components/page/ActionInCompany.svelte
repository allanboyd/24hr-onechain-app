<script lang="ts">
  // One primary "create / record" button that knows about companies (docs/17 F6). Replaces the "Choose a company to
  // record …: BTW / NUD / Kivu" rows that RecordFor shows in Group view.
  //  · In one company: acts directly (link to `href`, or calls `onclick(entityId)`).
  //  · In Group view: opens a small "Which company?" menu with only the companies this user may record for; picking one
  //    switches company (setCompany) and continues — to `href` (with ?co=), or back to this page with `?do=<intent>` so the
  //    remounted screen can open its dialog (`takeIntent(intent)` from ./query.svelte). With a single allowed company it
  //    switches without asking.
  //  · Hidden for people who may not do it (`feature` not granted) or have no company to record for.
  import type { Snippet } from 'svelte';
  import type { User } from '@btw/api';
  import { router } from '@btw/ui';
  import { session } from '../../lib/session.svelte';
  import { company, GROUP, allowedIds, setCompany } from '../../lib/company.svelte';
  import { allCompanies, companyBrand, companyLabel } from '../../lib/companies';
  import { can, type Feature } from '../../lib/features';
  import CompanyMark from '../CompanyMark.svelte';
  import Plus from '@lucide/svelte/icons/plus';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';

  let { label, href, onclick, intent, feature, when = true, user: userProp, what = '', variant = 'primary', size = 'md', icon = true, cue = false, children }: {
    /** button text, e.g. "Create purchase order" */ label: string;
    /** where the action goes (e.g. "#/pos/new"); the company is added as ?co= */ href?: string;
    /** called with the company id when the action runs on this page */ onclick?: (entityId: string) => void;
    /** Group view + onclick: name left in ?do= after the company switch (the screen remounts; read it with takeIntent) */ intent?: string;
    /** hide unless the user has this feature (read-only users never see the button) */ feature?: Feature;
    /** the screen's own write check (e.g. may edit POs); false hides the button */ when?: boolean;
    /** defaults to the signed-in user */ user?: User | null;
    /** noun for the menu title: "Which company is this {what} for?" */ what?: string;
    variant?: 'primary' | 'secondary' | 'accent';
    size?: 'sm' | 'md';
    /** show the + icon */ icon?: boolean;
    /** in one company, show a small "for NUD" cue next to the button */ cue?: boolean;
    /** custom button content (defaults to icon + label) */ children?: Snippet;
  } = $props();

  const uid = $props.id();
  const user = $derived(userProp === undefined ? session.user : userProp);
  const options = $derived(user ? allCompanies().filter((c) => allowedIds(user).includes(c.id)) : []);
  const allowed = $derived(when && !!user && options.length > 0 && (!feature || can(user, feature)));
  const group = $derived(company.active === GROUP);
  const cls = $derived(`btn btn-${variant}${size === 'sm' ? ' btn-sm' : ''}`);

  let open = $state(false);
  let alignLeft = $state(false);
  let wrap = $state<HTMLSpanElement>();
  let btn = $state<HTMLButtonElement>();
  let menu = $state<HTMLDivElement>();

  const withCo = (h: string, id: string) => {
    const [p, qs = ''] = h.replace(/^#/, '').split('?');
    const q = new URLSearchParams(qs); q.set('co', companyBrand(id).code);
    return `${p}?${q}`;
  };
  const directHref = $derived(href && !group ? `#${withCo(href, company.active)}` : undefined);

  function run(id: string) {
    open = false;
    if (!user) return;
    const switching = id !== company.active;
    if (switching) setCompany(user, id);
    if (href) { router.go(withCo(href, id)); return; }
    if (switching && intent) {
      // the screen remounts for the new company: leave the intent in the address for it
      const [p, qs = ''] = router.path.split('?');
      const q = new URLSearchParams(qs); q.set('co', companyBrand(id).code); q.set('do', intent);
      router.go(`${p}?${q}`);
      return;
    }
    onclick?.(id);
  }
  function press() {
    if (!group) { run(company.active); return; }
    if (options.length === 1) { run(options[0].id); return; }
    // open towards the side with more room (header actions sit on the right, inline ones on the left)
    const r = wrap?.getBoundingClientRect();
    alignLeft = !!r && r.left + r.width / 2 < innerWidth / 2;
    open = !open;
  }

  $effect(() => {
    if (!open) return;
    queueMicrotask(() => menu?.querySelector<HTMLButtonElement>('button')?.focus());
    const away = (e: Event) => { if (wrap && !wrap.contains(e.target as Node)) open = false; };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { open = false; btn?.focus(); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const items = [...(menu?.querySelectorAll<HTMLButtonElement>('button.opt') ?? [])];
      const i = items.indexOf(document.activeElement as HTMLButtonElement);
      items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
      e.preventDefault();
    };
    document.addEventListener('pointerdown', away); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', key); };
  });
</script>

{#snippet face()}
  {#if children}{@render children()}{:else}{#if icon}<Plus size={16} aria-hidden="true" />{/if}{label}{/if}
{/snippet}

{#if allowed}
  <span class="aic" bind:this={wrap}>
    {#if directHref}
      <a class={cls} href={directHref}>{@render face()}</a>
    {:else}
      <button bind:this={btn} type="button" class={cls} aria-haspopup={group && options.length > 1 ? 'dialog' : undefined} aria-expanded={group && options.length > 1 ? open : undefined}
        aria-controls={open ? `${uid}-menu` : undefined} onclick={press}>{@render face()}{#if group && options.length > 1}<ChevronDown size={16} class="chev" aria-hidden="true" />{/if}</button>
    {/if}
    {#if cue && !group && options.length > 1}<span class="cue caption" title="Saved in this company"><CompanyMark entityId={company.active} size={16} />for {companyLabel(company.active)}</span>{/if}
    {#if open}
      <div class="menu" class:left={alignLeft} id="{uid}-menu" role="dialog" aria-labelledby="{uid}-t" bind:this={menu}>
        <div class="t" id="{uid}-t">Which company{what ? ` is this ${what} for` : ''}?</div>
        <div class="caption hint">You'll switch to that company to record it.</div>
        <ul>
          {#each options as c (c.id)}
            <li><button type="button" class="opt" onclick={() => run(c.id)}><CompanyMark entityId={c.id} size={24} /><span class="nm"><strong>{companyLabel(c.id)}</strong><span class="caption">{c.name}</span></span></button></li>
          {/each}
        </ul>
      </div>
    {/if}
  </span>
{/if}

<style>
  .aic { position: relative; display: inline-flex; align-items: center; gap: var(--space-2); }
  .aic :global(.chev) { margin-right: -4px; opacity: .85; }
  .cue { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
  .menu { position: absolute; right: 0; top: calc(100% + 6px); z-index: 50; width: max-content; min-width: 260px; max-width: calc(100vw - 32px);
    background: var(--surface-raised); color: var(--text); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--elevation-3); padding: var(--space-3); }
  .t { font: 700 var(--fs-body) / var(--lh-body) var(--ff-display); }
  .hint { margin: 2px 0 var(--space-2); }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
  .opt { display: flex; align-items: center; gap: var(--space-3); width: 100%; min-height: 44px; padding: var(--space-2); border: 0; border-radius: var(--radius-md); background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
  .opt:hover, .opt:focus-visible { background: var(--surface-sunken); }
  .opt:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: -2px; }
  .nm { display: flex; flex-direction: column; min-width: 0; }
  .menu.left { right: auto; left: 0; }
</style>
