<script lang="ts">
  import RecordFor from '../components/RecordFor.svelte';
  import { amount, lookup, pos, type Plan, type PurchaseOrder, type User } from '@btw/api';
  import { Badge, fmtDate, fmtDateTime, fmtNum, say } from '@btw/ui';
  import Printer from '@lucide/svelte/icons/printer';
  import Send from '@lucide/svelte/icons/send';
  import Download from '@lucide/svelte/icons/download';
  import { watch, attempt } from '../lib/load.svelte';
  import { describe } from '../lib/errors';
  import { poServer, isNotAvailable } from '../lib/admin';
  import { companyBrand } from '../lib/companies';
  import ErrorState from '../components/ErrorState.svelte';
  import { revTag } from '../lib/orders';
  let { params, user }: { params: { id: string }; user: User } = $props();
  let data = $state<{ po: PurchaseOrder; plan: Plan; revisions?: PurchaseOrder[] } | null | undefined>(undefined);
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
  // Issuing company's letterhead (docs/06 §5): header/footer bands traced from docs/inspiration/*.pdf.
  const co = $derived(data ? companyBrand(data.po.entityId) : null);
  const supplier = $derived(data ? lookup.supplier(data.po.supplierId) : undefined);
  const prepared = $derived(data ? lookup.user(data.plan.createdById) : undefined);
  const approver = $derived(data ? lookup.user(data.po.approvedById) : undefined);
  // Issued without director approval (config.toml) or revised at loading: "ISSUED <date> by <name>" instead of the APPROVED stamp.
  const issued = $derived(data?.po.approval === 'issued' || data?.po.approval === 'revision');
  const chain = $derived(data?.revisions ?? []);
  const base = $derived(chain[0]);
  const latest = $derived(chain.find((x) => !x.supersededById));
  const pname = (id?: string) => { const p = id ? lookup.product(id) : undefined; return p ? `${p.brand} ${p.pack}` : '—'; };
  /** The order line an alternative stands in for (a missing line is no longer on this revision: take it from the changes). */
  const replaced = (lineId?: string) => pname(data?.plan.lines.find((l) => l.id === lineId)?.productId ?? data?.po.changes?.find((c) => c.planLineId === lineId)?.productId);

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
        <RecordFor entityId={data.po.entityId} cue={false}><button class="btn btn-primary" onclick={send} disabled={busy === 'send'}><Send size={16} />{poServer.available ? 'Email to supplier' : 'Mark as sent to supplier'}</button></RecordFor>
      {/if}
    </div>
  </div>
  {#if actionError}<p class="error no-print" role="alert">{actionError}</p>{/if}
  {#if data.po.supersededById && latest}
    <div class="card flag-warning note no-print" role="status">Superseded by <a class="mono" href="#/pos/{latest.id}">{latest.ref}</a> — revised at loading. This version is kept for reference.</div>
  {/if}
  {#if chain.length > 1}
    <section class="card note no-print" aria-labelledby="rev-h">
      <h3 id="rev-h">{data.po.revisionOf ? 'Revised at loading' : 'Revisions made at loading'}</h3>
      <nav class="chain" aria-label="Revisions">
        {#each chain as c, i (c.id)}
          {#if i}<span aria-hidden="true">→</span>{/if}
          {#if c.id === data.po.id}<strong class="mono" aria-current="page">{c.revision ? revTag(c.revision) : 'original'} · {c.ref}</strong>
          {:else}<a class="mono" href="#/pos/{c.id}">{c.revision ? revTag(c.revision) : 'original'}</a>{/if}
        {/each}
      </nav>
      {#if data.po.revisionOf}
        {#if data.po.revisionReason}<p class="small">{data.po.revisionReason}</p>{/if}
        <ul class="small">
          {#each data.po.changes ?? [] as c}
            <li>{#if c.kind === 'alternative'}Truck {c.truckNo} · <strong>+{fmtNum(c.loaded)} {pname(c.productId)}</strong> (alternative{#if c.replacesPlanLineId} for {replaced(c.replacesPlanLineId)}{/if})
              {:else}Truck {c.truckNo} · {pname(c.productId)}: ordered {fmtNum(c.ordered)} → loaded {fmtNum(c.loaded)}{#if c.kind === 'missing'} <Badge tone="warning">missing</Badge>{/if}{/if}</li>
          {/each}
        </ul>
        <p class="caption">Written automatically when the truck was loaded{#if data.po.onBehalfOfId} (recorded by {lookup.user(data.po.onBehalfOfId)?.name ?? 'the loader'}){/if}; no approval needed. Shipments, stock and reports use the latest revision.</p>
      {/if}
    </section>
  {/if}
  <ErrorState error={w.error} onretry={w.retry} compact />

  <article class="letter card" style:--co-ink={co?.colors.ink} style:--co-accent={co?.colors.accent}>
    {#if co?.letterhead.watermark}<img class="wm" src={co.letterhead.watermark} alt="" aria-hidden="true" />{/if}
    {#if co?.letterhead.header}
      <img class="lh-band" src={co.letterhead.header} alt="{co.name} letterhead" />
    {:else}
      <header class="lh">
        {#if co?.logo}<img src={co.logo} alt={co.name} class="logo" />{:else}<div class="lh-name">{co?.name ?? entity?.name}</div>{/if}
        <div class="lh-addr small">{#each co?.address ?? [] as line}{line}<br />{/each}{co?.phones.join(' · ')}<br />{co?.email}</div>
      </header>
    {/if}
    <div class="legal caption">{co?.legal?.legalName ?? co?.name} · KRA PIN {co?.legal?.kraPin ?? 'to confirm'} · Reg. No. {co?.legal?.registrationNo ?? 'to confirm'}</div>

    <div class="meta">
      <div>{fmtDate(data.po.date)}</div>
      <div class="to">The Export Section – {supplier?.code},<br />{supplier?.city}, {supplier?.country}</div>
      <div class="re"><strong>Re: {data.po.title || 'Order'} / <span class="mono">{data.po.ref}</span></strong></div>
      {#if data.po.revisionOf && base}<div class="small"><strong>Revision {data.po.revision} of <span class="mono">{base.ref}</span></strong> — revised at loading; replaces the earlier version.</div>{/if}
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
      {#if issued}
        <div>
          <div class="overline">Issued by</div>
          <div>{approver?.name}{#if data.po.approval === 'revision'} (at loading){/if}</div>
        </div>
        <div class="stamp issued">
          <div class="overline">{co?.shortName ?? entity?.code}</div>
          <div class="small" style="font-weight:700">ISSUED {fmtDate(data.po.approvedAt).toUpperCase()}</div>
          <div class="caption">by {approver?.name ?? '—'}</div>
        </div>
      {:else}
      <div>
        <div class="overline">Approved by</div>
        {#if data.po.signature?.startsWith('data:')}<img class="sig" src={data.po.signature} alt="Signature" />{:else}<div class="sig-ph">{approver?.name}</div>{/if}
        <div>{approver?.name}</div>
      </div>
      <div class="stamp">
        <div class="overline">{co?.shortName ?? entity?.code}</div>
        <div class="small" style="font-weight:700">APPROVED</div>
        <div class="caption">{fmtDate(data.po.approvedAt)}</div>
        <div class="caption">v{data.po.version}</div>
      </div>
      {/if}
    </footer>
    {#if co?.letterhead.footer}<img class="lf-band" src={co.letterhead.footer} alt="" aria-hidden="true" />
    {:else}<div class="lf small">{co?.footerLine}</div>{/if}
  </article>
{/if}

<style>
  /* A letter is paper: always a white A4-proportioned sheet with dark ink, in light and dark mode. */
  .letter { position: relative; overflow: hidden; max-width: 860px; min-height: calc(860px * 1.414); margin: 0 auto; padding: 0 var(--space-8) var(--space-8); display: flex; flex-direction: column; gap: var(--space-5);
    background: #fff; color: #1b2433; border-color: #d5dbe5; --text: #1b2433; --text-muted: #4a5568; --text-subtle: #5f6b7a; --border: #d5dbe5; --surface: #fff; --surface-sunken: #f2f4f7; --primary-subtle: #f2f4f7; --primary: #1b2433; }
  .lh-band { width: calc(100% + 2 * var(--space-8)); margin: 0 calc(-1 * var(--space-8)); display: block; }
  .lf-band { width: calc(100% + 2 * var(--space-8)); margin: auto calc(-1 * var(--space-8)) calc(-1 * var(--space-8)); display: block; }
  .lf { margin-top: auto; text-align: center; color: var(--co-ink, #4a5568); border-top: 2px solid var(--co-accent, #ccc); padding-top: var(--space-2); }
  .wm { position: absolute; inset: 30% 10% auto; width: 80%; opacity: .08; pointer-events: none; }
  .legal { color: #5f6b7a; margin-top: calc(-1 * var(--space-3)); }
  .lh { padding-top: var(--space-8); }
  .lh { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--space-4); }
  .logo { width: 220px; background: var(--logo-tile); /* logo always on a white tile (Q-B3) */ }
  .lh-name { font-family: var(--ff-display); font-size: var(--fs-h3); font-weight: 800; color: var(--primary); }
  .lh-addr { text-align: right; color: var(--text-muted); }
  .meta { display: flex; flex-direction: column; gap: var(--space-3); }
  .meta p { margin: 0; }
  .sign { display: grid; grid-template-columns: 1fr 1fr auto; gap: var(--space-6); align-items: end; margin-top: var(--space-4); }
  .sig { height: 64px; max-width: 200px; display: block; }
  .sig-ph { font-family: var(--ff-display); font-style: italic; font-size: var(--fs-h3); color: var(--link); height: 64px; display: flex; align-items: flex-end; }
  .stamp { border: 2px solid var(--co-ink, var(--accent-text)); color: var(--co-ink, var(--accent-text)); border-radius: var(--radius-lg); padding: var(--space-3) var(--space-4); text-align: center; transform: rotate(-4deg); }
  .stamp .overline, .stamp .caption { color: var(--co-ink, var(--accent-text)); }
  .stamp.issued { transform: none; }
  .note { margin-bottom: var(--space-4); padding: var(--space-3) var(--space-5); }
  .note ul { margin: var(--space-2) 0; padding-left: var(--space-5); }
  .chain { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; margin-top: var(--space-2); }
  @media print {
    @page { size: A4; margin: 18mm 16mm; }
    :global(.side), :global(.top), :global(.ribbon:not(.letter .ribbon)), .no-print { display: none !important; }
    :global(.shell) { display: block !important; }
    :global(.content) { padding: 0 !important; }
    :global(body) { background: var(--surface) !important; }
    .letter { border: 0; padding: 0 0 0; max-width: none; min-height: 0; box-shadow: none; }
    .lh-band, .lf-band { width: 100%; margin-left: 0; margin-right: 0; }
  }
</style>
