<script lang="ts">
  // Asie / Yonas home strip on the receiver screen (docs/11 D-A1, dashboards §10): one row of status chips under the
  // tools — to sign (awaiting acknowledgement), on the way (expected arrival), stock low / overstock, this month's
  // warehouse expenses, (Asie) open re-exports. Tap a chip → ONE short list in a sheet; every row opens its task.
  // Quantities only (receivers see no stock values). Lazy chunk; the receiver screen stays a single-task screen.
  import { lookup, reexports, warehouse, type LegView, type ReexportOrder, type User, type WarehouseExpense, type WarehouseStockRow } from '@btw/api';
  import { fmtDateTime } from '@btw/ui';
  import ClipboardPen from '@lucide/svelte/icons/clipboard-pen';
  import Truck from '@lucide/svelte/icons/navigation';
  import TrendingDown from '@lucide/svelte/icons/battery-low';
  import PackageX from '@lucide/svelte/icons/package-x';
  import Receipt from '@lucide/svelte/icons/banknote';
  import ArrowRightLeft from '@lucide/svelte/icons/repeat';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import Sheet from '../../components/Sheet.svelte';
  import CompanyDot from '../../components/CompanyDot.svelte';
  import { cases, warehouseLabel } from '../../lib';
  let { user, incoming, rev = 0, onreceive, ontool }: { user: User; incoming: LegView[]; /** bump to reload (a warehouse sheet closed) */ rev?: number; onreceive: (v: LegView) => void; ontool: (t: 'expense' | 'stock' | 'reexport') => void } = $props();

  const has = (f: string) => !!user.features?.includes(f as never);
  const isAsie = $derived(user.roles.includes('reexport'));
  let stock = $state<WarehouseStockRow[] | null>(null);
  let spent = $state<WarehouseExpense[] | null>(null);
  let rx = $state<ReexportOrder[] | null>(null);
  const monthStart = () => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10); };
  async function load() {
    const from30 = new Date(Date.now() - 30 * 864e5).toISOString();
    const [s, e, r] = await Promise.all([
      has('warehouse-stock') ? warehouse.stock({ from: from30 }).catch(() => null) : null,
      has('warehouse-expenses') ? warehouse.expenses({ from: monthStart() }).catch(() => null) : null,
      isAsie ? reexports.list().catch(() => null) : null,
    ]);
    stock = s; spent = e; rx = r;
  }
  $effect(() => { void incoming.length; void rev; load(); });

  const arrivedNow = (v: LegView) => v.leg.status === 'Arrived' || !!v.leg.passes.at(-1)?.arrivedAt;
  const toSign = $derived(incoming.filter(arrivedNow));
  const onWay = $derived(incoming.filter((v) => !arrivedNow(v)).sort((a, b) => Date.parse(a.eta.eta) - Date.parse(b.eta.eta)));
  // cover = cases held ÷ cases sold per day over the last 30 days (same bands as the stock report: low < 14, over > 60 days)
  type Cov = { r: WarehouseStockRow; cover: number | null; perDay: number };
  const cov = $derived<Cov[]>((stock ?? []).map((r) => { const perDay = r.sold / 30; return { r, perDay, cover: perDay ? r.held / perDay : null }; }));
  const low = $derived(cov.filter((c) => c.perDay > 0 && (c.cover ?? 0) < 14).sort((a, b) => (a.cover ?? 0) - (b.cover ?? 0)));
  const over = $derived(cov.filter((c) => c.r.held > 0 && (c.cover == null || c.cover > 60)).sort((a, b) => b.r.held - a.r.held));
  const spentUsd = $derived((spent ?? []).reduce((a, e) => a + e.amountUsd, 0));
  const openRx = $derived((rx ?? []).filter((o) => o.status === 'Open' || o.status === 'Loaded' || o.status === 'In transit'));
  const monthName = new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(new Date());

  type Key = 'sign' | 'way' | 'low' | 'over' | 'spent' | 'rx';
  let open = $state<Key | null>(null);
  const chips = $derived([
    { key: 'sign' as Key, label: `${toSign.length} to sign`, tone: toSign.length ? 'warning' : 'neutral', icon: ClipboardPen, show: true },
    { key: 'way' as Key, label: `${onWay.length} on the way`, tone: 'info', icon: Truck, show: true },
    { key: 'low' as Key, label: `${low.length} low`, tone: low.length ? 'danger' : 'neutral', icon: TrendingDown, show: !!stock },
    { key: 'over' as Key, label: `${over.length} overstock`, tone: over.length ? 'warning' : 'neutral', icon: PackageX, show: !!stock },
    { key: 'spent' as Key, label: `$${Math.round(spentUsd).toLocaleString('en-US')} · ${monthName}`, tone: 'neutral', icon: Receipt, show: !!spent },
    { key: 'rx' as Key, label: `${openRx.length} re-export${openRx.length === 1 ? '' : 's'}`, tone: openRx.length ? 'info' : 'neutral', icon: ArrowRightLeft, show: isAsie && !!rx },
  ].filter((c) => c.show));
  const TITLE: Record<Key, string> = { sign: 'Waiting for your signature', way: 'On the way · by expected arrival', low: 'Running low · under 14 days', over: 'Overstock · over 60 days or not selling', spent: `Warehouse expenses · ${monthName}`, rx: 'Re-export orders' };
  const name = (pid: string) => { const p = lookup.product(pid); return p ? `${p.brand} ${p.pack}` : pid; };
  const total = (v: LegView) => v.leg.lines.reduce((a, x) => a + x.loadedQty, 0);
  const byCat = $derived(Object.entries((spent ?? []).reduce<Record<string, number>>((a, e) => ((a[e.category] = (a[e.category] ?? 0) + e.amountUsd), a), {})).sort((a, b) => b[1] - a[1]));
  const pick = (fn: () => void) => { open = null; fn(); };
