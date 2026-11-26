<script lang="ts">
  import { destinationLabel } from './lib/planning';
  import { lookup, notifications, onChange } from '@btw/api';
  import { router, Toast, say } from '@btw/ui';
  import { session, restore, signOut, expire } from './lib/session.svelte';
  import { describe } from './lib/errors';
  import { brand } from './lib/brand';
  import { API_MODE } from './lib/mode';
  import { roleText } from './lib/roles';
  import { routes, navFor, canOpen, isFieldOnly, homeOf, sideOf, canSeeManagement, type WebRoute } from './routes';
  import { redirectOf } from './lib/redirects';
  import Login from './screens/Login.svelte';
  import CompanySwitcher from './components/CompanySwitcher.svelte';
  import CompanyMark from './components/CompanyMark.svelte';
  import { company, initCompany, GROUP } from './lib/company.svelte';
  import { companyBrand, allCompanies } from './lib/companies';
  import Bell from '@lucide/svelte/icons/bell';
  import Moon from '@lucide/svelte/icons/moon';
  import Sun from '@lucide/svelte/icons/sun';
  import LogOut from '@lucide/svelte/icons/log-out';
  import PanelLeftClose from '@lucide/svelte/icons/panel-left-close';
  import PanelLeftOpen from '@lucide/svelte/icons/panel-left-open';
  import Workflow from '@lucide/svelte/icons/workflow';
  import ChartPie from '@lucide/svelte/icons/chart-pie';
  import { sidebar, toggleSidebar } from './lib/sidebar.svelte';

  const user = $derived(session.user);
  let unread = $state(0);
  // Active company: chosen once per signed-in user (link ?co=, saved choice, or the default for the role).
  $effect(() => { if (user && company.user !== user.id) initCompany(user); });
  const co = $derived(company.active && company.active !== GROUP ? companyBrand(company.active) : null);
  // Tab icon follows the company (group → BTW icons as the default set).
  $effect(() => {
    const b = co ?? null; const ico = b?.favicon32 ?? brand.favicon32, any = b?.favicon ?? brand.favicon;
    document.head.querySelectorAll('link[rel="icon"]').forEach((l) => l.remove());
    for (const [href, attrs] of [[any, { sizes: 'any' }], [ico, { type: 'image/png', sizes: '32x32' }]] as const) {
      if (!href) continue; const el = Object.assign(document.createElement('link'), { rel: 'icon', href });
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); document.head.append(el);
    }
  });
  restore();
  // Any action that fails without its own handler: say why, and send expired sessions back to sign-in.
  $effect(() => {
    const onRejection = (ev: PromiseRejectionEvent) => {
      const d = describe(ev.reason);
      if (d.kind === 'auth') { expire(); return; }
      say(d.message);
    };
    addEventListener('unhandledrejection', onRejection);
    return () => removeEventListener('unhandledrejection', onRejection);
  });
  let theme = $state<'light' | 'dark' | ''>((() => { try { return (localStorage.getItem('btw-theme') as any) ?? ''; } catch { return ''; } })());
  let navOpen = $state(false);

  $effect(() => { theme ? document.documentElement.setAttribute('data-theme', theme) : document.documentElement.removeAttribute('data-theme'); try { localStorage.setItem('btw-theme', theme); } catch {} });
  const refreshUnread = async () => { try { unread = (await notifications.list()).filter((n) => !n.read).length; } catch { /* badge only */ } };
  $effect(() => { if (user) { refreshUnread(); return onChange(refreshUnread); } });

  // Roles without the dashboard start on their own home (truck planner → Truck desk).
  $effect(() => { if (user && router.path === '/' && homeOf(user) !== '/') location.replace(`#${homeOf(user)}`); });
  // docs/17 Phase 2: old pages (Inventory, Loading, Reports, …) and old filters land on the new page / tab
  const redirect = $derived(redirectOf(router.path));
  $effect(() => { if (redirect) location.replace(`#${redirect}`); });
  const matched = $derived(router.match(routes as any) as { route: WebRoute; params: Record<string, string> } | null);
  // UA-02 / §17.7: show the user's data scope in words, not ids
  const scope = $derived.by(() => {
    if (!user) return '';
    const parts = [
      ...user.loadingPointIds.map((id) => `${lookup.supplier(id)?.code} ${lookup.supplier(id)?.city}`),
      ...user.warehouseIds.map((id) => destinationLabel(id)),
    ].filter(Boolean);
    return parts.join(' · ');
  });
  // Operations | Management switch (docs/23 §2): the side follows the address; the switch shows only with report access
  const side = $derived(sideOf(router.path));
  const showSwitch = $derived(canSeeManagement(user));
  const visibleNav = $derived(navFor(user, side));
  const bellCount = $derived(unread > 99 ? '99+' : String(unread));
  // Top bar (V3-1b SB-5): the page title = the menu entry you are on, else the route title
  const pageTitle = $derived(visibleNav.flatMap((g) => g.items).find((i) => active(i.href) && i.href !== '#/')?.label ?? matched?.route.title ?? '');
  const initials = $derived(user ? user.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() : '');
  let scrolled = $state(false);
  $effect(() => { const on = () => (scrolled = scrollY > 4); on(); addEventListener('scroll', on, { passive: true }); return () => removeEventListener('scroll', on); });
  // Open / close the sidebar at will (SB-6): a rail on a desktop, the drawer on a phone; Ctrl/⌘ + B
  const mq = matchMedia('(max-width: 900px)');
  let isPhone = $state(mq.matches);
  $effect(() => { const on = () => (isPhone = mq.matches); mq.addEventListener('change', on); return () => mq.removeEventListener('change', on); });
  function toggleNav() { if (isPhone) navOpen = !navOpen; else toggleSidebar(); }
  const toggleLabel = $derived(isPhone ? (navOpen ? 'Close the menu' : 'Open the menu') : sidebar.collapsed ? 'Open the sidebar' : 'Close the sidebar');
  $effect(() => {
    const key = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b' && !e.altKey) { e.preventDefault(); toggleNav(); } };
    addEventListener('keydown', key); return () => removeEventListener('keydown', key);
  });
  const rail = $derived(sidebar.collapsed && !isPhone);
  const active = (href: string) => (href === '#/' ? router.path === '/' : ('#' + router.path).startsWith(href));
  $effect(() => { document.title = `${matched?.route.title ?? 'BTW'} · ${co ? co.shortName : user ? 'Group' : 'BTW'} · Supply Chain`; navOpen = false; router.path; });
  // Remount the screen when the company or the route changes, so its data reloads for the new scope.
  // All Management pages are one screen: it switches report pages itself and keeps its report frame loaded.
  const screenKey = $derived(`${company.active}|${router.path.startsWith('/management') ? '/management' : router.path}`);
  // One import per screen module: the same promise for the same load function, so a kept screen is not re-created.
  const loads = new Map<() => Promise<{ default: any }>, Promise<{ default: any }>>();
  const loadOf = (r: WebRoute) => { if (!loads.has(r.load!)) loads.set(r.load!, r.load!()); return loads.get(r.load!)!; };

  function toggleTheme() {
    const dark = theme === 'dark' || (!theme && matchMedia('(prefers-color-scheme: dark)').matches);
    theme = dark ? 'light' : 'dark';
  }
  function logout() { signOut(); }
  // Same origin when served from one point (/app/), else the field dev server.
  const fieldAppUrl = location.port === '5173' ? 'http://localhost:5174/' : `${location.origin}/app/`;
