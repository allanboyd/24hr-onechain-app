<script lang="ts">
  // Management · Settings (V3-12 step 0, decisions 26 Nov): the approval switch for advance payments to suppliers (off by
  // default) and each person's email / SMS choices for money notifications. In-app notifications always reach directors.
  import { auth, settings, type MoneySettings, type NotifyPrefs } from '@btw/api';
  import { say } from '@btw/ui';
  import ErrorState from '../../components/ErrorState.svelte';
  import { watch } from '../../lib/load.svelte';
  import ShieldCheck from '@lucide/svelte/icons/shield-check';
  import Bell from '@lucide/svelte/icons/bell';
  import Mail from '@lucide/svelte/icons/mail';
  import MessageSquare from '@lucide/svelte/icons/message-square';

  const user = auth.me();
  const canChange = !!user && (user.roles.includes('director') || user.roles.includes('admin'));
  const isDirector = !!user?.roles.includes('director');

  let money = $state<MoneySettings | null>(null);
  let mine = $state<NotifyPrefs | null>(null);
  let busy = $state('');
  let error = $state('');
  const w = watch(async () => { [money, mine] = await Promise.all([settings.money(), settings.myNotify()]); }, () => []);

  async function setApproval(on: boolean) {
    busy = 'approval'; error = '';
    try { money = await settings.setMoney({ advanceApproval: on }); say(on ? 'Advance payments now wait for a director' : 'Advance payments count when recorded'); }
    catch (e) { error = (e as Error).message; } finally { busy = ''; }
  }
  async function setChannel(k: keyof NotifyPrefs, on: boolean) {
    busy = k; error = '';
    try { mine = await settings.setMyNotify({ [k]: on }); say(on ? `${k === 'email' ? 'Email' : 'SMS'} turned on` : `${k === 'email' ? 'Email' : 'SMS'} turned off`); }
    catch (e) { error = (e as Error).message; } finally { busy = ''; }
  }
</script>

{#snippet toggle(on: boolean, label: string, disabled: boolean, set: (v: boolean) => void)}
  <button type="button" class="sw" role="switch" aria-checked={on} aria-label={label} {disabled} onclick={() => set(!on)}><span class="knob"></span></button>
{/snippet}

<section class="mrep" aria-labelledby="st-h">
  <header><h1 id="st-h">Settings</h1><p class="muted">How money records are approved and who hears about them.</p></header>
  <ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />
  {#if error}<p class="note bad" role="alert">{error}</p>{/if}
  {#if money && mine}
    <div class="card">
      <h3 class="ct"><span class="t"><ShieldCheck size={18} aria-hidden="true" />Approvals</span></h3>
      <div class="row">
        <div class="grow">
          <div class="lbl">Advance payments to suppliers need director approval</div>
          <p class="muted small">{money.advanceApproval
            ? 'On: an advance waits as "Pending approval" until a director approves it, like transport payments.'
            : 'Off: an advance counts as soon as it is recorded. The system keeps who recorded it and tells the directors.'}</p>
        </div>
        {@render toggle(money.advanceApproval, 'Advance payments need director approval', !canChange || busy === 'approval', setApproval)}
      </div>
      {#if !canChange}<p class="muted small">Only directors and the system administrator change this.</p>{/if}
    </div>

    <div class="card">
      <h3 class="ct"><span class="t"><Bell size={18} aria-hidden="true" />My notifications</span></h3>
      <p class="muted small lead">Money records (advance payments, credit notes, cash sent to the company account) always show in the directors' alerts in the app. You can also get them by email or SMS.</p>
      <div class="row">
        <Mail size={18} aria-hidden="true" />
        <div class="grow"><div class="lbl">Email</div><p class="muted small">To the email in Users and access.</p></div>
        {@render toggle(mine.email, 'Email me money notifications', busy === 'email', (v) => setChannel('email', v))}
      </div>
      <div class="row">
        <MessageSquare size={18} aria-hidden="true" />
        <div class="grow"><div class="lbl">SMS</div><p class="muted small">To {user?.phone || 'the phone in Users and access'}.</p></div>
        {@render toggle(mine.sms, 'Text me money notifications', busy === 'sms', (v) => setChannel('sms', v))}
      </div>
      {#if !isDirector}<p class="muted small">Money notifications go to directors. Your choices apply if you are given the director role.</p>{/if}
    </div>
  {/if}
</section>

<style>
  .mrep { display: flex; flex-direction: column; gap: 14px; max-width: 760px; }
  header h1 { font-size: 24px; line-height: 30px; } header p { margin: 2px 0 0; }
  .ct { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 15px; margin-bottom: 6px; }
  .t { display: inline-flex; align-items: center; gap: 8px; }
  .row { display: flex; align-items: center; gap: 14px; padding: 12px 0; border-top: 1px solid var(--border); }
  .ct + .row { border-top: 0; }
  .grow { flex: 1; min-width: 0; }
  .lbl { font-weight: 600; }
  .row p, .lead { margin: 2px 0 0; }
  .lead { margin-bottom: 6px; }
  .small { font-size: 13px; }
  .note.bad { margin: 0; padding: 10px 12px; border-radius: 10px; background: var(--danger-subtle); color: var(--danger); }
  .sw { position: relative; flex: none; width: 44px; height: 24px; border-radius: 99px; border: 0; padding: 0; cursor: pointer; background: var(--border-strong, var(--border)); transition: background var(--motion-fast) var(--motion-easing); }
  .sw .knob { position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: var(--surface); box-shadow: 0 1px 2px rgb(0 0 0 / 0.2); transition: transform var(--motion-fast) var(--motion-easing); }
  .sw[aria-checked='true'] { background: var(--primary); }
  .sw[aria-checked='true'] .knob { transform: translateX(20px); }
  .sw:disabled { opacity: 0.55; cursor: not-allowed; }
  .sw:focus-visible { outline: 2px solid var(--focus, var(--primary)); outline-offset: 2px; }
</style>