</script>

<div class="strip" role="group" aria-label="My warehouse">
  {#each chips as c (c.key)}
    {@const Icon = c.icon}
    <button class="chip tone-{c.tone}" onclick={() => (open = c.key)}><Icon size={16} aria-hidden="true" />{c.label}</button>
  {/each}
</div>

{#if open}
  <Sheet modal title={TITLE[open]} onclose={() => (open = null)}>
    <ul class="list">
      {#if open === 'sign' || open === 'way'}
        {#each open === 'sign' ? toSign : onWay as v (v.leg.id)}
          <li><button onclick={() => pick(() => onreceive(v))}>
            <CompanyDot entityId={v.shipment.entityId} />
            <span class="grow"><strong>{v.truck?.reg}</strong><span class="caption">{cases(total(v))} · {v.shipment.ref}</span></span>
            <span class="side">{#if open === 'sign'}<span class="tag tone-warning">Arrived</span>{:else}<span class="caption">{fmtDateTime(v.eta.eta)}</span><span class="tag tone-{v.eta.state === 'Late' ? 'danger' : 'success'}">{v.eta.state}</span>{/if}</span>
            <ChevronRight size={18} />
          </button></li>
        {:else}<li class="none">{open === 'sign' ? 'No truck is waiting for a signature.' : 'No truck on the way right now.'}</li>{/each}
      {:else if open === 'low' || open === 'over'}
        {#each (open === 'low' ? low : over).slice(0, 20) as c (`${c.r.entityId}|${c.r.warehouseId}|${c.r.productId}`)}
          <li><button onclick={() => pick(() => ontool('stock'))}>
            <CompanyDot entityId={c.r.entityId} />
            <span class="grow"><strong>{name(c.r.productId)}</strong><span class="caption">{cases(c.r.held)} held{user.warehouseIds.length > 1 ? ` · ${warehouseLabel(c.r.warehouseId)}` : ''}</span></span>
            <span class="tag tone-{open === 'low' ? 'danger' : 'warning'}">{c.cover == null ? 'No sales 30 d' : `${Math.round(c.cover)} days`}</span>
            <ChevronRight size={18} />
          </button></li>
        {:else}<li class="none">{open === 'low' ? 'Nothing is running low.' : 'No overstock.'}</li>{/each}
      {:else if open === 'spent'}
        {#each byCat as [cat, usd] (cat)}
          <li><button onclick={() => pick(() => ontool('expense'))}><span class="grow"><strong>{cat}</strong></span><span class="amt">USD {Math.round(usd).toLocaleString('en-US')}</span><ChevronRight size={18} /></button></li>
        {:else}<li class="none">Nothing recorded this month yet.</li>{/each}
      {:else if open === 'rx'}
        {#each openRx as o (o.id)}
          <li><button onclick={() => pick(() => ontool('reexport'))}><CompanyDot entityId={o.entityId} /><span class="grow"><strong>{o.ref}</strong><span class="caption">{cases(o.lines.reduce((a, l) => a + (l.loadedQty ?? l.qty), 0))} · to {warehouseLabel(o.toWarehouseId)}</span></span><span class="tag tone-{o.status === 'Open' ? 'warning' : 'info'}">{o.status === 'Open' ? 'To load' : o.status}</span><ChevronRight size={18} /></button></li>
        {:else}<li class="none">No open re-export orders.</li>{/each}
      {/if}
    </ul>
    {#if open === 'spent'}<button class="btn btn-accent btn-lg btn-block" onclick={() => pick(() => ontool('expense'))}>Record an expense</button>{/if}
    {#if open === 'rx'}<button class="btn btn-secondary btn-lg btn-block" onclick={() => pick(() => ontool('reexport'))}>Open re-exports</button>{/if}
  </Sheet>
{/if}

<style>
  .strip { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; margin: 0 calc(-1 * var(--space-5)); padding: 2px var(--space-5) 4px; }
  .strip::-webkit-scrollbar { display: none; }
  .chip { flex: none; display: inline-flex; align-items: center; gap: 6px; min-height: 44px; padding: 0 14px; border-radius: 22px; border: 1px solid var(--border); background: var(--surface); color: var(--text); font: 700 14px var(--ff-body); cursor: pointer; white-space: nowrap; }
  .chip.tone-danger { background: var(--danger-subtle); color: var(--danger); border-color: transparent; }
  .chip.tone-warning { background: var(--warning-subtle); color: var(--warning); border-color: transparent; }
  .chip.tone-info { background: var(--info-subtle); color: var(--info); border-color: transparent; }
  .list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
  .list li { border-bottom: 1px solid var(--border); }
  .list button { display: flex; align-items: center; gap: var(--space-2); width: 100%; min-height: 60px; border: 0; background: none; color: var(--text); font: inherit; text-align: left; cursor: pointer; padding: 6px 0; }
  .grow { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .grow strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .side { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
  .tag { font: 700 12px var(--ff-body); padding: 3px 8px; border-radius: 10px; white-space: nowrap; }
  .tag.tone-danger { background: var(--danger-subtle); color: var(--danger); } .tag.tone-warning { background: var(--warning-subtle); color: var(--warning); }
  .tag.tone-success { background: var(--success-subtle); color: var(--success); } .tag.tone-info { background: var(--info-subtle); color: var(--info); }
  .amt { font-weight: 700; font-variant-numeric: tabular-nums; }
  .none { padding: 16px 0; color: var(--text-muted); border: 0 !important; }
</style>