</script>

{#if !session.ready}
  <div class="boot" aria-busy="true"><div class="skeleton" style="width:160px;height:12px"></div></div>
{:else if !user}
  <Login />
{:else if isFieldOnly(user.roles)}
  <div class="fieldonly">
    <div class="card stack">
      <h2>Use the BTW field app</h2>
      <p class="muted">Hi {user.name.split(' ')[0]}. Drivers check in, report problems and see their trip in the field app on their phone — sign in there with your phone number and PIN.</p>
      <a class="btn btn-primary btn-lg" href={fieldAppUrl}>Open the field app</a>
      <button class="btn btn-ghost" onclick={logout} aria-label="Sign out">Sign out</button>
    </div>
  </div>
{:else}
  <div class="shell" class:nav-open={navOpen} class:rail>
    <div class="side-col"><aside class="side" id="side">
      <!-- SB-1: the company logo at the top; Group = the three marks -->
      <!-- in the rail the company button below is the logo, so the header is not repeated -->
      {#if !rail}<div class="brand">
        {#if co}
          {#if co.logo}<span class="tile"><img src={co.logo} alt={co.name} /></span>
          {:else if co.logoOnDark}<img class="bare" src={co.logoOnDark} alt={co.name} />
          {:else}<div class="wordmark"><strong>{co.shortName}</strong></div>{/if}
        {:else}
          <div class="groupmark"><div class="marks">{#each allCompanies() as c (c.id)}<CompanyMark entityId={c.id} size={24} />{/each}</div><strong>Group</strong></div>
        {/if}
      </div>{:else}<div class="rail-top"></div>{/if}
      <!-- SB-3: the company select under the logo -->
      <CompanySwitcher {user} compact={rail} />
      {#if showSwitch}
        <!-- SB-4: the thumb slides between the two sides -->
        <div class="seg" class:mgmt={side === 'management'} role="group" aria-label="Operations or management">
          <span class="thumb" aria-hidden="true"></span>
          <a href="#{homeOf(user)}" class:on={side === 'operations'} aria-current={side === 'operations' ? 'true' : undefined} title={rail ? 'Operations' : undefined}>{#if rail}<Workflow size={16} aria-hidden="true" />{/if}<span class="lbl">Operations</span></a>
          <a href="#/management/overview" class:on={side === 'management'} aria-current={side === 'management' ? 'true' : undefined} title={rail ? 'Management' : undefined}>{#if rail}<ChartPie size={16} aria-hidden="true" />{/if}<span class="lbl">Management</span></a>
        </div>
      {/if}
      <!-- SB-2: no group titles; the groups keep their order and stay named for screen readers -->
      <nav aria-label={side === 'management' ? 'Management' : 'Operations'}>
        {#each visibleNav as g}
          <div class="grp" role="group" aria-label={g.label}>
            {#each g.items as it}
              {@const Icon = it.icon}
              <a href={it.href} class:active={active(it.href)} title={rail ? it.label : undefined} aria-label={rail ? it.label : undefined}><Icon size={18} /><span class="lbl">{it.label}</span></a>
            {/each}
          </div>
        {/each}
      </nav>
      {#if !rail}<div class="side-foot caption">{API_MODE === 'mock' ? 'Demo data (in this browser)' : 'Live data'}</div>{/if}
    </aside></div>
    {#if navOpen}<button class="scrim" aria-label="Close menu" onclick={() => (navOpen = false)}></button>{/if}
    <div class="main">
      <!-- SB-5: modern top bar: toggle + page title on the left; theme, alerts, account on the right -->
      <header class="top" class:scrolled>
        <button class="ibtn" onclick={toggleNav} aria-controls="side" aria-expanded={isPhone ? navOpen : !sidebar.collapsed}
          aria-label={toggleLabel} title="{toggleLabel} (Ctrl+B)">
          {#if isPhone ? !navOpen : sidebar.collapsed}<PanelLeftOpen size={20} />{:else}<PanelLeftClose size={20} />{/if}
        </button>
        <div class="ttl"><span class="crumb">{side === 'management' ? 'Management' : 'Operations'}</span><strong class="pt">{pageTitle}</strong></div>
        <div class="grow"></div>
        {#if scope}<span class="scope small" title="Your data scope">Scope: <strong>{scope}</strong></span>{/if}
        <button class="ibtn" onclick={toggleTheme} aria-label="Toggle theme">{#if theme === 'dark'}<Sun size={18} />{:else}<Moon size={18} />{/if}</button>
        <a class="ibtn bell" href="#/notifications" aria-label="Alerts{unread ? `, ${unread} unread` : ''}"><Bell size={18} />{#if unread}<span class="dotcount">{bellCount}</span>{/if}</a>
        <div class="acct"><span class="av" aria-hidden="true">{initials}</span><span class="who"><span class="nm">{user.name}</span><span class="rl">{roleText(user.roles)}</span></span></div>
        <button class="ibtn" onclick={logout} aria-label="Sign out" title="Sign out"><LogOut size={18} /></button>
      </header>
      <main class="content">
        {#if redirect}
          <div class="stack" aria-busy="true"><div class="skeleton" style="height:36px;width:35%"></div></div>
        {:else if matched && !canOpen(router.path, user)}
          <div class="card empty" role="alert"><h2>Not available for your role</h2><p class="small">This page isn’t part of your work as {user.roles.join(', ')}. Ask an administrator if you need it.</p><p><a class="btn btn-secondary btn-sm" href="#{homeOf(user)}">Back to {homeOf(user) === '/' ? 'dashboard' : 'your home page'}</a></p></div>
        {:else if matched}
          {#key screenKey}
            {#if matched.route.load}
              {#await loadOf(matched.route)}
                <div class="stack"><div class="skeleton" style="height:36px;width:35%"></div><div class="skeleton" style="height:180px"></div></div>
              {:then mod}
                <mod.default params={matched.params} {user} />
              {:catch err}
                <div class="card empty"><h2>This page didn’t load</h2><p class="small">The app may have been updated. <button class="btn btn-secondary btn-sm" onclick={() => location.reload()}>Reload</button></p></div>
              {/await}
            {:else if matched.route.component}
              <matched.route.component params={matched.params} {user} />
            {/if}
          {/key}
        {:else}
          <div class="empty"><h2>Page not found</h2><p><a href="#/">Back to dashboard</a></p></div>
        {/if}
      </main>
    </div>
  </div>
{/if}
<Toast />

<style>
  .fieldonly { min-height: 100vh; display: grid; place-items: center; padding: var(--space-4); background: var(--bg); }
  .fieldonly .card { max-width: 440px; }
  .shell { --side-w: 248px; display: grid; grid-template-columns: var(--side-w) minmax(0, 1fr); min-height: 100vh; transition: grid-template-columns var(--motion-base) var(--motion-easing); }
  .shell.rail { --side-w: 72px; }
  .side-col { background: var(--nav); }
  .side { background: var(--nav); color: var(--nav-text); display: flex; flex-direction: column; position: sticky; top: 0; height: 100vh; overflow-y: auto; overflow-x: hidden; scrollbar-width: thin; }
  /* SB-1 brand: one fixed-height header, logo on a white tile so every company logo reads */
  .brand { height: 68px; flex: none; display: flex; align-items: center; padding: 0 var(--space-4); }
  .brand .tile { display: flex; align-items: center; height: 44px; max-width: 100%; padding: 6px 12px; background: var(--logo-tile); border-radius: 12px; }
  .brand .tile img { display: block; height: 100%; max-width: 184px; object-fit: contain; }
  .brand img.bare { display: block; height: 40px; max-width: 100%; object-fit: contain; }
  .wordmark strong, .groupmark strong { font: 800 16px/1.1 var(--ff-display); color: var(--nav-strong); }
  .groupmark { display: flex; align-items: center; gap: var(--space-2); }
  .groupmark .marks { display: flex; gap: 4px; }
  .rail-top { height: var(--space-4); flex: none; }
  /* SB-4 switch: a thumb slides under the labels */
  .seg { position: relative; display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin: 0 var(--space-3) var(--space-3); padding: 4px; border: 1px solid var(--nav-line); border-radius: 14px; background: var(--nav-raised); }
  .seg .thumb { position: absolute; top: 4px; bottom: 4px; left: 4px; width: calc(50% - 6px); border-radius: 11px; background: var(--nav-strong); box-shadow: var(--elevation-2); transition: transform 220ms cubic-bezier(.2, .8, .2, 1); }
  .seg.mgmt .thumb { transform: translateX(calc(100% + 4px)); }
  .seg a { position: relative; z-index: 1; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 8px 6px; border-radius: 11px; color: var(--nav-text); font-weight: 600; font-size: 13px; text-decoration: none; transition: color 220ms ease; }
  .seg a:hover { color: var(--nav-strong); }
  .seg a.on { color: var(--nav); }
  .rail .seg { grid-template-columns: 1fr; margin-inline: auto; width: 48px; }
  .rail .seg .thumb { width: auto; right: 4px; height: calc(50% - 6px); bottom: auto; }
  .rail .seg.mgmt .thumb { transform: translateY(calc(100% + 4px)); }
  .rail .seg a { padding: 9px 0; }
  /* SB-2 nav: no titles, a little space between the process groups */
  nav { display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-1) var(--space-2) var(--space-4); }
  .grp { display: flex; flex-direction: column; gap: 2px; }
  nav a { position: relative; display: flex; align-items: center; gap: var(--space-3); color: var(--nav-text); padding: 9px var(--space-3); border-radius: 10px; font-weight: 500; text-decoration: none; white-space: nowrap; transition: background var(--motion-fast) var(--motion-easing), color var(--motion-fast) var(--motion-easing); }
  nav a:hover { background: var(--nav-hover); color: var(--nav-strong); text-decoration: none; }
  nav a.active { background: var(--nav-active-bg); color: var(--nav-strong); font-weight: 600; box-shadow: inset 3px 0 0 var(--nav-indicator); }
  nav a :global(svg) { flex: none; }
  .rail nav a { justify-content: center; padding: 10px 0; }
  .rail .lbl { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .side-foot { margin-top: auto; padding: var(--space-4); color: var(--nav-text-muted); }
  .main { min-width: 0; display: flex; flex-direction: column; }
  /* SB-5 top bar */
  .top { display: flex; align-items: center; gap: var(--space-2); height: 60px; padding: 0 var(--space-6); position: sticky; top: 0; z-index: 10; background: color-mix(in srgb, var(--surface) 82%, transparent); backdrop-filter: saturate(1.4) blur(12px); -webkit-backdrop-filter: saturate(1.4) blur(12px); border-bottom: 1px solid var(--border); transition: box-shadow var(--motion-base) var(--motion-easing); }
  .top.scrolled { box-shadow: var(--elevation-2); }
  .ibtn { position: relative; display: inline-grid; place-items: center; width: 38px; height: 38px; border: 0; border-radius: 10px; background: transparent; color: var(--text-muted); cursor: pointer; text-decoration: none; transition: background var(--motion-fast) var(--motion-easing), color var(--motion-fast) var(--motion-easing); }
  .ibtn:hover { background: var(--surface-sunken); color: var(--text); text-decoration: none; }
  .ttl { display: flex; flex-direction: column; line-height: 1.2; min-width: 0; margin-left: var(--space-1); }
  .crumb { font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--text-subtle); }
  .pt { font: 700 17px/1.25 var(--ff-display); color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .scope { color: var(--text-muted); max-width: 32ch; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bell .dotcount { position: absolute; top: 3px; right: 1px; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; display: grid; place-items: center; background: var(--danger-solid); color: var(--text-on-danger); font: 700 10.5px/1 var(--ff-body); box-shadow: 0 0 0 2px var(--surface); }
  .acct { display: flex; align-items: center; gap: var(--space-2); padding: 4px 10px 4px 4px; margin-left: var(--space-1); border: 1px solid var(--border); border-radius: 999px; background: var(--surface); }
  .av { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 50%; background: var(--primary-subtle); color: var(--link); font: 700 12px/1 var(--ff-body); }
  .who { display: flex; flex-direction: column; line-height: 1.15; }
  .nm { font-size: 13px; font-weight: 600; }
  .rl { font-size: 11px; color: var(--text-muted); }
  /* v3: content centred with equal margins (docs/23 §5) */
  .content { padding: var(--space-6); max-width: 1320px; width: 100%; margin-inline: auto; }
  .scrim { display: none; }
  .scrim { position: fixed; inset: 0; z-index: 40; background: rgb(4 21 43 / .5); border: 0; }
  @media (max-width: 900px) {
    .shell { grid-template-columns: minmax(0, 1fr); }
    .side { position: fixed; inset: 0 auto 0 0; width: 260px; z-index: 50; transform: translateX(-100%); transition: transform var(--motion-base) var(--motion-easing); }
    .nav-open .side { transform: none; box-shadow: var(--elevation-3); }
    .side-col { display: contents; }
    .scrim { display: block; }
    .who, .scope, .crumb { display: none; }
    .acct { padding: 3px; }
    .top { padding: 0 var(--space-3); gap: 2px; }
    .content { padding: var(--space-4); }
  }
</style>
