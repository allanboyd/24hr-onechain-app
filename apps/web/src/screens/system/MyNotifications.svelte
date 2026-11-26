<script lang="ts">
  // V3-13 Settings & alerts → My notifications: what reaches me in the app, and email / SMS for money news.
  import { settings, type NotifyPrefs, type User } from '@btw/api';
  import { say } from '@btw/ui';
  import ErrorState from '../../components/ErrorState.svelte';
  import { watch } from '../../lib/load.svelte';
  import Switch from './Switch.svelte';
  import Mail from '@lucide/svelte/icons/mail';
  import MessageSquare from '@lucide/svelte/icons/message-square';
  import Bell from '@lucide/svelte/icons/bell';
  let { user }: { user: User; params?: unknown; section?: boolean } = $props();
  let mine = $state<NotifyPrefs | null>(null);
  let busy = $state('');
  const w = watch(async () => { mine = await settings.myNotify(); });
  const isDirector = $derived(user.roles.includes('director'));
  async function setChannel(k: keyof NotifyPrefs, on: boolean) {
    busy = k;
    try { mine = await settings.setMyNotify({ [k]: on }); say(`${k === 'email' ? 'Email' : 'SMS'} turned ${on ? 'on' : 'off'}`); }
    catch (e) { say((e as Error).message); } finally { busy = ''; }
  }
</script>

<header class="sec-head"><h1>My notifications</h1><p class="muted">What reaches you, and how.</p></header>
<ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />
{#if mine}
  <section class="card set">
    <div class="row-set"><Bell size={18} aria-hidden="true" />
      <div class="grow"><div class="lbl">In the app</div><p class="muted small">Always on. Alerts for your work ({user.roles.join(', ')}) show under Alerts and on the bell.</p></div></div>
    <div class="row-set"><Mail size={18} aria-hidden="true" />
      <div class="grow"><div class="lbl">Email for money news</div><p class="muted small">Advance payments, credit notes and cash sent to the company account, to the email in Users & access.</p></div>
      <Switch on={mine.email} label="Email me money notifications" disabled={busy === 'email'} onchange={(v) => setChannel('email', v)} /></div>
    <div class="row-set"><MessageSquare size={18} aria-hidden="true" />
      <div class="grow"><div class="lbl">SMS for money news</div><p class="muted small">The same news by text, to {user.phone || 'the phone in Users & access'}.</p></div>
      <Switch on={mine.sms} label="Text me money notifications" disabled={busy === 'sms'} onchange={(v) => setChannel('sms', v)} /></div>
    {#if !isDirector}<p class="muted small foot">Money news goes to directors. Your choices apply if you are given the director role.</p>{/if}
  </section>
{/if}

<style>
  .sec-head { margin-bottom: var(--space-4); } .sec-head h1 { font-size: 24px; line-height: 30px; margin: 0; } .sec-head p { margin: 2px 0 0; }
  .set { padding: var(--space-2) var(--space-5); }
  .row-set { display: flex; align-items: center; gap: 14px; padding: 12px 0; border-top: 1px solid var(--border); }
  .row-set:first-child { border-top: 0; }
  .grow { flex: 1; min-width: 0; } .lbl { font-weight: 600; } .small { font-size: 13px; } .row-set p { margin: 2px 0 0; }
  .foot { margin: 4px 0 12px; }
</style>
