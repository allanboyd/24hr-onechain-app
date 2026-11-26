<script lang="ts">
  // V3-13 Settings & alerts → Approvals: how money records are approved. Directors and the system administrator.
  import { settings, type MoneySettings } from '@btw/api';
  import { say } from '@btw/ui';
  import ErrorState from '../../components/ErrorState.svelte';
  import { watch } from '../../lib/load.svelte';
  import Switch from './Switch.svelte';
  let { user: _u }: { user?: unknown; params?: unknown; section?: boolean } = $props();
  let money = $state<MoneySettings | null>(null);
  let busy = $state(false), error = $state('');
  const w = watch(async () => { money = await settings.money(); });
  let confirmDlg = $state<HTMLDialogElement>();
  let next = $state(false);
  function ask(on: boolean) { next = on; confirmDlg?.showModal(); }
  async function apply() {
    busy = true; error = '';
    try { money = await settings.setMoney({ advanceApproval: next }); say(next ? 'Advance payments now wait for a director' : 'Advance payments count when recorded'); confirmDlg?.close(); }
    catch (e) { error = (e as Error).message; } finally { busy = false; }
  }
</script>

<header class="sec-head"><h1>Approvals</h1><p class="muted">How money records are approved before they count.</p></header>
<ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />
{#if error}<p class="note bad" role="alert">{error}</p>{/if}
{#if money}
  <section class="card set">
    <div class="row-set">
      <div class="grow">
        <div class="lbl">Advance payments to suppliers need director approval</div>
        <p class="muted small">{money.advanceApproval
          ? 'On: an advance waits as "Pending approval" until a director approves it on the purchase order.'
          : 'Off: an advance counts as soon as it is recorded. The system keeps who recorded it and tells the directors.'}</p>
      </div>
      <Switch on={money.advanceApproval} label="Advance payments need director approval" disabled={busy} onchange={ask} />
    </div>
  </section>
{/if}

<dialog class="sheet" bind:this={confirmDlg} style="width:min(460px,calc(100vw - 32px))" aria-labelledby="ap-h">
  <div class="body stack">
    <h3 id="ap-h">{next ? 'Turn approval on?' : 'Turn approval off?'}</h3>
    <p class="small">{next ? 'New advance payments will wait for a director before they count. Advances already recorded stay as they are.' : 'New advance payments will count as soon as they are recorded. Advances already waiting still need a decision.'}</p>
    <div class="row" style="justify-content:flex-end"><button class="btn btn-ghost" onclick={() => confirmDlg?.close()}>Cancel</button><button class="btn btn-primary" disabled={busy} onclick={apply}>{next ? 'Turn on' : 'Turn off'}</button></div>
  </div>
</dialog>

<style>
  .sec-head { margin-bottom: var(--space-4); } .sec-head h1 { font-size: 24px; line-height: 30px; margin: 0; } .sec-head p { margin: 2px 0 0; }
  .set { padding: var(--space-4) var(--space-5); }
  .row-set { display: flex; align-items: center; gap: 14px; }
  .grow { flex: 1; min-width: 0; } .lbl { font-weight: 600; } .small { font-size: 13px; } .row-set p { margin: 2px 0 0; }
  .note.bad { margin: 0 0 var(--space-3); padding: 10px 12px; border-radius: 10px; background: var(--danger-subtle); color: var(--danger); }
</style>
