<script lang="ts">
  import { amount, lookup, pos, type Plan, type PurchaseOrder, type User } from '@btw/api';
  import { Badge, fmtDate, fmtDateTime, fmtNum, say } from '@btw/ui';
  import Printer from '@lucide/svelte/icons/printer';
  import Send from '@lucide/svelte/icons/send';
  import Download from '@lucide/svelte/icons/download';
  import { watch, attempt } from '../lib/load.svelte';
  import { describe } from '../lib/errors';
  import { poServer, isNotAvailable } from '../lib/admin';
  import { brand } from '../lib/brand';
  import ErrorState from '../components/ErrorState.svelte';
  let { params, user }: { params: { id: string }; user: User } = $props();
  let data = $state<{ po: PurchaseOrder; plan: Plan } | null | undefined>(undefined);
  const w = watch(async () => { data = await pos.get(params.id); });

  const lines = $derived(data ? [...data.plan.lines].sort((a, b) => a.truckNo - b.truckNo) : []);
  const byPack = $derived.by(() => {
    const m = new Map<string, { brand: string; pack: string; qty: number; amt: number }>();
    for (const l of lines) {
      const p = lookup.product(l.productId)!;
      const cur = m.get(p.id) ?? { brand: p.brand, pack: p.pack, qty: 0, amt: 0 };
      cur.qty += l.qty; cur.amt += amount(l.qty, l.price); m.set(p.id, cur);
    }
    return [...m.values()];
  });
  const totalQty = $derived(lines.reduce((a, l) => a + l.qty, 0));
  const totalAmt = $derived(lines.reduce((a, l) => a + amount(l.qty, l.price), 0));
  const entity = $derived(data ? lookup.entity(data.po.entityId) : undefined);
  const supplier = $derived(data ? lookup.supplier(data.po.supplierId) : undefined);
  const prepared = $derived(data ? lookup.user(data.plan.createdById) : undefined);
  const approver = $derived(data ? lookup.user(data.po.approvedById) : undefined);

  let busy = $state<'' | 'pdf' | 'send'>('');
  let actionError = $state('');
  async function downloadPdf() {
    busy = 'pdf'; actionError = '';
    try {
      const blob = await poServer.pdf(data!.po.id);
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), { href: url, download: `${data!.po.ref}.pdf` });
      a.click(); setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) { actionError = isNotAvailable(e) ? 'PDF download needs the server. In demo mode use Print and “Save as PDF”.' : describe(e).message; }
    busy = '';
  }
  async function send() {
    busy = 'send';
    actionError = await attempt(() => poServer.send(data!.po.id));
    busy = '';
    if (!actionError) { say(poServer.available ? `Emailed to ${supplier?.email}` : `Recorded as sent to ${supplier?.email}`); w.retry(); }
  }
</script>

