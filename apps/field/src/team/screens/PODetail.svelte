<script lang="ts">
  // Issued purchase order: supplier, lines per truck, totals; planners/directors download the PDF letter and email it.
  import { lookup, mode, pos, type User } from '@btw/api';
  import { Badge, fmtDate, fmtDateTime, say } from '@btw/ui';
  import Download from '@lucide/svelte/icons/download';
  import Send from '@lucide/svelte/icons/send';
  import TruckIcon from '@lucide/svelte/icons/truck';
  import CompanyChip from '../../components/CompanyChip.svelte';
  import { canIssuePO } from '../access';
  import { co } from '../company.svelte';
  import { Res, onRefresh } from '../load.svelte';
  import { orderCases, orderValue, supplierName } from '../plan';
  import { num, usdFull } from '../fmt';
  import { cpShort } from '../../lib';
  import { haptic } from '../../native';
  import Skeleton from '../components/Skeleton.svelte';
  import Empty from '../components/Empty.svelte';
  import ErrorNote from '../components/ErrorNote.svelte';
  import WebButton from '../components/WebButton.svelte';
  import type { View } from '../routes';
  let { user, view }: { user: User; view: View; query: URLSearchParams } = $props();
  const id = $derived((view as { id?: string }).id!);
  const r = new Res(() => pos.get(id));
  $effect(() => r.live());
  $effect(() => onRefresh(() => r.reload()));
  const po = $derived(r.data?.po);
  const plan = $derived(r.data?.plan);
  const trucks = $derived(plan ? [...new Set(plan.lines.map((l) => l.truckNo))].sort((a, b) => a - b).map((n) => ({ n, lines: plan.lines.filter((l) => l.truckNo === n) })) : []);
  const destOf = (routeId: string) => cpShort(lookup.route(routeId)?.stops.at(-1)?.checkpointId);
  const may = $derived(canIssuePO(user) && co.active !== null);
  let busy = $state<'' | 'pdf' | 'send'>('');

  async function pdf() {
    busy = 'pdf';
    try {
      const blob = await pos.pdf(id);
      if (!blob) { say('The PDF letter is made by the server — open the order in the web app to print it.'); return; }
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), { href: url, download: `${po!.ref}.pdf` });
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (e) { say((e as Error).message); } finally { busy = ''; }
  }
  async function send() {
    busy = 'send';
    try {
      await pos.send(id); haptic('success');
      const to = lookup.supplier(po!.supplierId)?.email;
      say(mode === 'http' ? `Emailed to ${to ?? 'the supplier'}` : 'Marked as sent (demo: no email leaves the phone)');
      await r.reload();
    } catch (e) { say((e as Error).message); haptic('warning'); } finally { busy = ''; }
  }
</script>

<ErrorNote error={r.error} onretry={() => r.reload()} />
{#if r.loading}
  <Skeleton kind="card" /><Skeleton rows={3} />
{:else if !po || !plan}
  <Empty title="Order not found" text="It may belong to another company. Switch company and try again." />
{:else}
  <section class="t-card hero">
    <div class="t-row between"><span class="ref">{po.ref}{po.version > 1 ? ` · v${po.version}` : ''}</span>{#if po.sentAt}<Badge tone="success">Sent {fmtDate(po.sentAt)}</Badge>{:else}<Badge tone="warning">Not sent yet</Badge>{/if}</div>
    <h2 class="t-h1">{supplierName(po.supplierId)}</h2>
    {#if po.title}<p class="t-sub">{po.title}</p>{/if}
    <CompanyChip entityId={po.entityId} />
    <div class="t-split totals">
      <div><span class="t-meta">Cases</span><strong>{num(orderCases(plan))}</strong></div>
      <div><span class="t-meta">Value</span><strong>{usdFull(orderValue(plan), po.currency)}</strong></div>
      <div><span class="t-meta">Trucks</span><strong>{trucks.length}</strong></div>
      <div><span class="t-meta">Dated</span><strong>{fmtDate(po.date)}</strong></div>
    </div>
    {#if may}
      <div class="t-actions">
        <button class="btn btn-secondary btn-lg" onclick={pdf} disabled={busy !== ''}><Download size={18} />{busy === 'pdf' ? 'Preparing…' : 'Download PDF'}</button>
        <button class="btn btn-primary btn-lg" onclick={send} disabled={busy !== ''}><Send size={18} />{busy === 'send' ? 'Sending…' : po.sentAt ? 'Email again' : 'Email to supplier'}</button>
      </div>
    {:else if canIssuePO(user)}
      <p class="t-hint">Switch to the order's company to download or send it.</p>
    {/if}
  </section>

  <h3 class="t-title">Lines per truck</h3>
  {#each trucks as t (t.n)}
    <section class="t-card truck">
      <div class="t-row between"><span class="t-row"><span class="t-icon sm"><TruckIcon size={18} /></span><strong>Truck {t.n}</strong></span><span class="t-meta">{num(t.lines.reduce((a, l) => a + l.qty, 0))} cases</span></div>
      <ul>
        {#each t.lines as l (l.id)}
          {@const p = lookup.product(l.productId)}
          <li>
            <span class="grow"><b>{p?.brand ?? l.productId}</b> <span class="t-meta">{p?.pack ?? ''}</span><br /><span class="t-meta">to {destOf(l.routeId)}</span></span>
            <span class="num"><b>{num(l.qty)}</b><br /><span class="t-meta">× {usdFull(l.price, '')}</span></span>
          </li>
        {/each}
      </ul>
    </section>
  {/each}

  {#if po.approvedById}
    <section class="t-card sig">
      <span class="t-meta">Issued by</span>
      {#if po.signature?.startsWith('data:')}<img src={po.signature} alt="Signature" />{/if}
      <strong>{lookup.user(po.approvedById)?.name ?? '—'}</strong>
      <span class="t-meta">{fmtDateTime(po.approvedAt)}</span>
    </section>
  {/if}
  <WebButton path="/pos/{po.id}" label="View the letter in web app" />
{/if}

<style>
  .hero { display: flex; flex-direction: column; gap: 8px; border-top: 4px solid var(--t-accent); }
  .ref { font: 700 14px var(--ff-mono); color: var(--text-muted); }
  .totals { margin: 6px 0 4px; }
  .totals div { display: flex; flex-direction: column; padding: 10px 12px; border-radius: 14px; background: var(--surface-sunken); }
  .totals strong { font: 700 17px var(--ff-display); font-variant-numeric: tabular-nums; }
  .t-icon.sm { width: 34px; height: 34px; border-radius: 10px; }
  .truck ul { list-style: none; margin: 8px 0 0; padding: 0; }
  .truck li { display: flex; gap: 12px; padding: 10px 0; border-top: 1px solid var(--t-line); }
  .grow { flex: 1; min-width: 0; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .sig { display: flex; flex-direction: column; gap: 4px; }
  .sig img { max-height: 70px; max-width: 220px; object-fit: contain; background: #fff; border-radius: 8px; }
</style>
