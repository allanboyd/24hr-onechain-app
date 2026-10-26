<script lang="ts">
  // One trip's money: cost lines, payments (approve if director), record a payment.
  // Payments above the limit wait for a director (finance.approve).
  import { withUnusualConfirm } from '@btw/api/amounts';
  import { finance, type User } from '@btw/api';
  import { Badge, fmtDateTime, say } from '@btw/ui';
  import Plus from '@lucide/svelte/icons/plus';
  import CompanyChip from '../../components/CompanyChip.svelte';
  import Sheet from '../../components/Sheet.svelte';
  import { mayApprovePayments, mayRecordPayments, mayRecordTruckMoney, paymentLimit } from '../access';
  import { co } from '../company.svelte';
  import { Res, onRefresh } from '../load.svelte';
  import { costLabel, paidOn, transporter } from '../money';
  import { truckReg } from '../shipment';
  import { num, usd, usdFull } from '../fmt';
  import { haptic } from '../../native';
  import Meter from '../components/Meter.svelte';
  import Skeleton from '../components/Skeleton.svelte';
  import Empty from '../components/Empty.svelte';
  import ErrorNote from '../components/ErrorNote.svelte';
  import type { View } from '../routes';
  let { user, view }: { user: User; view: View; query: URLSearchParams } = $props();
  const id = $derived((view as { id?: string }).id!);
  const r = new Res(async () => (await finance.trips()).find((t) => t.shipment.id === id) ?? null);
  $effect(() => r.live());
  $effect(() => onRefresh(() => r.reload()));
  const t = $derived(r.data);
  const readOnly = $derived(co.active === null);
  /** The directors record payments; the truck follow-up officer reads them and records the agreed price (docs/12). */
  const mayPay = $derived(mayRecordPayments(user));
  const mayAgree = $derived(mayRecordTruckMoney(user));
  let agreeing = $state(false), apAmount = $state<number>(0), apCur = $state<'USD' | 'KES' | 'UGX' | 'TZS' | 'RWF'>('USD');
  async function saveAgreed() {
    error = '';
    if (!(apAmount > 0)) { error = 'Enter the agreed price'; return; }
    busy = true;
    try { if (!(await withUnusualConfirm((confirmUnusual) => finance.setAgreedPrice(id, { amount: apAmount, currency: apCur, confirmUnusual })))) return; haptic('success'); agreeing = false; say('Agreed transport price recorded'); await r.reload(); }
    catch (e) { error = (e as Error).message; haptic('warning'); } finally { busy = false; }
  }

  let paying = $state(false), costId = $state(''), amount = $state<number>(0), reference = $state(''), busy = $state(false), error = $state('');
  function openPay() {
    const c = t!.costs.find((c) => c.kind === 'Transport' && paidOn(t!, c.id) < c.amount) ?? t!.costs[0];
    costId = c?.id ?? ''; amount = c ? Math.max(0, Math.round((c.amount - paidOn(t!, c.id)) * 100) / 100) : 0; reference = ''; error = ''; paying = true;
  }
  const cost = $derived(t?.costs.find((c) => c.id === costId));
  async function pay() {
    error = '';
    if (!(amount > 0)) { error = 'Enter the amount paid'; return; }
    if (!reference.trim()) { error = 'Enter the payment reference (M-Pesa / bank)'; return; }
    busy = true;
    try {
      const p = await withUnusualConfirm((confirmUnusual) => finance.pay(id, costId, amount, reference.trim(), paymentLimit(), { confirmUnusual }));
      if (!p) return;
      haptic('success'); paying = false;
      say(p.status === 'Pending approval' ? 'Recorded — waiting for a director to approve' : 'Payment recorded');
      await r.reload();
    } catch (e) { error = (e as Error).message; haptic('warning'); } finally { busy = false; }
  }
  async function approve(pid: string) {
    try { await finance.approve(pid); haptic('success'); say('Payment approved'); await r.reload(); } catch (e) { say((e as Error).message); }
  }
</script>

