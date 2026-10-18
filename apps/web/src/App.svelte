<script lang="ts">
  import { destinationLabel } from './lib/planning';
  import { lookup, notifications, onChange } from '@btw/api';
  import { router, Toast, say } from '@btw/ui';
  import { session, restore, signOut, expire } from './lib/session.svelte';
  import { describe } from './lib/errors';
  import { brand } from './lib/brand';
  import { API_MODE } from './lib/mode';
  import { routes, navFor, canOpen, isFieldOnly, homeOf, type WebRoute } from './routes';
  import Login from './screens/Login.svelte';
  import CompanySwitcher from './components/CompanySwitcher.svelte';
  import CompanyMark from './components/CompanyMark.svelte';
  import { company, initCompany, GROUP } from './lib/company.svelte';
  import { companyBrand, allCompanies } from './lib/companies';
  import Bell from '@lucide/svelte/icons/bell';
  import Moon from '@lucide/svelte/icons/moon';
  import Sun from '@lucide/svelte/icons/sun';
  import Menu from '@lucide/svelte/icons/menu';
  import LogOut from '@lucide/svelte/icons/log-out';

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
  const visibleNav = $derived(navFor(user));
  const active = (href: string) => (href === '#/' ? router.path === '/' : ('#' + router.path).startsWith(href));
  $effect(() => { document.title = `${matched?.route.title ?? 'BTW'} · ${co ? co.shortName : user ? 'Group' : 'BTW'} · Supply Chain`; navOpen = false; router.path; });
  // Remount the screen when the company or the route changes, so its data reloads for the new scope.
  const screenKey = $derived(`${company.active}|${router.path}`);

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
  <div class="shell" class:nav-open={navOpen}>
    <div class="side-col"><aside class="side">
      <div class="brand" style:--co-accent={co?.colors.accent}>
        {#if co}
          {#if co.logoOnDark}<img class="bare" src={co.logoOnDark} alt={co.name} />
          {:else if co.logo}<img src={co.logo} alt={co.name} />
          {:else}<div class="wordmark" style:color="#fff"><strong>{co.shortName}</strong><span>{co.tagline}</span></div>{/if}
        {:else}
          <div class="groupmark"><div class="marks">{#each allCompanies() as c (c.id)}<CompanyMark entityId={c.id} size={34} />{/each}</div><strong>Group</strong><span>BTW · NUD · Kivu</span></div>
        {/if}
      </div>
      <nav>
        {#each visibleNav as g}
          <div class="group overline">{g.label}</div>
          {#each g.items as it}
            {@const Icon = it.icon}
            <a href={it.href} class:active={active(it.href)}><Icon size={18} />{it.label}</a>
          {/each}
        {/each}
      </nav>
      <div class="side-foot caption">{API_MODE === 'mock' ? 'Demo data (in this browser)' : 'Live data'}</div>
    </aside></div>
    {#if navOpen}<button class="scrim" aria-label="Close menu" onclick={() => (navOpen = false)}></button>{/if}
    <div class="main">
      <div class="ribbon"></div>
      <header class="top">
        <button class="btn btn-ghost btn-sm burger" onclick={() => (navOpen = !navOpen)} aria-label="Menu"><Menu size={20} /></button>
        <CompanySwitcher {user} />
        <div class="grow scope small muted">{#if scope}Scope: <strong>{scope}</strong>{/if}</div>
        <button class="btn btn-ghost btn-sm" onclick={toggleTheme} aria-label="Toggle theme">{#if theme === 'dark'}<Sun size={18} />{:else}<Moon size={18} />{/if}</button>
        <a class="btn btn-ghost btn-sm bell" href="#/notifications" aria-label="Notifications"><Bell size={18} />{#if unread}<span class="dotcount">{unread}</span>{/if}</a>
        <div class="who"><div class="small" style="font-weight:600">{user.name}</div><div class="caption">{user.roles.map((r) => r.replace('_', ' ')).join(' · ')}</div></div>
        <button class="btn btn-ghost btn-sm" onclick={logout} aria-label="Sign out"><LogOut size={18} /></button>
      </header>
      <main class="content">
        {#if matched && !canOpen(router.path, user)}
          <div class="card empty" role="alert"><h2>Not available for your role</h2><p class="small">This page isn’t part of your work as {user.roles.join(', ')}. Ask an administrator if you need it.</p><p><a class="btn btn-secondary btn-sm" href="#{homeOf(user)}">Back to {homeOf(user) === '/' ? 'dashboard' : 'your home page'}</a></p></div>
        {:else if matched}
          {#key screenKey}
            {#if matched.route.load}
              {#await matched.route.load()}
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
  .shell { display: grid; grid-template-columns: 248px minmax(0, 1fr); min-height: 100vh; }
  .side-col { background: var(--nav); }
  .side { background: var(--nav); color: var(--nav-text); display: flex; flex-direction: column; position: sticky; top: 0; height: 100vh; overflow-y: auto; }
  .brand { padding: var(--space-4); }
  .brand img { display: block; width: 100%; max-width: 180px; background: var(--logo-tile); border-radius: var(--radius-md); padding: 6px 10px; }
  .brand img.bare { background: none; padding: 0; border-radius: 0; }
  .brand { border-bottom: 3px solid var(--co-accent, transparent); }
  .wordmark, .groupmark { display: flex; flex-direction: column; gap: 2px; color: var(--nav-text); }
  .wordmark strong, .groupmark strong { font: 800 20px/1.1 var(--ff-display); }
  .wordmark span, .groupmark span { font-size: 11px; color: var(--nav-text-muted); }
  .groupmark .marks { display: flex; gap: 6px; margin-bottom: 6px; }
  .boot { min-height: 100vh; display: grid; place-items: center; }
  nav { display: flex; flex-direction: column; padding: 0 var(--space-2) var(--space-4); }
  .group { color: var(--nav-text-muted); padding: var(--space-4) var(--space-3) var(--space-1); }
  nav a { display: flex; align-items: center; gap: var(--space-3); color: var(--nav-text); padding: 9px var(--space-3); border-radius: var(--radius-md); border-left: 3px solid transparent; font-weight: 500; text-decoration: none; }
  nav a:hover { background: var(--nav-active-bg); }
  nav a.active { background: var(--nav-active-bg); border-left-color: var(--nav-indicator); }
  .side-foot { margin-top: auto; padding: var(--space-4); color: var(--nav-text-muted); }
  .main { min-width: 0; display: flex; flex-direction: column; }
  .top { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-2) var(--space-6); background: var(--surface); border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 10; }
  .who { text-align: right; line-height: 1.2; padding: 0 var(--space-2); }
  .bell { position: relative; }
  .dotcount { position: absolute; top: 2px; right: 2px; background: var(--accent); color: var(--text-on-accent); border-radius: 9px; font-size: 10px; min-width: 16px; height: 16px; display: grid; place-items: center; padding: 0 4px; }
  .content { padding: var(--space-6); max-width: 1440px; width: 100%; }
  .burger, .scrim { display: none; }
  .scrim { position: fixed; inset: 0; z-index: 40; background: rgb(4 21 43 / .5); border: 0; }
  @media (max-width: 900px) {
    .shell { grid-template-columns: minmax(0, 1fr); }
    .side { position: fixed; inset: 0 auto 0 0; width: 260px; z-index: 50; transform: translateX(-100%); transition: transform var(--motion-base) var(--motion-easing); }
    .nav-open .side { transform: none; box-shadow: var(--elevation-3); }
    .side-col { display: contents; }
    .burger { display: inline-flex; }
    .scrim { display: block; }
    .who, .scope { display: none; }
    .top { padding: var(--space-2) var(--space-4); }
    .content { padding: var(--space-4); }
  }
</style>
