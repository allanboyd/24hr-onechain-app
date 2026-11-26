<script lang="ts">
  // docs/09 §4 + docs/17 Phase 1: the Purchase orders work page — opens on the order list with a summary strip (orders by
  // stage, from the metric registry), filters in the address, and one "Create purchase order" action. Charts: Home · Purchasing.
  // Needs-action default (no filter in the address): directors with approvals on → Awaiting approval; planners → Not sent.
  import { watch } from '../lib/load.svelte';
  import ErrorState from '../components/ErrorState.svelte';
  import { loading, lookup, pos, ref, shipments, type Loading, type PoStage, type PurchaseOrder, type Shipment, type User } from '@btw/api';
  import { Badge, fmtDate, fmtMoney, fmtNum, router } from '@btw/ui';
  import SearchX from '@lucide/svelte/icons/search-x';
  import { PageHeader, SummaryStrip, ActionInCompany, EmptyState, DataTable, queryFilters, readQuery, ts, type Column, type SummaryTile, type Filters } from '../components/page';
  import { labelTone, poApprovals, revTag, STAGES, stageLabel } from '../lib/orders';
  import { poStageTiles, infoOf } from '../lib/tiles';
  import { seesPrices } from '@btw/api/access';
  let { user }: { params?: any; user: User } = $props();
  const money = $derived(seesPrices(user)); // loaders and receivers: no prices (docs/12 A-04)
  const approvals = poApprovals();
  const canCreate = $derived(user.roles.some((r) => r === 'planner' || r === 'director' || r === 'admin'));
  let list = $state<PurchaseOrder[] | null>(null);
  let loads = $state<Loading[]>([]);
  let ships = $state<Shipment[]>([]);
  async function load() { [list, loads, ships] = await Promise.all([pos.list({ all: true }), loading.list().catch(() => []), shipments.list().catch(() => [])]); }
  const w = watch(load);

  // V3-8: search + Company / Supplier / Amount filters live in the table (TanStack); same address names as before
  // (?q= ?entity= ?supplier=, now one or more ids separated by commas; ?amount=from,to)
  const f = queryFilters({ stage: '', entity: '', supplier: '', q: '', amount: '' });
  const list_ = (v: string) => (v ? v.split(',') : []);
  const range_ = (v: string): [number | null, number | null] => { const [a = '', b = ''] = v.split(','); return [a === '' ? null : Number(a), b === '' ? null : Number(b)]; };
  const tableFilters = $derived<Filters>({ company: list_(f.values.entity), supplier: list_(f.values.supplier), amount: range_(f.values.amount) });
  function setTableFilters(v: Filters) {
    const ids = (x: unknown) => (Array.isArray(x) ? (x as string[]).join(',') : '');
    const rg = (x: unknown) => (Array.isArray(x) && x.length === 2 && (x[0] !== null || x[1] !== null) ? `${x[0] ?? ''},${x[1] ?? ''}` : '');
    if (ids(v.company) !== f.values.entity) f.set('entity', ids(v.company));
    if (ids(v.supplier) !== f.values.supplier) f.set('supplier', ids(v.supplier));
    if (rg(v.amount) !== f.values.amount) f.set('amount', rg(v.amount));
  }
  let shown = $state(0);
  const live = $derived((list ?? []).filter((p) => p.status !== 'Deleted'));
  // docs/18: the strip counts are the registry's "orders at a stage" (latest revision, not deleted)
  const fig = $derived(poStageTiles(list ?? []));
  const atStage = (p: PurchaseOrder, s: string) => p.stage === s && !p.supersededById;
  const tiles = $derived<SummaryTile[]>([
    ...(approvals ? [{ key: 'Awaiting approval', label: 'Awaiting approval', value: list ? fig.awaiting : null, status: fig.awaiting ? 'warn' : undefined, statusLabel: fig.awaiting ? 'Needs a director' : undefined, info: infoOf('poAwaiting') }] : []),
    { key: 'Created', label: 'Not sent', value: list ? fig.notSent : null, sub: 'to the supplier', info: infoOf('poNotSent') },
    ...(approvals ? [] : [{ key: 'Sent', label: 'Sent, waiting to load', value: list ? fig.sent : null, info: infoOf('poSent') }]),
    { key: 'Loading', label: 'Loading', value: list ? fig.loading : null, info: infoOf('poLoading') },
    { key: 'On the road', label: 'On the road', value: list ? fig.onRoad : null, sub: 'orders', info: infoOf('poOnRoad') },
  ]);
  // open on what needs this person (only when nothing is chosen in the address)
  let defaulted = false;
  let auto = $state('');
  $effect(() => {
    if (defaulted || !list) return;
    defaulted = true;
    if (readQuery('stage') || readQuery('q') || readQuery('entity') || readQuery('supplier') || readQuery('amount')) return;
    if (approvals && user.roles.includes('director') && fig.awaiting) auto = 'Awaiting approval';
    else if (user.roles.includes('planner') && fig.notSent) auto = 'Created';
    if (auto) f.set('stage', auto);
  });
  // 'all' = every order, chosen on purpose (sticks in the address, so the needs-action default does not come back)
  const stage = $derived((f.values.stage === 'all' ? '' : f.values.stage) as PoStage | '');
  const stageNames = $derived(Object.fromEntries(STAGES().map((s) => [s, stageLabel(s)])));
  const tileKeys = $derived(tiles.map((t) => t.key));
  // the stage (summary strip / Status) stays here; the table applies search + filters on top
  const rows = $derived((stage === 'Deleted' ? list ?? [] : live).filter((p) => !stage || (tileKeys.includes(stage) ? atStage(p, stage) : p.stage === stage)));
  const r = ref();
  function progress(po: PurchaseOrder) {
    const ld = loads.filter((l) => l.poId === po.id), sh = ships.filter((s) => s.poId === po.id && !s.fromWarehouseId);
    return { trucks: ld.length || po.trucks || 0, loaded: ld.filter((l) => l.status === 'Loaded').length, delivered: sh.filter((s) => s.status === 'Acknowledged').length };
  }
  function clearAll() { f.clear(); }
  const supplierText = (po: PurchaseOrder) => `${lookup.supplier(po.supplierId)?.code}, ${lookup.supplier(po.supplierId)?.city}`;
  const columns = $derived<Column<PurchaseOrder>[]>([
    { key: 'ref', label: 'Reference', sticky: true, value: (po) => po.baseRef ?? po.ref, filterValue: (po) => `${po.ref} ${po.baseRef ?? ''}`, csv: (po) => po.ref, cell: refCell },
    { key: 'title', label: 'Title', value: (po) => po.title, cell: titleCell },
    { key: 'company', label: 'Company', value: (po) => lookup.entity(po.entityId)?.code, hideBelow: 900, filter: 'select', filterValue: (po) => po.entityId, filterLabel: (id) => lookup.entity(id)?.shortName || lookup.entity(id)?.code || id },
    { key: 'supplier', label: 'Supplier', value: supplierText, hideBelow: 760, filter: 'select', filterValue: (po) => po.supplierId, filterLabel: (id) => { const s = lookup.supplier(id); return s ? `${s.code}, ${s.city}` : id; } },
    { key: 'trucks', label: 'Trucks', align: 'right', value: (po) => po.trucks ?? null },
    { key: 'cases', label: 'Cases', align: 'right', sortValue: (po) => po.cases ?? null, value: (po) => (po.cases !== undefined ? fmtNum(po.cases) : null), csv: (po) => po.cases ?? '' },
    ...(money ? [{ key: 'amount', label: 'Amount', align: 'right' as const, filter: 'range' as const, sortValue: (po: PurchaseOrder) => po.amount ?? null, value: (po: PurchaseOrder) => (po.amount !== undefined ? fmtMoney(po.amount, po.currency) : null), csv: (po: PurchaseOrder) => (po.amount !== undefined ? `${po.currency} ${po.amount}` : '') }] : []),
    { key: 'date', label: 'Created', sortValue: (po) => ts(po.date), csv: (po) => po.date?.slice(0, 10), cell: createdCell },
    { key: 'status', label: 'Status', value: (po) => stageLabel(po.stage), cell: statusCell },
    { key: 'progress', label: 'Progress', sortValue: (po) => (po.status === 'Issued' ? progress(po).loaded / Math.max(1, progress(po).trucks) : null), csv: (po) => { const pr = progress(po); return po.status === 'Issued' ? `${pr.loaded}/${pr.trucks} loaded` : ''; }, cell: progressCell, hideBelow: 1000 },
  ]);