{#if data === undefined && w.error}
  <ErrorState error={w.error} onretry={w.retry} />
{:else if data === undefined}
  <div class="skeleton" style="height:40px;width:40%"></div>
{:else if data === null}
  <div class="empty"><h2>Purchase order not found</h2><a href="#/pos">Back to purchase orders</a></div>
{:else}
  <div class="page-head no-print">
    <div>
      <div class="overline crumb"><a href="#/pos">Purchase orders</a> / {entity?.code}</div>
      <h1 class="row"><span class="mono">{data.po.ref}</span>{#if data.po.sentAt}<Badge tone="success">Sent {fmtDateTime(data.po.sentAt)}</Badge>{:else}<Badge tone="warning">Not sent</Badge>{/if}</h1>
    </div>
    <div class="row">
      <a class="btn btn-ghost" href="#/plans/{data.plan.id}">View plan</a>
      <button class="btn btn-secondary" onclick={downloadPdf} disabled={busy === 'pdf'}><Download size={16} />{busy === 'pdf' ? 'Preparing…' : 'Download PDF'}</button>
      <button class="btn btn-secondary" onclick={() => window.print()}><Printer size={16} />Print</button>
      {#if !data.po.sentAt && user.roles.some((r) => ['planner', 'operations', 'director'].includes(r))}
        <button class="btn btn-primary" onclick={send} disabled={busy === 'send'}><Send size={16} />{poServer.available ? 'Email to supplier' : 'Mark as sent to supplier'}</button>
      {/if}
    </div>
  </div>
  {#if actionError}<p class="error no-print" role="alert">{actionError}</p>{/if}
  <ErrorState error={w.error} onretry={w.retry} compact />

  <article class="letter card">
    <header class="lh">
      {#if entity?.code === 'BTW'}
        <img src={brand.logoFull} alt={entity?.name} class="logo" />
      {:else}
        <div class="lh-text"><div class="lh-name">{entity?.name}</div><div class="caption">Letterhead and logo pending from client (Q-B2)</div></div>
      {/if}
      <div class="lh-addr small">{entity?.name}<br />{entity?.address}</div>
    </header>
    <div class="ribbon"></div>

    <div class="meta">
      <div>{fmtDate(data.po.date)}</div>
      <div class="to">The Export Section – {supplier?.code},<br />{supplier?.city}, {supplier?.country}</div>
      <div class="re"><strong>Re: {data.po.title || 'Order'} / <span class="mono">{data.po.ref}</span></strong></div>
      <p>{data.po.instruction}</p>
    </div>

    <table class="table">
      <thead><tr><th class="num">Truck No.</th><th>Brand</th><th>Package</th><th class="num">Quantity (cases)</th><th class="num">Price ({data.po.currency})</th><th class="num">Amount ({data.po.currency})</th></tr></thead>
      <tbody>
        {#each lines as l (l.id)}
          {@const p = lookup.product(l.productId)}
          <tr><td class="num">{l.truckNo}</td><td>{p?.brand}</td><td>{p?.pack}</td><td class="num">{fmtNum(l.qty)}</td><td class="num">{fmtNum(l.price, 2)}</td><td class="num">{fmtNum(amount(l.qty, l.price), 2)}</td></tr>
        {/each}
        {#if byPack.length > 1}
          {#each byPack as b}<tr class="subtotal"><td></td><td>Subtotal · {b.brand}</td><td>{b.pack}</td><td class="num">{fmtNum(b.qty)}</td><td></td><td class="num">{fmtNum(b.amt, 2)}</td></tr>{/each}
        {/if}
        <tr class="grand"><td></td><td colspan="2">Total</td><td class="num">{fmtNum(totalQty)}</td><td></td><td class="num">{fmtNum(totalAmt, 2)}</td></tr>
      </tbody>
    </table>

    <footer class="sign">
      <div>
        <div class="overline">Prepared by</div>
        <div>{prepared?.name}</div>
        <div class="caption">Operations officer</div>
      </div>
      <div>
        <div class="overline">Approved by</div>
        {#if data.po.signature?.startsWith('data:')}<img class="sig" src={data.po.signature} alt="Signature" />{:else}<div class="sig-ph">{approver?.name}</div>{/if}
        <div>{approver?.name}</div>
      </div>
      <div class="stamp">
        <div class="overline">{entity?.code}</div>
        <div class="small" style="font-weight:700">APPROVED</div>
        <div class="caption">{fmtDate(data.po.approvedAt)}</div>
        <div class="caption">v{data.po.version}</div>
      </div>
    </footer>
  </article>
{/if}

<style>
  .letter { max-width: 860px; margin: 0 auto; padding: var(--space-8); display: flex; flex-direction: column; gap: var(--space-5); }
  .lh { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--space-4); }
  .logo { width: 220px; background: var(--logo-tile); /* logo always on a white tile (Q-B3) */ }
  .lh-name { font-family: var(--ff-display); font-size: var(--fs-h3); font-weight: 800; color: var(--primary); }
  .lh-addr { text-align: right; color: var(--text-muted); }
  .meta { display: flex; flex-direction: column; gap: var(--space-3); }
  .meta p { margin: 0; }
  .sign { display: grid; grid-template-columns: 1fr 1fr auto; gap: var(--space-6); align-items: end; margin-top: var(--space-4); }
  .sig { height: 64px; max-width: 200px; display: block; }
  .sig-ph { font-family: var(--ff-display); font-style: italic; font-size: var(--fs-h3); color: var(--link); height: 64px; display: flex; align-items: flex-end; }
  .stamp { border: 2px solid var(--accent-text); color: var(--accent-text); border-radius: var(--radius-lg); padding: var(--space-3) var(--space-4); text-align: center; transform: rotate(-4deg); }
  .stamp .overline, .stamp .caption { color: var(--accent-text); }
  @media print {
    @page { size: A4; margin: 18mm 16mm; }
    :global(.side), :global(.top), :global(.ribbon:not(.letter .ribbon)), .no-print { display: none !important; }
    :global(.shell) { display: block !important; }
    :global(.content) { padding: 0 !important; }
    :global(body) { background: var(--surface) !important; }
    .letter { border: 0; padding: 0; max-width: none; }
  }
</style>
