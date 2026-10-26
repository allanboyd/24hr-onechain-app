<script lang="ts">
  // docs/09 §4: one purchase order — the letter of the version asked for, its Versions panel (original vs each revision,
  // office updates and revisions at loading, who / when / why, a PDF per version), and Update / Delete / Approve.
  import RecordFor from '../components/RecordFor.svelte';
  import { amount, lookup, pos, type PlanLine, type PoDetail, type PoVersion, type User } from '@btw/api';
  import { approvalText, lineChangeText } from '@btw/api/rules';
  import { Badge, SignaturePad, fmtDate, fmtDateTime, fmtNum, router, say } from '@btw/ui';
  import Printer from '@lucide/svelte/icons/printer';
  import Send from '@lucide/svelte/icons/send';
  import Download from '@lucide/svelte/icons/download';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Trash from '@lucide/svelte/icons/trash-2';
  import History from '@lucide/svelte/icons/history';
  import { watch, attempt } from '../lib/load.svelte';
  import { describe } from '../lib/errors';
  import { poServer, isNotAvailable } from '../lib/admin';
  import { companyBrand } from '../lib/companies';
  import ErrorState from '../components/ErrorState.svelte';
  import { labelTone, revTag, stageLabel, versionKind } from '../lib/orders';
  import { orderAccess, seesPrices } from '@btw/api/access';
  let { params, user }: { params: { id: string }; user: User } = $props();
  let data = $state<PoDetail | null | undefined>(undefined);
  const w = watch(async () => { data = await pos.get(params.id); }, () => params.id);

  const lines = $derived(data ? [...data.plan.lines].sort((a, b) => a.truckNo - b.truckNo) : []);
  // docs/12 A-04: loaders and receivers see quantities and documents, never prices; only an editor sends the PO.
  const noPrice = $derived(!!data && (!!data.plan.pricesHidden || !!data.po.pricesHidden || !seesPrices(user)));
  const myRc = $derived([...new Set(user.warehouseIds.map((id) => lookup.warehouse(id)?.receivingCompanyId).filter((x): x is string => !!x))]);
  const editor = $derived(!!data && orderAccess(user, data.plan, myRc) === 'edit' && user.roles.some((r) => r === 'planner' || r === 'director' || r === 'admin'));
  const byPack = $derived.by(() => {
    const m = new Map<string, { brand: string; pack: string; qty: number; amt: number }>();
    for (const l of lines) {
      const p = lookup.product(l.productId)!;
      const cur = m.get(p.id) ?? { brand: p.brand, pack: p.pack, qty: 0, amt: 0 };
      cur.qty += l.qty; cur.amt += amount(l.qty, l.price ?? 0); m.set(p.id, cur);
    }
    return [...m.values()];
  });
  const totalQty = $derived(lines.reduce((a, l) => a + l.qty, 0));
  const totalAmt = $derived(lines.reduce((a, l) => a + amount(l.qty, l.price ?? 0), 0));
  const entity = $derived(data ? lookup.entity(data.po.entityId) : undefined);
  // Issuing company's letterhead (docs/06 §5): header/footer bands traced from docs/inspiration/*.pdf.
  const co = $derived(data ? companyBrand(data.po.entityId) : null);
  const supplier = $derived(data ? lookup.supplier(data.po.supplierId) : undefined);
  const prepared = $derived(data ? lookup.user(data.plan.createdById) : undefined);
  const approverName = $derived(data ? lookup.user(data.po.approvedById)?.name ?? (data.po.approvedById === 'system' ? 'System' : '') : '');
  // Approved automatically / updated by the office / revised at loading: no director stamp, a plain "issued" block.
  const issued = $derived(!!data && data.po.approval !== 'director' && !!data.po.approval);
  const awaiting = $derived(data?.po.status === 'Awaiting approval');
  const deleted = $derived(data?.po.status === 'Deleted');
  const versions = $derived(data?.versions ?? []);
  const base = $derived(versions[0]);
  const latest = $derived(data ? (data.revisions.find((x) => x.id === data!.effectiveId) ?? data.po) : undefined);
  const isLatest = $derived(!!data && data.po.id === data.effectiveId);
  const pname = (id?: string) => { const p = id ? lookup.product(id) : undefined; return p ? `${p.brand} ${p.pack}` : '—'; };

  // ---- Versions: compare any two snapshots side by side (default: original ↔ the version in force) ----
  let cmpA = $state(0), cmpB = $state(-1);
  $effect(() => { if (versions.length && (cmpB < 0 || cmpB >= versions.length)) { cmpA = 0; cmpB = versions.length - 1; } });
  const A = $derived(versions[cmpA]), B = $derived(versions[cmpB]);
  type Row = { id: string; truckNo: number; a?: PlanLine; b?: PlanLine };
  const cmpRows = $derived.by(() => {
    if (!A || !B) return [] as Row[];
    const ids = [...new Set([...A.lines.map((l) => l.id), ...B.lines.map((l) => l.id)])];
    return ids.map((id) => { const a = A.lines.find((l) => l.id === id), b = B.lines.find((l) => l.id === id); return { id, truckNo: (b ?? a)!.truckNo, a, b }; })
      .sort((x, y) => x.truckNo - y.truckNo || (x.a ? 0 : 1) - (y.a ? 0 : 1));
  });
  const diff = (r: Row, k: 'productId' | 'qty' | 'price' | 'routeId' | 'deliveredToId' | 'truckNo') => !!r.a && !!r.b && r.a[k] !== r.b[k];
  const sum = (v?: PoVersion) => (v ? v.lines.reduce((a, l) => a + l.qty, 0) : 0);

  // ---- actions ----
  let busy = $state<'' | 'pdf' | 'send' | 'delete' | 'decide'>('');
  let actionError = $state('');
  async function downloadPdf(id = data!.po.id, ref = data!.po.ref) {
    busy = 'pdf'; actionError = '';
    try {
      const blob = await poServer.pdf(id);
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), { href: url, download: `${ref}.pdf` });
      a.click(); setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      if (isNotAvailable(e)) { if (id !== data!.po.id) router.go(`/pos/${id}`); else actionError = 'PDF download needs the server. In demo mode open the version and use Print → “Save as PDF”.'; }
      else actionError = describe(e).message;
    }
    busy = '';
  }
  async function send() {
    busy = 'send';
    actionError = await attempt(() => poServer.send(data!.po.id));
    busy = '';
    if (!actionError) { say(poServer.available ? `Emailed to ${supplier?.email}` : `Recorded as sent to ${supplier?.email}`); w.retry(); }
  }
  let delDialog = $state<HTMLDialogElement>();
  let delReason = $state('');
  async function remove() {
    if (!delReason.trim()) { actionError = 'Give a reason for deleting the purchase order'; return; }
    busy = 'delete';
    actionError = await attempt(() => pos.remove(data!.effectiveId, delReason.trim()));
    busy = '';
    if (!actionError) { delDialog?.close(); say(`${data!.po.ref} deleted — kept in the history with your reason`); w.retry(); }
  }
  let decDialog = $state<HTMLDialogElement>();
  let decision = $state<'approved' | 'rejected'>('approved');
  let comment = $state(''), signature = $state('');
  async function decide() {
    if (decision === 'approved' && !signature) { actionError = 'Signature required to approve'; return; }
    if (decision === 'rejected' && !comment.trim()) { actionError = 'Add a comment for the planner'; return; }
    busy = 'decide';
    actionError = await attempt(() => pos.decide(data!.effectiveId, decision, comment, signature));
    busy = '';
    if (!actionError) { decDialog?.close(); say(decision === 'approved' ? 'Approved — the supplier can now be sent the PO' : 'Rejected — the planner was notified'); w.retry(); }
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
      <h1 class="row"><span class="mono">{data.po.ref}</span>
        <Badge tone={labelTone(data.po.stage ?? '')}>{stageLabel(data.po.stage)}</Badge>
        {#if data.po.revision}<Badge tone="accent">{revTag(data.po.revision)}</Badge>{/if}
        {#if !deleted && !awaiting}{#if data.po.sentAt}<Badge tone="success">Sent {fmtDateTime(data.po.sentAt)}</Badge>{:else}<Badge tone="warning">Not sent</Badge>{/if}{/if}</h1>
      <div class="caption">{approvalText(data.po, approverName || '—')}</div>
    </div>
    <div class="row">
      {#if !noPrice}<button class="btn btn-secondary" onclick={() => downloadPdf()} disabled={busy === 'pdf'}><Download size={16} />{busy === 'pdf' ? 'Preparing…' : 'Download PDF'}</button>{/if}
      <button class="btn btn-secondary" onclick={() => window.print()}><Printer size={16} />Print</button>
      {#if editor && !deleted}
        <RecordFor entityId={data.po.entityId} cue={false}>
          {#if data.actions.update}<a class="btn btn-secondary" href="#/pos/{data.effectiveId}/edit"><Pencil size={16} />Update</a>{/if}
          <button class="btn btn-ghost danger" onclick={() => { actionError = ''; delReason = ''; delDialog?.showModal(); }}><Trash size={16} />Delete</button>
          {#if isLatest && !data.po.sentAt && !awaiting}<button class="btn btn-primary" onclick={send} disabled={busy === 'send'}><Send size={16} />{poServer.available ? (data.po.revision ? 'Email revised PO to supplier' : 'Email to supplier') : (data.po.revision ? 'Mark revised PO as sent' : 'Mark as sent to supplier')}</button>{/if}
        </RecordFor>
      {/if}
      {#if data.actions.approve}
        <RecordFor entityId={data.po.entityId} cue={false}>
          <button class="btn btn-danger" onclick={() => { decision = 'rejected'; comment = ''; actionError = ''; decDialog?.showModal(); }}>Reject</button>
          <button class="btn btn-accent" onclick={() => { decision = 'approved'; comment = ''; signature = ''; actionError = ''; decDialog?.showModal(); }}>Approve & sign</button>
        </RecordFor>
      {/if}
    </div>
  </div>
  {#if actionError && !delDialog?.open && !decDialog?.open}<p class="error no-print" role="alert">{actionError}</p>{/if}
  {#if deleted}
    <div class="card flag-danger note no-print" role="status"><strong>Deleted</strong>{#if data.po.deletedAt} by {lookup.user(data.po.deletedById ?? '')?.name ?? '—'} · {fmtDateTime(data.po.deletedAt)}{/if}{#if data.po.deleteReason} — “{data.po.deleteReason}”{/if}. Kept for the record; its reference is not reused.</div>
  {:else if awaiting}
    <div class="card flag-warning note no-print" role="status">Awaiting a director's approval. Nothing is loaded until it is approved.</div>
  {/if}
  {#if !isLatest && latest}
    <div class="card flag-warning note no-print" role="status">This is an earlier version. The purchase order in force is <a class="mono" href="#/pos/{latest.id}">{latest.ref}</a>.</div>
  {/if}

  <section class="card versions no-print" aria-labelledby="ver-h">
    <header class="row between"><h3 id="ver-h" class="row"><History size={18} />Versions</h3><span class="caption">{versions.length === 1 ? 'Original only — an update or a difference at loading adds a revision' : `${versions.length - 1} revision${versions.length > 2 ? 's' : ''} · one counter for office updates and loading`}</span></header>
    <ol class="vlist">
      {#each versions as v, i (v.poId)}
        <li class:current={v.poId === data.effectiveId} class:here={v.poId === data.po.id}>
          <div class="vhead">
            <span class="mono strong">{v.revision ? revTag(v.revision) : 'original'}</span>
            <Badge tone={v.kind === 'original' ? 'neutral' : v.kind === 'updated' ? 'info' : 'accent'}>{versionKind(v)}</Badge>
            {#if v.poId === data.effectiveId}<Badge tone="success">in force</Badge>{/if}
            <span class="caption">{lookup.user(v.byUserId)?.name ?? (v.byUserId === 'system' ? 'System' : '—')} · {fmtDateTime(v.at)} · {fmtNum(sum(v))} cases</span>
            <span class="grow"></span>
            {#if v.poId !== data.po.id}<a class="btn btn-ghost btn-sm" href="#/pos/{v.poId}">Open</a>{/if}
            {#if !noPrice}<button class="btn btn-ghost btn-sm" onclick={() => downloadPdf(v.poId, v.ref)} title="Letter of this version"><Download size={14} />PDF</button>{/if}
            {#if i > 0}<button class="btn btn-ghost btn-sm" onclick={() => { cmpA = i - 1; cmpB = i; }}>Compare with previous</button>
              <button class="btn btn-ghost btn-sm" onclick={() => { cmpA = 0; cmpB = i; }}>Compare with original</button>{/if}
          </div>
          {#if v.reason && v.kind !== 'original'}<div class="small reason">{v.kind === 'updated' ? 'Reason' : 'Why'}: “{v.reason}”</div>{/if}
          {#if v.lineChanges.length}<ul class="small changes">{#each v.lineChanges as c}<li><Badge tone={c.kind === 'added' ? 'success' : c.kind === 'removed' ? 'danger' : c.kind === 'updated' ? 'info' : 'accent'}>{c.kind}</Badge> {lineChangeText(c, pname)}</li>{/each}</ul>{/if}
        </li>
      {/each}
    </ol>
    {#if versions.length > 1 && A && B}
      <div class="cmp">
        <div class="row cmp-pick">
          <label class="field"><span>Left</span><select class="select" bind:value={cmpA}>{#each versions as v, i}<option value={i}>{v.revision ? revTag(v.revision) : 'original'} · {versionKind(v)}</option>{/each}</select></label>
          <span aria-hidden="true">↔</span>
          <label class="field"><span>Right</span><select class="select" bind:value={cmpB}>{#each versions as v, i}<option value={i}>{v.revision ? revTag(v.revision) : 'original'} · {versionKind(v)}</option>{/each}</select></label>
          <span class="caption">Changed cells are highlighted; added lines green, removed lines red.</span>
        </div>
        <div class="table-wrap"><table class="table side">
          <thead>
            <tr><th rowspan="2" class="num">Truck</th><th colspan={noPrice ? 3 : 4} class="grp">{A.revision ? revTag(A.revision) : 'Original'} <span class="mono caption">{A.ref}</span></th><th colspan={noPrice ? 3 : 4} class="grp">{B.revision ? revTag(B.revision) : 'Original'} <span class="mono caption">{B.ref}</span></th></tr>
            <tr><th>Brand · Package</th><th class="num">Cases</th>{#if !noPrice}<th class="num">Price</th>{/if}<th>Route → delivered to</th><th>Brand · Package</th><th class="num">Cases</th>{#if !noPrice}<th class="num">Price</th>{/if}<th>Route → delivered to</th></tr>
          </thead>
          <tbody>
            {#each cmpRows as r (r.id)}
              <tr class:added={!r.a} class:removed={!r.b}>
                <td class="num">{r.truckNo}</td>
                {#if r.a}<td class:chg={diff(r, 'productId')}>{pname(r.a.productId)}</td><td class="num" class:chg={diff(r, 'qty')}>{fmtNum(r.a.qty)}</td>{#if !noPrice}<td class="num" class:chg={diff(r, 'price')}>{fmtNum(r.a.price ?? 0, 2)}</td>{/if}<td class="small" class:chg={diff(r, 'routeId') || diff(r, 'deliveredToId')}>{lookup.route(r.a.routeId)?.code ?? '—'} → {lookup.company(r.a.deliveredToId)?.name}</td>
                {:else}<td colspan={noPrice ? 3 : 4} class="caption">— not on this version</td>{/if}
                {#if r.b}<td class:chg={diff(r, 'productId')}>{pname(r.b.productId)}</td><td class="num" class:chg={diff(r, 'qty')}>{fmtNum(r.b.qty)}</td>{#if !noPrice}<td class="num" class:chg={diff(r, 'price')}>{fmtNum(r.b.price ?? 0, 2)}</td>{/if}<td class="small" class:chg={diff(r, 'routeId') || diff(r, 'deliveredToId')}>{lookup.route(r.b.routeId)?.code ?? '—'} → {lookup.company(r.b.deliveredToId)?.name}</td>
                {:else}<td colspan={noPrice ? 3 : 4} class="caption">— removed</td>{/if}
              </tr>
            {/each}
            <tr class="grand"><td></td><td>Total</td><td class="num">{fmtNum(sum(A))}</td>{#if !noPrice}<td></td>{/if}<td></td><td>Total</td><td class="num">{fmtNum(sum(B))}</td>{#if !noPrice}<td></td>{/if}<td></td></tr>
          </tbody>
        </table></div>
      </div>
    {/if}
  </section>
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
      {#if data.po.revisionOf && base}<div class="small rev-note"><strong>Revision {data.po.revision} of <span class="mono">{base.ref}</span></strong> — {data.po.revisionKind === 'updated' ? `updated ${fmtDate(data.po.approvedAt)}${data.po.revisionReason ? ` (${data.po.revisionReason})` : ''}` : `revised at loading ${fmtDate(data.po.approvedAt)}`}; replaces the earlier version.
        {#if (data.po.lineChanges ?? []).length}<ul>{#each data.po.lineChanges ?? [] as c}<li>{lineChangeText(c, pname)}</li>{/each}</ul>{/if}</div>{/if}
      <p>{data.po.instruction}</p>
    </div>

    <table class="table">
      <thead><tr><th class="num">Truck No.</th><th>Brand</th><th>Package</th><th class="num">Quantity (cases)</th>{#if !noPrice}<th class="num">Price ({data.po.currency})</th><th class="num">Amount ({data.po.currency})</th>{/if}</tr></thead>
      <tbody>
        {#each lines as l (l.id)}
          {@const p = lookup.product(l.productId)}
          <tr><td class="num">{l.truckNo}</td><td>{p?.brand}</td><td>{p?.pack}</td><td class="num">{fmtNum(l.qty)}</td>{#if !noPrice}<td class="num">{fmtNum(l.price ?? 0, 2)}</td><td class="num">{fmtNum(amount(l.qty, l.price ?? 0), 2)}</td>{/if}</tr>
        {/each}
        {#if byPack.length > 1}
          {#each byPack as b}<tr class="subtotal"><td></td><td>Subtotal · {b.brand}</td><td>{b.pack}</td><td class="num">{fmtNum(b.qty)}</td>{#if !noPrice}<td></td><td class="num">{fmtNum(b.amt, 2)}</td>{/if}</tr>{/each}
        {/if}
        <tr class="grand"><td></td><td colspan="2">Total</td><td class="num">{fmtNum(totalQty)}</td>{#if !noPrice}<td></td><td class="num">{fmtNum(totalAmt, 2)}</td>{/if}</tr>
        {#if noPrice}<tr><td colspan="4" class="caption">Prices are not shown for your role.</td></tr>{/if}
      </tbody>
    </table>

    <footer class="sign">
      <div>
        <div class="overline">Prepared by</div>
        <div>{prepared?.name}</div>
        <div class="caption">Operations officer</div>
      </div>
      {#if awaiting}
        <div><div class="overline">Approval</div><div class="caption">Awaiting a director</div></div>
      {:else if issued}
        <div>
          <div class="overline">{data.po.approval === 'issued' ? 'Approved automatically' : data.po.approval === 'update' ? 'Updated by' : 'Issued by'}</div>
          <div>{approverName}{#if data.po.approval === 'revision'} (at loading){/if}</div>
        </div>
        <div class="stamp issued">
          <div class="overline">{co?.shortName ?? entity?.code}</div>
          <div class="small" style="font-weight:700">{data.po.approval === 'issued' ? 'APPROVED AUTOMATICALLY' : data.po.approval === 'update' ? `REVISION ${data.po.revision} · UPDATED` : 'ISSUED'} {fmtDate(data.po.approvedAt).toUpperCase()}</div>
          <div class="caption">by {approverName || '—'}</div>
        </div>
      {:else}
      <div>
        <div class="overline">Approved by</div>
        {#if data.po.signature?.startsWith('data:')}<img class="sig" src={data.po.signature} alt="Signature" />{:else}<div class="sig-ph">{approverName}</div>{/if}
        <div>{approverName}</div>
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

  <dialog class="sheet" bind:this={delDialog} aria-labelledby="del-title">
    <div class="body stack">
      {#if data.actions.delete}
        <h3 id="del-title">Delete {data.po.ref}?</h3>
        <p class="muted small">Nothing has been loaded yet. The purchase order is kept in the history with your reason (status Deleted), its pending trucks are taken off the loading list, and its reference is never reused.</p>
        <label class="field"><span>Reason (required)</span><textarea class="textarea" bind:value={delReason} placeholder="e.g. Raised twice — duplicate of BTW-PO-2026-0010"></textarea></label>
        {#if actionError}<p class="error" role="alert">{actionError}</p>{/if}
        <div class="row" style="justify-content:flex-end"><button class="btn btn-ghost" onclick={() => delDialog?.close()}>Cancel</button><button class="btn btn-danger" onclick={remove} disabled={busy === 'delete' || !delReason.trim()}>{busy === 'delete' ? 'Deleting…' : 'Delete purchase order'}</button></div>
      {:else}
        <h3 id="del-title">This purchase order can't be deleted</h3>
        <div class="card flag-danger refused" role="alert">{data.actions.deleteBlocked ?? 'Not allowed.'}</div>
        <div class="row" style="justify-content:flex-end"><button class="btn btn-ghost" onclick={() => delDialog?.close()}>Close</button>{#if data.actions.update}<a class="btn btn-primary" href="#/pos/{data.effectiveId}/edit" onclick={() => delDialog?.close()}><Pencil size={16} />Update instead</a>{/if}</div>
      {/if}
    </div>
  </dialog>
  <dialog class="sheet" bind:this={decDialog} aria-labelledby="dec-title">
    <div class="body stack">
      <h3 id="dec-title">{decision === 'approved' ? 'Approve & sign' : 'Reject purchase order'}</h3>
      <p class="muted small"><span class="mono">{data.po.ref}</span> · {data.po.title} · {fmtNum(totalQty)} cases</p>
      {#if decision === 'approved'}<SignaturePad bind:value={signature} /><p class="caption">Your signature and today's date go on the purchase order; its trucks then appear on the loading list.</p>{/if}
      <label class="field"><span>Comment {decision === 'approved' ? '(optional)' : '(required — the PO is deleted)'}</span><textarea class="textarea" bind:value={comment}></textarea></label>
      {#if actionError}<p class="error" role="alert">{actionError}</p>{/if}
      <div class="row" style="justify-content:flex-end"><button class="btn btn-ghost" onclick={() => decDialog?.close()}>Cancel</button><button class="btn {decision === 'approved' ? 'btn-accent' : 'btn-danger'}" onclick={decide} disabled={busy === 'decide'}>{decision === 'approved' ? 'Approve & sign' : 'Reject'}</button></div>
    </div>
  </dialog>
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
  .versions { margin-bottom: var(--space-4); display: flex; flex-direction: column; gap: var(--space-3); }
  .versions h3 { gap: var(--space-2); margin: 0; }
  .vlist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
  .vlist li { border: 1px solid var(--border); border-left: 3px solid var(--border); border-radius: var(--radius-md); padding: var(--space-2) var(--space-3); }
  .vlist li.current { border-left-color: var(--success); }
  .vlist li.here { background: var(--surface-sunken); }
  .vhead { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
  .grow { flex: 1; }
  .strong { font-weight: 700; }
  .reason { margin-top: var(--space-1); }
  .changes { margin: var(--space-1) 0 0; padding-left: var(--space-4); display: flex; flex-direction: column; gap: 2px; }
  .cmp-pick { align-items: flex-end; gap: var(--space-3); flex-wrap: wrap; margin-bottom: var(--space-2); }
  .side .grp { text-align: left; border-bottom: 1px solid var(--border); }
  .side td.chg { background: color-mix(in srgb, var(--warning) 22%, transparent); font-weight: 600; }
  .side tr.added td { background: color-mix(in srgb, var(--success) 14%, transparent); }
  .side tr.removed td { background: color-mix(in srgb, var(--danger) 12%, transparent); }
  .side tr.removed td:not(.caption) { text-decoration: line-through; }
  .danger { color: var(--danger); }
  .refused { padding: var(--space-3) var(--space-4); }
  .rev-note ul { margin: var(--space-1) 0 0; padding-left: var(--space-4); }
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
