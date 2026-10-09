<script lang="ts">
  import { auth, type User } from '@btw/api';
  import { describe } from '../lib/errors';
  import { session, signIn } from '../lib/session.svelte';
  import { showDemoHelpers, API_MODE } from '../lib/mode';
  import { brand } from '../lib/brand';
  import LogIn from '@lucide/svelte/icons/log-in';

  // Field-only roles sign in on the phone app; the web keeps everyone else.
  const FIELD_ONLY = ['driver'];
  const demo: User[] = showDemoHelpers ? auth.demoUsers().filter((u) => !u.roles.every((r) => FIELD_ONLY.includes(r))) : [];
  let username = $state('');
  let password = $state('');
  let error = $state('');
  let busy = $state(false);

  async function submit(e: Event) {
    e.preventDefault();
    if (!username.trim() || !password) { error = 'Enter your username or phone number and your password.'; return; }
    busy = true; error = '';
    try { await signIn(username, password); }
    catch (err) { const d = describe(err); error = d.kind === 'auth' || d.kind === 'rule' ? 'Wrong username or password.' : d.message; }
    finally { busy = false; }
  }
  function pick(u: User) { username = u.phone; password = 'demo1234'; error = ''; }
</script>

<div class="wrap">
  <div class="col">
    <form class="card stack" onsubmit={submit} novalidate>
      <img src={brand.logoFull} alt="BTW Global Distributors" class="logo" />
      <div class="ribbon"></div>
      <div><h2>Sign in</h2><p class="muted small">Supply chain, logistics, inventory and sales.</p></div>
      {#if session.notice}<p class="notice small" role="status">{session.notice}</p>{/if}
      <label class="field"><span>Username or phone</span>
        <input class="input" id="login-user" autocomplete="username" bind:value={username} placeholder="e.g. +254700000002" aria-invalid={!!error} /></label>
      <label class="field"><span>Password</span>
        <input class="input" id="login-pass" type="password" autocomplete="current-password" bind:value={password} aria-invalid={!!error} /></label>
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      <button class="btn btn-primary btn-lg btn-block" disabled={busy}><LogIn size={18} />{busy ? 'Signing in…' : 'Sign in'}</button>
      <p class="caption">Drivers, loading-point staff and receivers use the BTW field app on their phone. Directors and admins: two-factor sign-in comes with the production release (UA-04).</p>
    </form>

    {#if demo.length}
      <section class="card demo" aria-label="Demo accounts">
        <div class="row between"><span class="overline">Demo accounts · {API_MODE} data</span><span class="caption">password demo1234</span></div>
        <ul>
          {#each demo as u (u.id)}
            <li><button type="button" class="btn btn-ghost btn-sm" onclick={() => pick(u)}><strong>{u.name}</strong><span class="caption">{u.roles.join(' · ')}</span></button></li>
          {/each}
        </ul>
      </section>
    {/if}
  </div>
</div>

<style>
  .wrap { min-height: 100vh; display: grid; place-items: center; padding: var(--space-4); background: var(--bg); }
  .col { width: min(420px, 100%); display: flex; flex-direction: column; gap: var(--space-4); }
  .logo { width: 220px; align-self: center; background: var(--logo-tile); border-radius: var(--radius-md); padding: 8px; }
  .notice { background: var(--info-subtle); color: var(--info); padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); margin: 0; }
  .demo ul { list-style: none; margin: var(--space-2) 0 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 2px; }
  .demo .btn { width: 100%; height: auto; padding: var(--space-2); flex-direction: column; align-items: flex-start; gap: 0; color: var(--text); white-space: normal; text-align: left; }
  @media (max-width: 420px) { .demo ul { grid-template-columns: 1fr; } }
</style>
