<script lang="ts">
  // Sign-in in the style of the field app: one tap on a demo account signs straight in;
  // the manual form stays for real accounts. Field roles are pointed to the phone app.
  import { auth, type User } from '@btw/api';
  import { describe } from '../lib/errors';
  import { session, signIn } from '../lib/session.svelte';
  import { showDemoHelpers } from '../lib/mode';
  import LogIn from '@lucide/svelte/icons/log-in';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import Smartphone from '@lucide/svelte/icons/smartphone';
  import Copy from '@lucide/svelte/icons/copy';
  import { allCompanies, companyLabel } from '../lib/companies';
  import { canGroup } from '../lib/company.svelte';
  import CompanyMark from '../components/CompanyMark.svelte';

  const DEMO_PASSWORD = 'demo1234';
  import { roleText } from '../lib/roles';
  const FIELD = ['driver', 'loader', 'receiver', 'reexport'];
  const OFFICE_ORDER = ['director', 'planner', 'truck_planner', 'receiver', 'fleet', 'operations', 'accounts', 'admin'];
  const users: User[] = showDemoHelpers ? auth.demoUsers() : [];
  // Office demo accounts: anyone with at least one office role, plus warehouse (Asie, Yonas) so directors can demo web dashboards.
  const rank = (u: User) => Math.min(...u.roles.map((r) => (OFFICE_ORDER.indexOf(r) + 1 || 99)));
  const office = users.filter((u) => u.roles.some((r) => !FIELD.includes(r) && r !== 'sales') || u.roles.includes('receiver')).sort((a, b) => rank(a) - rank(b));
  const field = users.filter((u) => u.roles.some((r) => FIELD.includes(r)));
  // Office demo accounts grouped by company; directors/admins (all companies) first as "Group".
  const companies = allCompanies();
  // Group = directors/admins and staff who work for all three; others under their (first) company.
  const isGroupUser = (u: User) => canGroup(u) || u.entityIds.length >= companies.length;
  const groups = $derived([
    { id: null as string | null, title: 'Group · all three companies', users: office.filter(isGroupUser) },
    ...companies.map((c) => ({ id: c.id as string | null, title: c.name, users: office.filter((u) => !isGroupUser(u) && u.entityIds[0] === c.id) })),
].filter((g) => g.users.length));
  const fieldUrl = import.meta.env.VITE_FIELD_URL || `${location.origin}${location.pathname.replace(/\/$/, '')}/app/`;
  const appHref = (phone: string) => {
    const base = fieldUrl.endsWith('/') ? fieldUrl : `${fieldUrl}/`;
    return `${base}?phone=${encodeURIComponent(phone)}`;
  };
  const uname = (u: User) => u.id.replace(/^u-/, '');
  const prefill = typeof location !== 'undefined' ? (new URLSearchParams(location.search).get('phone') || new URLSearchParams(location.search).get('user') || '') : '';

  let username = $state(prefill);
  let password = $state('');
  let error = $state('');
  let busy = $state<string | null>(null);
  let showForm = $state(!users.length || !!prefill);
  let copied = $state(false);

  async function go(id: string, user: string, pass: string) {
    busy = id; error = '';
    try { await signIn(user, pass); }
    catch (err) { const d = describe(err); error = d.kind === 'auth' || d.kind === 'rule' ? 'Wrong username or password.' : d.message; }
    finally { busy = null; }
  }
  function submit(e: Event) {
    e.preventDefault();
    if (!username.trim() || !password) { error = 'Enter your username or phone number and your password.'; return; }
    go('form', username, password);
  }
  async function copy() {
    try { await navigator.clipboard.writeText(fieldUrl); copied = true; setTimeout(() => (copied = false), 1800); } catch { /* select fallback below */ }
  }
</script>

