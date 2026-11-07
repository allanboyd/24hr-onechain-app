<script lang="ts">
  // Field app: driver / loader / receiver share a 3-tab shell (Now · List · Me). Office roles get BTW Team
  // (its own five tabs). Each is its own chunk so a phone only downloads the screens it needs.
  import { auth, configure, ready, type User } from '@btw/api';
  import { Toast, say } from '@btw/ui';
  import { APP_VERSION, fieldRole } from './lib';
  import { shouldHint } from './pwa';
  import Login from './screens/Login.svelte';
  // Each role's screen is its own chunk: a phone downloads only the screen its user needs (keeps the entry small).
  const screens = {
    driver: () => import('./shell/FieldShell.svelte'),
    loader: () => import('./shell/FieldShell.svelte'),
    receiver: () => import('./shell/FieldShell.svelte'),
    team: () => import('./team/Team.svelte'),
  } as const;

  configure({ channel: 'app', appVersion: APP_VERSION });
  let loaded = $state(false);
  ready().then(() => (loaded = true), () => (loaded = true));
  let user = $state<User | null>(auth.me());
  const role = $derived(user ? fieldRole(user) ?? 'team' : null);
  try { const t = localStorage.getItem('btw-theme'); if (t) document.documentElement.setAttribute('data-theme', t); } catch { /* ignore */ }
  function logout() { auth.logout(); user = null; try { history.replaceState(null, '', location.pathname); } catch { /* ignore */ } }
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