</script>

<PageHeader overline="Procurement" title="Purchase orders" description="Orders to suppliers, from creation to delivery." analysis="purchasing"
  info="A purchase order is created, updated or deleted — never drafted. {approvals ? 'A director approves each new order before it goes to the supplier.' : 'A new order is approved automatically.'} An update, or a difference at loading, saves the next revision (…-rev001); the original and every version stay viewable on the order.">
  {#snippet primary()}<ActionInCompany label="Create purchase order" what="purchase order" href="#/pos/new" when={canCreate} />{/snippet}
</PageHeader>
<ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />
<SummaryStrip {tiles} bind:value={f.values.stage} param="stage" label="Purchase orders by stage" allValue="all" noun="orders" total={list ? live.length : null} shown={list ? shown : null} {auto} labels={stageNames} />


<DataTable id="pos" label="Purchase orders" noun="orders" rows={list ? rows : null} {columns} rowKey={(po) => po.id} onrowclick={(po) => router.go(`/pos/${po.id}`)}
  rowClass={(po) => (po.status === 'Deleted' ? 'deleted' : '')} initialSort={{ key: 'date', dir: 'desc' }} filename="purchase-orders" card={phoneCard}
  searchable searchPlaceholder="Search reference, title, supplier…" bind:search={() => f.values.q, (v) => { if (v !== f.values.q) f.set('q', v); }}
  bind:filters={() => tableFilters, setTableFilters} bind:shown>
  {#snippet toolbar()}
    <label class="pos-status"><span class="dt-sr-only">Status</span><select class="select" aria-label="Status" value={stage || 'all'} onchange={(e) => f.set('stage', e.currentTarget.value)}><option value="all">All stages</option>{#each STAGES() as s}<option value={s}>{stageLabel(s)}</option>{/each}</select></label>
  {/snippet}
  {#snippet empty()}
    {#if stage || f.values.q || f.values.entity || f.values.supplier || f.values.amount}<EmptyState title="No purchase orders match these filters" icon={SearchX} compact><button class="btn btn-secondary btn-sm" onclick={clearAll}>Clear filters</button></EmptyState>{:else}<EmptyState title="No purchase orders yet" hint="Create one with the button above." compact />{/if}
  {/snippet}
</DataTable>

{#snippet refCell(po: PurchaseOrder)}<span class="mono"><a href="#/pos/{po.id}">{po.baseRef ?? po.ref}</a>{#if po.revision}{' '}<Badge tone="accent">{revTag(po.revision)}</Badge>
  <div class="caption">{po.revisionKind === 'updated' ? 'updated by the office' : 'revised at loading'}</div>{/if}</span>{/snippet}
{#snippet titleCell(po: PurchaseOrder)}{po.title || '—'}{#if po.status === 'Deleted' && po.deleteReason}<div class="caption">“{po.deleteReason}”</div>{/if}{/snippet}
{#snippet createdCell(po: PurchaseOrder)}<span class="small">{fmtDate(po.date)}<div class="caption">{lookup.user(po.approvedById)?.name ?? ''}</div></span>{/snippet}
{#snippet statusCell(po: PurchaseOrder)}<Badge tone={labelTone(po.stage ?? '')}>{stageLabel(po.stage)}</Badge>{/snippet}
{#snippet progressCell(po: PurchaseOrder)}{@const pr = progress(po)}{#if po.status === 'Issued'}<span class="small">{pr.loaded}/{pr.trucks} loaded{#if pr.delivered} · {pr.delivered} delivered{/if}</span>{/if}{/snippet}
<!-- Phone: stacked cards -->
{#snippet phoneCard(po: PurchaseOrder)}
  <div class="row between"><a class="mono" href="#/pos/{po.id}">{po.baseRef ?? po.ref}</a>{#if po.revision}<Badge tone="accent">{revTag(po.revision)}</Badge>{/if}<span class="grow"></span><Badge tone={labelTone(po.stage ?? '')}>{stageLabel(po.stage)}</Badge></div>
  <div>{po.title || '—'} · <span class="muted">{lookup.supplier(po.supplierId)?.code} {lookup.supplier(po.supplierId)?.city}</span></div>
  <div class="row between"><span class="small">{po.trucks} trucks · {fmtNum(po.cases ?? 0)} cases</span>{#if money && po.amount !== undefined}<strong class="num">{fmtMoney(po.amount, po.currency)}</strong>{/if}</div>
{/snippet}

<style>
  .pos-status .select { height: var(--control-sm); border-radius: 999px; width: auto; }
  .dt-sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  :global(tr.deleted td) { color: var(--text-muted); }
  :global(tr.deleted .mono a) { text-decoration: line-through; }
  .grow { flex: 1; }
</style>