<div class="wrap">
  <main class="col">
    <div class="logos" aria-label="Group companies">
      {#each companies as c (c.id)}{#if c.logo}<img src={c.logo} alt={c.name} />{:else}<strong>{c.name}</strong>{/if}{/each}
    </div>
    <div class="ribbon"></div>
    <div>
      <h1>Sign in</h1>
      <p class="muted">BTW Global · Nihna Unique · Kivu — supply chain, logistics, inventory and sales.</p>
    </div>
    {#if session.notice}<p class="notice small" role="status">{session.notice}</p>{/if}
    {#if error}<p class="error" role="alert">{error}</p>{/if}

    {#if office.length}
      <section aria-labelledby="demo-h">
        <div class="row between head"><span id="demo-h" class="overline">Office · try a demo</span><span class="caption">web {DEMO_PASSWORD} · app PIN 1234</span></div>
        {#each groups as g (g.title)}
          <div class="ghead"><CompanyMark entityId={g.id} size={20} /><span class="small"><strong>{g.title}</strong></span></div>
          <div class="list">
            {#each g.users as u (u.id)}
              <div class="acct">
                <span class="avatar" aria-hidden="true">{u.name.slice(0, 1)}</span>
                <span class="grow"><strong>{u.name}</strong><span class="caption">{roleText(u.roles)}{u.loadingPointIds.includes('s-gbi') && u.roles.includes('truck_planner') ? ' · loads at GBI Mombasa' : ''}{g.id ? ` · ${u.entityIds.map((e) => companyLabel(e)).join(' + ')}${u.entityIds.length === 1 ? ' only' : ''}` : ''}<br /><span class="mono">{uname(u)} · {u.phone}</span></span></span>
                <span class="acts">
                  <button type="button" class="btn btn-primary btn-sm" onclick={() => go(u.id, u.phone, DEMO_PASSWORD)} disabled={!!busy} aria-label="Sign in to the web as {u.name}">{busy === u.id ? 'Signing in…' : 'Web'}</button>
                  <a class="btn btn-secondary btn-sm" href={appHref(u.phone)}>App</a>
                </span>
              </div>
            {/each}
          </div>
        {/each}
      </section>
    {/if}

    {#if showForm}
      <form class="stack" onsubmit={submit} novalidate>
        <label class="field"><span>Username or phone</span>
          <input class="input big" id="login-user" autocomplete="username" bind:value={username} placeholder="+254 7xx xxx xxx" aria-invalid={!!error} /></label>
        <label class="field"><span>Password</span>
          <input class="input big" id="login-pass" type="password" autocomplete="current-password" bind:value={password} aria-invalid={!!error} /></label>
        <button class="btn btn-primary btn-lg btn-block" disabled={!!busy}><LogIn size={18} />{busy === 'form' ? 'Signing in…' : 'Sign in'}</button>
      </form>
    {:else}
      <button type="button" class="btn btn-secondary btn-lg btn-block" onclick={() => (showForm = true)}>Sign in with your own account</button>
    {/if}

    {#if field.length}
      <section class="fieldapp" aria-labelledby="field-h">
        <div class="row"><Smartphone size={22} /><h2 id="field-h">Field · drivers, loaders &amp; receivers</h2></div>
        <p class="small muted">Phone app PIN 1234 · web password {DEMO_PASSWORD}. App opens with that phone ready; Web signs in here (drivers are sent to the phone app).</p>
        <div class="url"><code>{fieldUrl}</code><button type="button" class="btn btn-ghost btn-sm" onclick={copy} aria-label="Copy field app link"><Copy size={16} />{copied ? 'Copied' : 'Copy'}</button></div>
        <a class="btn btn-accent btn-lg btn-block" href={fieldUrl}>Open the field app <ArrowRight size={18} /></a>
        <div class="list in-card">
          {#each field as u (u.id)}
            <div class="acct">
              <span class="avatar" aria-hidden="true">{u.name.slice(0, 1)}</span>
              <span class="grow"><strong>{u.name}</strong><span class="caption">{roleText(u.roles)}<br /><span class="mono">{u.phone}</span></span></span>
              <span class="acts">
                <button type="button" class="btn btn-ghost btn-sm" onclick={() => go(u.id, u.phone, DEMO_PASSWORD)} disabled={!!busy} aria-label="Sign in to the web as {u.name}">{busy === u.id ? '…' : 'Web'}</button>
                <a class="btn btn-primary btn-sm" href={appHref(u.phone)}>App</a>
              </span>
            </div>
          {/each}
        </div>
      </section>
    {/if}
    <p class="caption center">Two-factor sign-in for directors and admins comes with the production release.</p>
  </main>
</div>

<style>
  .wrap { min-height: 100vh; display: grid; justify-items: center; align-items: start; padding: var(--space-8) var(--space-4); background: var(--bg); }
  .col { width: min(460px, 100%); display: flex; flex-direction: column; gap: var(--space-5); }
  .logos { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-3); align-items: center; padding: var(--space-3); background: var(--logo-tile); border-radius: var(--radius-lg); }
  .logos img { width: 100%; height: 48px; object-fit: contain; }
  .ghead { display: flex; align-items: center; gap: var(--space-2); margin: var(--space-3) 0 var(--space-1); }
  .ribbon { margin-top: calc(-1 * var(--space-2)); }
  h1 { font-size: 32px; line-height: 38px; }
  h2 { font-size: 16px; line-height: 22px; }
  .head { margin-bottom: var(--space-2); }
  .notice { background: var(--info-subtle); color: var(--info); padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); margin: 0; }
  .list { display: flex; flex-direction: column; border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface); overflow: hidden; }
  .acct { display: flex; align-items: center; gap: var(--space-3); min-height: 64px; padding: var(--space-3) var(--space-4); border: 0; border-bottom: 1px solid var(--border); background: transparent; color: var(--text); font: inherit; text-align: left; }
  .acct:last-child { border-bottom: 0; }
  .acct strong { display: block; font-size: 16px; }
  .acts { display: flex; gap: 6px; flex: none; }
  .avatar { width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; background: var(--primary); color: var(--text-on-primary); font: 700 16px var(--ff-display); flex: none; }
  .input.big { height: 52px; font-size: 16px; }
  .fieldapp { display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-5); border-radius: var(--radius-lg); background: var(--surface); border: 1px solid var(--border); border-top: 3px solid var(--accent); }
  .url { display: flex; align-items: center; gap: var(--space-2); background: var(--surface-sunken); border-radius: var(--radius-md); padding: var(--space-1) var(--space-1) var(--space-1) var(--space-3); min-width: 0; }
  .url code { flex: 1; min-width: 0; overflow-wrap: anywhere; font-size: 13px; }
  .in-card { border: 1px solid var(--border); }
  .center { text-align: center; }
</style>
