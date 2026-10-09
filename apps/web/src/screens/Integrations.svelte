<script lang="ts">
  // Integrations: which providers are real vs local stand-ins, and an SMS check-in tester (drivers without data, §4.2 of the MVP plan).
  import { ref, type User } from '@btw/api';
  import { Badge, ago } from '@btw/ui';
  import { integrations, isNotAvailable, type IntegrationStatus } from '../lib/admin';
  import { watch } from '../lib/load.svelte';
  import { describe } from '../lib/errors';
  import { API_MODE } from '../lib/mode';
  import ErrorState from '../components/ErrorState.svelte';
  import Send from '@lucide/svelte/icons/send';
  import PlugZap from '@lucide/svelte/icons/plug-zap';
  let { user }: { user: User } = $props();

  const r = ref();
  let status = $state<IntegrationStatus[] | null>(null);
  let outbox = $state<{ phone: string; text: string; at: string; direction: 'in' | 'out' }[]>([]);
  const w = watch(async () => {
    status = await integrations.status();
    try { outbox = await integrations.smsLog(); } catch { outbox = []; }
  });
  const unavailable = $derived(!!w.error && isNotAvailable(w.error));

  const drivers = r.drivers;
  let from = $state(drivers[0]?.phone ?? '+254711000001');
  let text = $state('ARR MALABA KDA123A');
  let reply = $state('');
  let sendError = $state('');
  let sending = $state(false);
  const examples = ['ARR MALABA KDA123A', 'DEP MALABA KDA123A', 'FIX KDA123A', 'OFF KDA123A'];
  async function send(e: Event) {
    e.preventDefault(); sending = true; reply = ''; sendError = '';
    try { const r = await integrations.smsInbound(from, text); reply = r.reply || (r.ok ? 'Accepted.' : 'Not applied.'); w.retry(); }
    catch (err) { sendError = isNotAvailable(err) ? 'The SMS tester isn’t available on this server.' : describe(err).message; }
    sending = false;
  }
  const PLANNED = [
    ['SMS / USSD', "Africa's Talking — driver check-ins by SMS, alerts, PINs"],
    ['Email', 'SMTP — PO letters to supplier export sections, digests'],
    ['Push', 'Firebase Cloud Messaging — field app alerts'],
    ['PDF', 'Typst — PO letter and acknowledgement PDFs'],
    ['Files', 'Document store — photos, signatures, PDFs'],
    ['Routing', 'OSRM — drive times that seed checkpoint plans'],
  ];
</script>

<div class="page-head"><div><div class="overline crumb">Admin</div><h1>Integrations</h1></div></div>

{#if unavailable || (w.error && !w.loaded)}
  {#if unavailable}
    <div class="card stack-sm calm">
      <div class="row"><PlugZap size={22} /><h3>{API_MODE === 'mock' ? 'Demo mode has no server' : 'Integration status isn’t on this server yet'}</h3></div>
      <p class="small muted">{API_MODE === 'mock' ? 'This build uses data stored in your browser, so no messages, emails or PDFs leave it. Start the API and open the web app with VITE_API=http to see live status.' : 'The API doesn’t expose /dev/integrations. It is only enabled outside production.'}</p>
      <ul class="planned">{#each PLANNED as [n, d]}<li><strong>{n}</strong><span class="small muted">{d}</span></li>{/each}</ul>
    </div>
  {:else}<ErrorState error={w.error} onretry={w.retry} />{/if}
{:else}
  <ErrorState error={w.error} onretry={w.retry} compact />
  <div class="grid cards">
    {#if !status}{#each Array(6) as _}<div class="card"><div class="skeleton"></div></div>{/each}{/if}
    {#each status ?? [] as s (s.name)}
      <div class="card stack-sm">
        <div class="row between"><strong>{s.name}</strong><Badge tone={s.mode === 'real' ? 'success' : 'warning'}>{s.mode === 'real' ? 'Connected' : 'Local stand-in'}</Badge></div>
        {#if s.detail}<p class="small muted">{s.detail}</p>{/if}
        {#if s.inspectUrl}<a class="small" href={s.inspectUrl} target="_blank" rel="noreferrer">Open inbox</a>{/if}
      </div>
    {/each}
  </div>
  <p class="caption">Stand-ins become live when the matching key is set in the server’s .env; no code changes.</p>

  <section class="grid two">
    <form class="card stack" onsubmit={send}>
      <h3>SMS check-in tester</h3>
      <p class="small muted">Sends a message as if a driver texted the shortcode. The server applies it to the driver’s active trip and replies.</p>
      <label class="field"><span>From (driver phone)</span>
        <select class="select" bind:value={from}>{#each drivers as d}<option value={d.phone}>{d.name} · {d.phone}{d.hasApp ? '' : ' · no app'}</option>{/each}</select></label>
      <label class="field"><span>Message</span><input class="input mono" bind:value={text} /></label>
      <div class="row" style="gap:6px">{#each examples as ex}<button type="button" class="btn btn-ghost btn-sm mono" onclick={() => (text = ex)}>{ex}</button>{/each}</div>
      {#if sendError}<p class="error" role="alert">{sendError}</p>{/if}
      {#if reply}<p class="reply small" role="status"><strong>Reply:</strong> {reply}</p>{/if}
      <button class="btn btn-primary" disabled={sending}><Send size={16} />{sending ? 'Sending…' : 'Send test SMS'}</button>
    </form>
    <div class="card flush">
      <header><h3>Recent SMS (stand-in inbox)</h3></header>
      <ul class="out">
        {#each outbox as m}<li><div class="row between"><span class="small"><Badge tone={m.direction === 'in' ? 'info' : 'neutral'}>{m.direction === 'in' ? 'From' : 'To'}</Badge> <span class="mono">{m.phone}</span></span><span class="caption">{ago(m.at)}</span></div><div class="small">{m.text}</div></li>
        {:else}<li class="empty small">Nothing sent yet.</li>{/each}
      </ul>
    </div>
  </section>
{/if}

<style>
  .cards { grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); margin-bottom: var(--space-2); }
  .two { grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); margin-top: var(--space-6); align-items: start; }
  .calm h3 { margin: 0; }
  .planned { list-style: none; margin: var(--space-2) 0 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: var(--space-3); }
  .planned li { display: flex; flex-direction: column; }
  .reply { background: var(--success-subtle); color: var(--success); padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); margin: 0; }
  .out { list-style: none; margin: 0; padding: 0; }
  .out li { padding: var(--space-3) var(--space-5); border-bottom: 1px solid var(--border); }
  .out li:last-child { border-bottom: 0; }
</style>
