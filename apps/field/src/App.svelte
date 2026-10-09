<script lang="ts">
  // Field app: three single-task experiences. No tabs, no back stack — one screen per role, task sheets on top.
  import { auth, configure, ready, type User } from '@btw/api';
  import { Toast, say } from '@btw/ui';
  import { APP_VERSION, fieldRole } from './lib';
  import Login from './screens/Login.svelte';
  import WebOnly from './screens/WebOnly.svelte';
  import Driver from './screens/Driver.svelte';
  import LoadingPoint from './screens/LoadingPoint.svelte';
  import Receiver from './screens/Receiver.svelte';

  configure({ channel: 'app', appVersion: APP_VERSION });
  let loaded = $state(false);
  ready().then(() => (loaded = true), () => (loaded = true));
  let user = $state<User | null>(auth.me());
  const role = $derived(user ? fieldRole(user) : null);
  try { const t = localStorage.getItem('btw-theme'); if (t) document.documentElement.setAttribute('data-theme', t); } catch { /* ignore */ }
  function logout() { auth.logout(); user = null; }
  // Session ended elsewhere (PIN reset, device signed out remotely, account deactivated): back to sign-in, say why.
  $effect(() => auth.onExpired(() => { if (user) { user = null; say('You were signed out. Sign in again with your PIN.'); } }));
</script>

{#if !loaded}
  <div class="boot" aria-busy="true"></div>
{:else if !user}
  <Login onlogin={(u) => (user = u)} />
{:else if role === 'driver'}
  <Driver {user} onlogout={logout} />
{:else if role === 'loader'}
  <LoadingPoint {user} onlogout={logout} />
{:else if role === 'receiver'}
  <Receiver {user} onlogout={logout} />
{:else}
  <WebOnly {user} onlogout={logout} />
{/if}
<Toast />
<style>.boot { min-height: 100dvh; background: var(--bg); }</style>
