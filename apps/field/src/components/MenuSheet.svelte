<script lang="ts">
  // Everything that is not the main task lives here: who I am, what is waiting to send, help, language, sign out.
  import { demo, mode, type User } from '@btw/api';
  import { outbox, type OutboxState } from '@btw/api/outbox';
  import { ago, say } from '@btw/ui';
  import Sheet from './Sheet.svelte';
  import { APP_VERSION, ROLE_LABEL, fieldRole } from '../lib';
  let { user, onclose, onlogout, smsHelp = '' }: { user: User; onclose: () => void; onlogout: () => void; smsHelp?: string } = $props();
  let s = $state<OutboxState>({ online: true, pending: [], syncing: false });
  $effect(() => outbox.subscribe((v) => (s = v)));
  let offline = $state(outbox.forcedOffline);
  let theme = $state((() => { try { return localStorage.getItem('btw-theme') || ''; } catch { return ''; } })());
  $effect(() => { theme ? document.documentElement.setAttribute('data-theme', theme) : document.documentElement.removeAttribute('data-theme'); try { localStorage.setItem('btw-theme', theme); } catch {} });
  const role = $derived(fieldRole(user));
  const opLabel: Record<string, string> = { 'leg.pass': 'Check-in', 'leg.issue': 'Problem report', 'leg.acknowledge': 'Delivery receipt', 'loading.confirm': 'Loading hand-over', 'sale.create': 'Sale' };
</script>
<Sheet modal title="Menu" {onclose}>
  <div class="me">
    <div class="avatar" aria-hidden="true">{user.name.slice(0, 1)}</div>
    <div class="grow"><strong>{user.name}</strong><div class="caption">{role ? ROLE_LABEL[role] : ''} · {user.phone}</div></div>
  </div>

  <section class="block">
    <div class="row between"><h3>Waiting to send</h3><span class="caption">{s.lastSync ? `Last sent ${ago(s.lastSync)}` : ''}</span></div>
    {#if s.pending.length}
      <ul class="queue">
        {#each s.pending as it (it.idempotencyKey)}
          <li><span class="grow">{opLabel[it.op] ?? it.op}<span class="caption"> · {ago(it.createdAt)}</span>{#if it.error}<span class="error"> · {it.error}</span>{/if}</span>
            <button class="link" onclick={() => outbox.discard(it.idempotencyKey)}>Remove</button></li>
        {/each}
      </ul>
      <button class="btn btn-secondary btn-block" onclick={() => outbox.flush()} disabled={!s.online || s.syncing}>{s.online ? 'Send now' : 'Waiting for signal'}</button>
    {:else}<p class="muted small">Nothing waiting. Everything you did has been sent.</p>{/if}
    <label class="row between toggle"><span>Work offline (test)</span><input type="checkbox" class="switch" bind:checked={offline} onchange={() => outbox.setForcedOffline(offline)} /></label>
  </section>

  {#if smsHelp}
    <section class="block"><h3>No data?</h3><p class="small">Send an SMS to <strong>2xxxx</strong>:</p><code>{smsHelp}</code><p class="caption">Use DEP when you leave, FIX when moving again.</p></section>
  {/if}

  <section class="block">
    <label class="row between"><span>Language</span><select class="select" style="width:auto"><option>English</option><option disabled>Kiswahili (soon)</option><option disabled>Français (soon)</option></select></label>
    <label class="row between"><span>Theme</span><select class="select" style="width:auto" bind:value={theme}><option value="">Phone setting</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
  </section>

  <button class="btn btn-secondary btn-block" onclick={onlogout}>Sign out</button>
  <div class="row between caption"><span>BTW Field {APP_VERSION}</span>{#if mode === 'mock'}<button class="link" onclick={() => { demo.reset(); say('Demo data reset'); onclose(); }}>Reset demo data</button>{/if}</div>
</Sheet>
<style>
  .me { display: flex; align-items: center; gap: var(--space-3); }
  .avatar { width: 48px; height: 48px; border-radius: 50%; background: var(--primary); color: var(--text-on-primary); display: grid; place-items: center; font: 700 20px var(--ff-display); }
  .block { display: flex; flex-direction: column; gap: var(--space-2); padding-top: var(--space-3); border-top: 1px solid var(--border); }
  .block h3 { font-size: var(--fs-h4); line-height: var(--lh-h4); }
  .queue { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .queue li { display: flex; align-items: center; gap: var(--space-2); }
  .link { border: 0; background: none; color: var(--link); font: 600 14px var(--ff-body); cursor: pointer; padding: 8px 0; }
  .toggle { min-height: 48px; }
  code { display: block; font: 700 18px var(--ff-mono); background: var(--surface-sunken); padding: 10px 12px; border-radius: var(--radius-md); }
  .row { display: flex; align-items: center; gap: var(--space-3); }
  .between { justify-content: space-between; }
  .grow { flex: 1; min-width: 0; }
</style>
