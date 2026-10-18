<script lang="ts">
  // Field app: three single-task experiences (driver, loading point, receiver) — no tabs, no back stack —
  // and BTW Team, the office roles' app (tabs, drawer, home menu). Each is its own chunk.
  import { auth, configure, ready, type User } from '@btw/api';
  import { Toast, say } from '@btw/ui';
  import { APP_VERSION, fieldRole } from './lib';
  import { shouldHint } from './pwa';
  import Login from './screens/Login.svelte';
  // Each role's screen is its own chunk: a phone downloads only the screen its user needs (keeps the entry small).
  const screens = {
    driver: () => import('./screens/Driver.svelte'),
    loader: () => import('./screens/LoadingPoint.svelte'),
    receiver: () => import('./screens/Receiver.svelte'),
    team: () => import('./team/Team.svelte'),
  } as const;

  configure({ channel: 'app', appVersion: APP_VERSION });
  let loaded = $state(false);
  ready().then(() => (loaded = true), () => (loaded = true));
  let user = $state<User | null>(auth.me());
  const role = $derived(user ? fieldRole(user) ?? 'team' : null);
  try { const t = localStorage.getItem('btw-theme'); if (t) document.documentElement.setAttribute('data-theme', t); } catch { /* ignore */ }
  function logout() { auth.logout(); user = null; }
  // Session ended elsewhere (PIN reset, device signed out remotely, account deactivated): back to sign-in, say why.
  $effect(() => auth.onExpired(() => { if (user) { user = null; say('You were signed out. Sign in again with your PIN.'); } }));
  // "Add to home screen" on the first visit in a browser (lazy chunk; never in the native app or once installed).
  let hint = $state(false);
  $effect(() => { if (!shouldHint()) return; const t = setTimeout(() => (hint = true), 2500); return () => clearTimeout(t); });
</script>

{#if !loaded}
  <div class="boot" aria-busy="true"></div>
{:else if !user}
  <Login onlogin={(u) => (user = u)} />
{:else if role}
  {#await screens[role]()}
    <div class="boot" aria-busy="true"></div>
  {:then m}
    <m.default {user} onlogout={logout} />
  {:catch}
    <p class="boot-err">Couldn't load this screen. Check your connection and reopen the app.</p>
  {/await}
{/if}
{#if hint}
  {#await import('./pwa/InstallHint.svelte') then m}<m.default onclose={() => (hint = false)} />{/await}
{/if}
<Toast />
<style>.boot { min-height: 100dvh; background: var(--bg); } .boot-err { padding: var(--space-6); }</style>
