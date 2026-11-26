<script lang="ts">
  // Sign-in in the style of the field app: one tap on a demo account signs straight in;
  // the manual form stays for real accounts. Field roles are pointed to the phone app.
  import { auth, type User } from '@btw/api';
  import { describe } from '../lib/errors';
  import { session, signIn } from '../lib/session.svelte';
  import { showDemoHelpers } from '../lib/mode';
  import LogIn from '@lucide/svelte/icons/log-in';
  import Eye from '@lucide/svelte/icons/eye';
  import EyeOff from '@lucide/svelte/icons/eye-off';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import Smartphone from '@lucide/svelte/icons/smartphone';
  import Copy from '@lucide/svelte/icons/copy';
  import Truck from '@lucide/svelte/icons/truck';
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
  // V3-6: the sign-in form always comes first; the demo accounts sit below it (demo mode only)
  let showPass = $state(false);
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
    <div class="hello">
      <h1>Welcome back</h1>
      <p class="muted">Sign in to BTW: supply chain, logistics, stock and sales for BTW Global, Nihna Unique and Kivu.</p>
    </div>
    {#if session.notice}<p class="notice small" role="status">{session.notice}</p>{/if}
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <form class="stack form" onsubmit={submit} novalidate>
      <label class="field"><span>Username or phone</span>
        <input class="input big" id="login-user" autocomplete="username" bind:value={username} placeholder="+254 7xx xxx xxx" aria-invalid={!!error} /></label>
      <label class="field"><span>Password</span>
        <span class="pw"><input class="input big" id="login-pass" type={showPass ? 'text' : 'password'} autocomplete="current-password" bind:value={password} aria-invalid={!!error} />
          <button type="button" class="eye" aria-label={showPass ? 'Hide the password' : 'Show the password'} aria-pressed={showPass} onclick={() => (showPass = !showPass)}>{#if showPass}<EyeOff size={18} />{:else}<Eye size={18} />{/if}</button></span></label>
      <button class="btn btn-primary btn-lg btn-block" disabled={!!busy}><LogIn size={18} />{busy === 'form' ? 'Signing in…' : 'Sign in'}</button>
    </form>

    {#if office.length}
      <section aria-labelledby="demo-h">
        <div class="row between head"><span id="demo-h" class="overline">Or try a demo account</span><span class="caption">web {DEMO_PASSWORD} · app PIN 1234</span></div>
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

  <!-- V3-16: the brand side. Deep blue panel with a notched corner; the truck card below carries the orange. -->
  <aside class="side" aria-label="About BTW">
    <div class="hero">
      <span class="notch" aria-hidden="true"><span class="live"><i></i>Live tracking</span></span>
      <svg class="routes" viewBox="0 0 600 520" preserveAspectRatio="none" aria-hidden="true">
        <path d="M-20 430 C 120 380, 170 250, 300 260 S 470 150, 640 90" />
        <path d="M-20 500 C 160 470, 260 360, 380 380 S 540 300, 640 260" />
        <path class="on" d="M-20 430 C 120 380, 170 250, 300 260" />
        <circle class="stop" cx="300" cy="260" r="7" /><circle class="stop" cx="470" cy="180" r="5" /><circle class="stop dim" cx="380" cy="380" r="5" />
      </svg>
      <h2 class="bh">Every truck, order and case, from the supplier to the sale.</h2>
      <ul class="bl"><li>Plans and purchase orders</li><li>Trucks and shipments, live</li><li>Stock, sales and money, by warehouse</li></ul>
    </div>
    <div class="trk">
      <span class="tic"><Truck size={22} aria-hidden="true" /></span>
      <div class="tx">
        <strong>Follow every truck on the road</strong>
        <span class="caption">Check-ins, border crossings, delays and arrivals in one place.</span>
        <div class="lane" aria-hidden="true"><span class="fill"></span><i class="d d1"></i><i class="d d2"></i><i class="d d3"></i></div>
        <div class="lbls" aria-hidden="true"><span>Loading point</span><span>Border</span><span>Warehouse</span></div>
      </div>
    </div>
  </aside>
</div>

<style>
  /* V3-16: white page; form on the left, the brand panel (deep blue, notched) on the right, orange only on the truck card */
  .wrap { min-height: 100vh; display: grid; grid-template-columns: minmax(0, 1fr); justify-items: center; align-content: start; gap: var(--space-6); padding: var(--space-6) var(--space-4) var(--space-8); background: var(--surface); }
  .col { width: min(440px, 100%); display: flex; flex-direction: column; gap: var(--space-5); }
  .hello h1 { font: 800 34px/1.15 var(--ff-display); margin: 0 0 6px; letter-spacing: -.01em; }
  .hello p { margin: 0; }
  .form .input.big { border-radius: 14px; background: var(--surface-sunken); border-color: transparent; }
  .form .input.big:focus { background: var(--surface); border-color: var(--primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 18%, transparent); }
  .form .btn { border-radius: 14px; height: 52px; font-size: 16px; }
  .side { width: min(440px, 100%); display: flex; flex-direction: column; }
  .hero { position: relative; overflow: hidden; border-radius: 28px; padding: 28px 24px 96px; color: #fff;
    background: radial-gradient(120% 90% at 100% 100%, color-mix(in srgb, var(--primary) 55%, #2f6fd6) 0%, transparent 55%), linear-gradient(155deg, color-mix(in srgb, var(--primary) 82%, #000) 0%, var(--primary) 55%, color-mix(in srgb, var(--primary) 70%, #1d4f9a) 100%); }
  .notch { position: absolute; top: 0; right: 0; z-index: 2; display: grid; place-items: center; width: 150px; height: 52px; background: var(--surface); border-bottom-left-radius: 22px; }
  .notch::before, .notch::after { content: ''; position: absolute; width: 22px; height: 22px; background: radial-gradient(circle at 0 100%, transparent 21.5px, var(--surface) 22px); }
  .notch::before { top: 0; left: -22px; } .notch::after { bottom: -22px; right: 0; }
  .live { display: inline-flex; align-items: center; gap: 7px; font: 700 12.5px/1 var(--ff-body); color: var(--text); padding: 8px 12px; border-radius: 99px; background: var(--surface-sunken); }
  .live i { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 22%, transparent); animation: pulse 2s ease-in-out infinite; }
  @keyframes pulse { 50% { box-shadow: 0 0 0 7px color-mix(in srgb, var(--accent) 6%, transparent); } }
  @media (prefers-reduced-motion: reduce) { .live i { animation: none; } }
  .routes { position: absolute; left: 0; right: 0; bottom: 0; width: 100%; height: 52%; z-index: 0; }
  .routes path { fill: none; stroke: rgb(255 255 255 / .16); stroke-width: 2; stroke-dasharray: 2 9; stroke-linecap: round; }
  .routes path.on { stroke: rgb(255 255 255 / .55); stroke-dasharray: none; stroke-width: 2.5; }
  .routes .stop { fill: var(--accent); stroke: rgb(255 255 255 / .9); stroke-width: 2; } .routes .stop.dim { fill: rgb(255 255 255 / .5); }
  .bh, .bl { position: relative; z-index: 1; }
  .bh { margin-top: 44px !important; }
  .pw { position: relative; display: block; } .pw .input { padding-right: 48px; }
  .bh { font: 800 26px/1.2 var(--ff-display); margin: 0 0 18px; color: #fff; max-width: 18ch; letter-spacing: -.01em; }
  .bl { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 10px; font-size: 15px; color: rgb(255 255 255 / .86); }
  .bl li { display: flex; align-items: center; gap: 10px; }
  .bl li::before { content: ''; width: 18px; height: 2px; border-radius: 2px; background: rgb(255 255 255 / .55); flex: none; }
  .trk { position: relative; z-index: 2; display: flex; gap: 14px; align-items: flex-start; margin: -72px 14px 0; padding: 18px; border-radius: 22px; background: var(--surface); border: 1px solid var(--border); box-shadow: 0 18px 40px -18px rgb(6 41 83 / .35); }
  .tic { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 14px; flex: none; background: color-mix(in srgb, var(--accent) 14%, var(--surface)); color: var(--accent-text, var(--accent)); }
  .trk .tx { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1; }
  .trk strong { font: 700 15.5px/1.3 var(--ff-display); }
  .lane { position: relative; height: 6px; margin: 14px 4px 6px; border-radius: 99px; background: var(--surface-sunken); }
  .lane .fill { position: absolute; left: 0; top: 0; bottom: 0; width: 56%; border-radius: 99px; background: linear-gradient(90deg, color-mix(in srgb, var(--accent) 55%, var(--surface)), var(--accent)); }
  .lane .d { position: absolute; top: 50%; width: 12px; height: 12px; margin: -6px 0 0 -6px; border-radius: 50%; background: var(--surface); border: 2px solid var(--border-strong, var(--border)); }
  .lane .d1 { left: 0; border-color: var(--accent); background: var(--accent); } .lane .d2 { left: 50%; border-color: var(--accent); } .lane .d3 { left: 100%; }
  .lbls { display: flex; justify-content: space-between; font-size: 11.5px; color: var(--text-muted); }
  @media (min-width: 1000px) {
    .wrap { grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr); align-items: stretch; align-content: stretch; gap: 0; padding: 20px; }
    .col { align-self: center; padding: 48px 32px; }
    .logos { width: 300px; }
    .side { width: auto; position: sticky; top: 20px; height: calc(100vh - 40px); }
    .hero { flex: 1; padding: 44px 44px 150px; border-radius: 32px; }
    .bh { font-size: 38px; margin-bottom: 26px; }
    .bh { margin-top: 96px !important; }
    .bl { font-size: 16px; }
    .trk { margin: -118px 44px 0 44px; max-width: 460px; padding: 22px; border-radius: 26px; }
  }
  .eye { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); width: 40px; height: 40px; border: 0; border-radius: 50%; background: transparent; color: var(--text-muted); display: grid; place-items: center; cursor: pointer; }
  .eye:hover { background: var(--surface-sunken); color: var(--text); }
  .logos { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-3); align-items: center; }
  .logos img { width: 100%; height: 40px; object-fit: contain; }
  .ghead { display: flex; align-items: center; gap: var(--space-2); margin: var(--space-3) 0 var(--space-1); }
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