<ErrorNote error={r.error} onretry={() => r.reload()} />
{#if r.loading}
  <Skeleton kind="card" /><Skeleton rows={3} />
{:else if !t}
  <Empty title="Trip not found" text="It may belong to another company. Switch company and try again." />
{:else}
  <section class="t-card hero">
    <div class="t-row between"><span class="ref">{t.shipment.ref}</span><Badge status={t.shipment.status} /></div>
    <h2 class="t-h1">{truckReg(t.shipment.legs[0]) || t.shipment.ref}</h2>
    <p class="t-sub">{transporter(t.shipment)} · {num(t.cases)} cases</p>
    <CompanyChip entityId={t.shipment.entityId} />
    <div class="t-split totals">
      <div><span class="t-meta">Transport</span><strong>{t.agreedRecorded === false ? 'not recorded' : usd(t.transport)}</strong></div>
      <div><span class="t-meta">Still owed</span><strong class:ok={t.balance <= 0.5}>{usd(Math.max(0, t.balance))}</strong></div>
    </div>
    <Meter value={t.paid} max={t.transport} label="Paid of transport" />
    {#if t.agreedRecorded === false}
      <p class="t-hint nr">Agreed transport price not recorded yet — the loader records no price.</p>
      {#if mayAgree && !readOnly}<button class="btn btn-accent btn-lg rec" onclick={() => { apAmount = 0; apCur = 'USD'; error = ''; agreeing = true; }}>Record agreed price</button>{/if}
    {/if}
    {#if !mayPay}<p class="t-hint">The directors record and approve transport payments.</p>
    {:else if !readOnly}<button class="btn btn-primary btn-lg rec" onclick={openPay}><Plus size={18} />Record payment</button>
    {:else}<p class="t-hint">Group view is read-only — switch to the trip's company to record a payment.</p>{/if}
  </section>

  <h3 class="t-title">Payments</h3>
  {#if t.payments.length}
    <div class="t-list">
      {#each [...t.payments].reverse() as p (p.id)}
        <div class="t-item pay">
          <span class="t-main">
            <span class="t-line1"><span class="t-ellipsis">{usdFull(p.amount, t.costs.find((c) => c.id === p.costId)?.currency ?? 'USD')}</span><Badge status={p.status} /></span>
            <span class="t-meta t-ellipsis">{costLabel(t, p.costId)} · ref {p.reference}</span>
            <span class="t-meta">{fmtDateTime(p.at)}</span>
          </span>
          {#if p.status === 'Pending approval' && mayApprovePayments(user) && !readOnly}<button class="btn btn-accent approve" onclick={() => approve(p.id)}>Approve</button>{/if}
        </div>
      {/each}
    </div>
  {:else}<Empty title="No payments yet" />{/if}

  <h3 class="t-title">Costs</h3>
  <section class="t-card flush">
    <ul class="costs">
      {#each t.costs as c (c.id)}<li><span><b>{c.kind}</b>{#if c.docRef}<span class="t-meta"> · {c.docRef}</span>{/if}</span><span class="num">{usdFull(c.amount, c.currency)}</span></li>
      {:else}<li class="t-meta">No costs recorded</li>{/each}
    </ul>
  </section>
{/if}

{#if agreeing && t}
  <Sheet modal title="Agreed transport price" onclose={() => (agreeing = false)}>
    <p class="t-hint">{t.shipment.ref} · agreed with the transporter after loading. It becomes the trip's transport cost.</p>
    <label class="field"><span>Currency</span><select class="select" bind:value={apCur}>{#each ['USD', 'KES', 'UGX', 'TZS', 'RWF'] as c}<option>{c}</option>{/each}</select></label>
    <label class="field"><span>Agreed price</span><input class="input" type="number" inputmode="decimal" min="0" step="0.01" bind:value={apAmount} /></label>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <button class="btn btn-primary btn-lg btn-block" onclick={saveAgreed} disabled={busy}>{busy ? 'Saving…' : 'Save agreed price'}</button>
  </Sheet>
{/if}
{#if paying && t}
  <Sheet modal title="Record payment" onclose={() => (paying = false)}>
    <label class="field"><span>For</span>
      <select class="select" bind:value={costId}>{#each t.costs as c}<option value={c.id}>{c.kind} · {usdFull(c.amount - paidOn(t, c.id), c.currency)} left</option>{/each}</select></label>
    <label class="field"><span>Amount ({cost?.currency ?? 'USD'})</span><input class="input" type="number" inputmode="decimal" min="0" step="0.01" bind:value={amount} /></label>
    <label class="field"><span>Reference</span><input class="input" bind:value={reference} placeholder="M-Pesa or bank reference" autocomplete="off" /></label>
    <p class="t-hint">Payments above {usd(paymentLimit())} wait for a director's approval.</p>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <button class="btn btn-primary btn-lg btn-block" onclick={pay} disabled={busy}>{busy ? 'Saving…' : 'Save payment'}</button>
  </Sheet>
{/if}

<style>
  .nr { color: var(--warning); font-weight: 600; }
  .hero { display: flex; flex-direction: column; gap: 8px; border-top: 4px solid var(--t-accent); }
  .ref { font: 700 14px var(--ff-mono); color: var(--text-muted); }
  .totals div { display: flex; flex-direction: column; padding: 10px 12px; border-radius: 14px; background: var(--surface-sunken); }
  .totals strong { font: 800 22px var(--ff-display); font-variant-numeric: tabular-nums; }
  .totals strong.ok { color: var(--success); }
  .rec { width: 100%; margin-top: 6px; }
  .pay { cursor: default; }
  .approve { flex: none; min-height: 44px; }
  .costs { list-style: none; margin: 0; padding: 0 16px; }
  .costs li { display: flex; justify-content: space-between; gap: 10px; padding: 12px 0; border-bottom: 1px solid var(--t-line); }
  .costs li:last-child { border-bottom: 0; }
  .num { font-variant-numeric: tabular-nums; font-weight: 600; }
  .error { color: var(--danger); font-weight: 600; margin: 0; }
</style>
