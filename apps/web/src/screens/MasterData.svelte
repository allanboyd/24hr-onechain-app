<script lang="ts">
  import { lookup, masterdata, onChange, ref, type User } from '@btw/api';
  import { MASTER_LIMITS } from '@btw/api/static-data';
  import Pencil from '@lucide/svelte/icons/pencil';
  import History from '@lucide/svelte/icons/history';
  import StaticDialog from '../components/StaticDialog.svelte';
  import { describe } from '../lib/errors';
  import { Badge, fmtDate, fmtNum, say } from '@btw/ui';
  import Plus from '@lucide/svelte/icons/plus';
  import Upload from '@lucide/svelte/icons/upload';
  import WarehousesTab from '../components/WarehousesTab.svelte';
  import ProvidersTab from '../components/ProvidersTab.svelte';
  import DriversTab from '../components/DriversTab.svelte';
  import { can } from '../lib/features';
  import { qp } from '../lib/tab';
  import { untrack } from 'svelte';
  import { CATEGORIES, categoryOf, groupProducts, packToConfirm, priceToConfirm, sourceCode, type Category } from '../lib/products';
  let { user }: { params?: any; user: User } = $props();
  let v = $state(0);
  $effect(() => onChange(() => v++));
  const r = $derived.by(() => { void v; return ref(); });
  const ALL_TABS = ['Companies', 'Suppliers', 'Goods', 'Receiving companies', 'Providers & trucks', 'Drivers', 'Warehouses', 'Routes & checkpoints'] as const;
  type Tab = (typeof ALL_TABS)[number];
  const TRANSPORT: Tab[] = ['Providers & trucks', 'Drivers'];
  // docs/12 §7: companies, suppliers, goods and receivers — Kabonge and the directors (edit); transport data — edited by
  // them, viewed by Testfie, the loaders and Asie.
  const staticEdit = $derived(can(user, 'master-data.static'));
  const full = $derived(staticEdit || can(user, 'master-data.transport'));
  const tabs = $derived(full ? [...ALL_TABS] : ALL_TABS.filter((t) => TRANSPORT.includes(t)));
  const linked = ({ providers: 'Providers & trucks', trucks: 'Providers & trucks', drivers: 'Drivers', goods: 'Goods', products: 'Goods', suppliers: 'Suppliers', companies: 'Companies' } as Record<string, Tab>)[qp('tab')];
  let tab = $state<Tab>(untrack(() => linked ?? (can(user, 'master-data.static') || can(user, 'master-data.transport') ? 'Companies' : 'Providers & trucks')));
  let sd = $state<StaticDialog>();
  const audit = $derived(can(user, 'audit'));
  let showInactive = $state(false);
  async function toggleActive(kind: 'entity' | 'supplier' | 'product' | 'receiving-company', id: string, active: boolean, label: string) {
    if (!active && !window.confirm(`Deactivate ${label}? It stays in history but is no longer offered on new orders.`)) return;
    try {
      const x = { active };
      if (kind === 'entity') await masterdata.saveEntity(id, x); else if (kind === 'supplier') await masterdata.saveSupplier(id, x);
      else if (kind === 'product') await masterdata.saveProduct(id, x); else await masterdata.saveReceivingCompany(id, x);
      say(`${label} ${active ? 'reactivated' : 'deactivated'}`);
    } catch (err) { say(describe(err).message); }
  }
  let route = $state(untrack(() => ref().routes[0].id));
  const sel = $derived(r.routes.find((x) => x.id === route)!);
  const canEdit = $derived(can(user, 'master-data.transport'));
  const kindTone = { border: 'warning', weighbridge: 'info', warehouse: 'success', loading: 'accent', town: 'neutral' } as const;
  const importXls = () => say('Excel import with a dry-run validation report comes with the backend (§13, /masterdata/{kind}/import)');
  let q = $state('');
  let src = $state('');
  let cat = $state<Category | ''>('');
  const products = $derived(r.products.filter((p) => (showInactive || p.active !== false) && (!q || `${p.sku} ${p.brand} ${p.pack}`.toLowerCase().includes(q.toLowerCase())) && (!src || sourceCode(p) === src) && (!cat || categoryOf(p) === cat)));
  const grouped = $derived(groupProducts(products));
  const sources = $derived([...new Set(r.products.map(sourceCode))].sort());
  const tbcPacks = $derived(r.products.filter(packToConfirm).length);
  const priceOf = (id: string) => r.priceList.find((x) => x.productId === id);

  // Route timings — Kabonge and Testfie review these seed values (plan §9 item 7). Edits are local to the prototype.
  const original = Object.fromEntries(untrack(() => ref()).routes.map((x) => [x.id, x.stops.map((st) => ({ ...st }))]));
  let timings = $state(structuredClone(original));
  const stops = $derived(timings[route]);
  const changed = $derived(JSON.stringify(timings[route]) !== JSON.stringify(original[route]));
  const totalDwell = $derived(stops.reduce((a, st) => a + (st.plannedDwellHours || 0), 0));
  const borderDwell = $derived(stops.filter((st) => lookup.checkpoint(st.checkpointId)?.kind === 'border').reduce((a, st) => a + (st.plannedDwellHours || 0), 0));
  const fmtH = (h: number) => (h >= 24 ? `${Math.floor(h / 24)} d ${Math.round(h % 24)} h` : `${h} h`);
  function saveTimings() {
    const bad = stops.findIndex((st, i) => i > 0 && st.plannedHours < stops[i - 1].plannedHours + (stops[i - 1].plannedDwellHours || 0));
    if (bad > 0) return say(`Stop ${bad + 1} is planned before the truck can leave stop ${bad} — check the hours`);
    original[route] = stops.map((st) => ({ ...st })); timings[route] = stops.map((st) => ({ ...st }));
    say('Timings saved in this prototype — the real build versions them and recalculates ETAs (TR-04)');
  }
  // The sheet gave a bottle size (e.g. "Chivas 1 L") but no bottles per case: show the size, flag only the case size.
  const sizeKnown = (p: { pack: string }) => !!p.pack && !/^to confirm$/i.test(p.pack.trim()) && /\d\s*(ml|cl|l)\b/i.test(p.pack);
</script>

<div class="page-head">
  <div><div class="overline crumb">Admin</div><h1>{full ? 'Master data' : 'Transport master data'}</h1>{#if !full}<p class="muted small">Transport providers, trucks, trailers and drivers — read only for your role (Kabonge and the directors keep them up to date).</p>{/if}</div>
  {#if staticEdit && (tab === 'Goods' || tab === 'Suppliers' || tab === 'Companies' || tab === 'Receiving companies')}<div class="row"><button class="btn btn-secondary" onclick={importXls}><Upload size={16} />Import from Excel</button><button class="btn btn-primary" onclick={() => sd?.open(tab === 'Goods' ? 'product' : tab === 'Suppliers' ? 'supplier' : tab === 'Companies' ? 'entity' : 'receiving-company', null)}><Plus size={16} />Add {tab === 'Goods' ? 'goods' : tab === 'Suppliers' ? 'supplier' : tab === 'Companies' ? 'company' : 'receiving company'}</button></div>{/if}
</div>
<StaticDialog bind:this={sd} />

<div class="tabs" role="tablist">
  {#each tabs as t}<button role="tab" aria-selected={tab === t} onclick={() => (tab = t)}>{t}</button>{/each}
</div>

{#if tab === 'Goods'}
  <div class="filters">
    <label class="field"><span>Search</span><input class="input" type="search" bind:value={q} placeholder="Brand, pack or SKU" /></label>
    <label class="field"><span>Source</span><select class="select" bind:value={src}><option value="">All sources</option>{#each sources as s}<option>{s}</option>{/each}</select></label>
    <label class="field"><span>Category</span><select class="select" bind:value={cat}><option value="">All categories</option>{#each CATEGORIES as c}<option>{c}</option>{/each}</select></label>
    <label class="check"><input type="checkbox" bind:checked={showInactive} /> Show deactivated</label>
  </div>
  <p class="caption" style="margin:0 0 var(--space-3)">{fmtNum(r.products.length)} products from the client's price list (Source.xlsx) · SKU = brand + package per source · <Badge tone="warning">pack to confirm</Badge> {tbcPacks} without a pack size · <Badge tone="warning">demo price — to confirm</Badge> the sheet has no prices yet.</p>
  <div class="stack">
    {#each grouped as g (g.source)}
      <section class="card flush">
        <header><div class="row"><h3>{g.source}</h3><span class="caption">{lookup.supplier(r.suppliers.find((s) => s.code === g.source)?.id ?? '')?.city ?? ''} · {g.categories.reduce((a, c) => a + c.products.length, 0)} products</span></div></header>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Category</th><th>Brand</th><th>Package</th><th class="num">Units / case</th><th class="num">Size (ml)</th><th>SKU code</th><th class="num">Price / case</th>{#if staticEdit || audit}<th><span class="sr-only">Actions</span></th>{/if}</tr></thead>
          <tbody>{#each g.categories as c}{#each c.products as p, i}{@const pl = priceOf(p.id)}
            <tr class:off={p.active === false}><td class="small muted">{i === 0 ? c.category : ''}</td><td>{p.brand}{#if p.active === false} <Badge tone="neutral">Deactivated</Badge>{/if}</td>
              <td>{#if packToConfirm(p) && sizeKnown(p)}{p.pack.replace(/\s*—.*$/, '')} <Badge tone="warning">case size to confirm</Badge>{:else if packToConfirm(p)}<Badge tone="warning">pack to confirm</Badge>{:else}{p.pack}{/if}</td>
              <td class="num">{packToConfirm(p) ? '—' : p.unitsPerCase}</td><td class="num">{(packToConfirm(p) && !sizeKnown(p)) || !p.sizeMl ? '—' : fmtNum(p.sizeMl)}</td>
              <td class="mono small">{p.sku}</td>
              <td class="num">{#if pl}{pl.currency} {fmtNum(pl.price, 2)}{#if priceToConfirm(p)}<div class="caption tbc">demo price — to confirm</div>{/if}{:else}—{/if}</td>
              {#if staticEdit || audit}<td><div class="acts">{#if staticEdit}<button class="btn btn-ghost btn-sm" onclick={() => sd?.open('product', p)} aria-label="Edit {p.brand} {p.pack}"><Pencil size={14} /></button><button class="btn btn-ghost btn-sm" onclick={() => toggleActive('product', p.id, p.active === false, `${p.brand} ${p.pack}`)}>{p.active === false ? 'Reactivate' : 'Deactivate'}</button>{/if}{#if audit}<a class="btn btn-ghost btn-sm" href="#/audit?q={p.id}" aria-label="History of {p.brand}"><History size={14} /></a>{/if}</div></td>{/if}</tr>
          {/each}{/each}</tbody>
        </table></div>
      </section>
    {:else}<div class="card empty">No product matches these filters.</div>{/each}
  </div>
{:else if tab === 'Suppliers'}
  <p class="caption room">{r.suppliers.length} of {MASTER_LIMITS.suppliers} suppliers (room for {Math.max(0, MASTER_LIMITS.suppliers - r.suppliers.length)} more)</p>
  <div class="card flush table-wrap"><table class="table">
    <thead><tr><th>Code</th><th>Export section</th><th>City</th><th>Country</th><th>Email</th><th>Loading point</th><th class="num">Goods</th><th>Status</th>{#if staticEdit || audit}<th></th>{/if}</tr></thead>
    <tbody>{#each r.suppliers as s}<tr class:off={s.active === false}><td><strong>{s.code}</strong></td><td>{s.name}</td><td>{s.city}</td><td>{s.country}</td><td class="small">{s.email}</td><td class="small">{lookup.checkpoint(s.checkpointId)?.name}</td><td class="num">{r.products.filter((p) => p.supplierId === s.id).length}</td>
      <td>{#if s.active === false}<Badge tone="neutral">Deactivated</Badge>{:else}<Badge tone="success">Active</Badge>{/if}</td>
      {#if staticEdit || audit}<td><div class="acts">{#if staticEdit}<button class="btn btn-ghost btn-sm" onclick={() => sd?.open('supplier', s)} aria-label="Edit {s.code}"><Pencil size={14} /></button><button class="btn btn-ghost btn-sm" onclick={() => toggleActive('supplier', s.id, s.active === false, s.code)}>{s.active === false ? 'Reactivate' : 'Deactivate'}</button>{/if}{#if audit}<a class="btn btn-ghost btn-sm" href="#/audit?q={s.id}" aria-label="History of {s.code}"><History size={14} /></a>{/if}</div></td>{/if}</tr>{/each}</tbody>
  </table></div>
{:else if tab === 'Companies'}
  <p class="caption room">{r.entities.length} of {MASTER_LIMITS.entities} companies (room for {Math.max(0, MASTER_LIMITS.entities - r.entities.length)} more)</p>
  <div class="card flush table-wrap"><table class="table">
    <thead><tr><th>Code</th><th>Display name</th><th>Legal name</th><th>PO prefix</th><th>Reporting</th><th>Address</th><th>Status</th>{#if staticEdit || audit}<th></th>{/if}</tr></thead>
    <tbody>{#each r.entities as e}<tr class:off={e.active === false}><td><strong>{e.code}</strong></td><td>{e.shortName}</td><td>{e.name}</td><td class="mono small">{e.poPrefix}</td><td>{e.reportingCurrency}</td><td class="small">{e.address.join(', ')}</td>
      <td>{#if e.active === false}<Badge tone="neutral">Deactivated</Badge>{:else}<Badge tone="success">Active</Badge>{/if}</td>
      {#if staticEdit || audit}<td><div class="acts">{#if staticEdit}<button class="btn btn-ghost btn-sm" onclick={() => sd?.open('entity', e)} aria-label="Edit {e.code}"><Pencil size={14} /></button><button class="btn btn-ghost btn-sm" onclick={() => toggleActive('entity', e.id, e.active === false, e.shortName || e.code)}>{e.active === false ? 'Reactivate' : 'Deactivate'}</button>{/if}{#if audit}<a class="btn btn-ghost btn-sm" href="#/audit?q={e.id}" aria-label="History of {e.code}"><History size={14} /></a>{/if}</div></td>{/if}</tr>{/each}</tbody>
  </table></div>
{:else if tab === 'Receiving companies'}
  <div class="card flush table-wrap"><table class="table">
    <thead><tr><th>Company</th><th>Countries</th><th>Warehouses</th><th>Status</th>{#if staticEdit || audit}<th></th>{/if}</tr></thead>
    <tbody>{#each r.receivingCompanies as c}<tr class:off={c.active === false}><td><strong>{c.name}</strong></td><td>{c.countries.join(', ')}</td><td class="small">{r.warehouses.filter((w) => w.receivingCompanyId === c.id).map((w) => w.name).join(', ')}</td>
      <td>{#if c.active === false}<Badge tone="neutral">Deactivated</Badge>{:else}<Badge tone="success">Active</Badge>{/if}</td>
      {#if staticEdit || audit}<td><div class="acts">{#if staticEdit}<button class="btn btn-ghost btn-sm" onclick={() => sd?.open('receiving-company', c)} aria-label="Edit {c.name}"><Pencil size={14} /></button><button class="btn btn-ghost btn-sm" onclick={() => toggleActive('receiving-company', c.id, c.active === false, c.name)}>{c.active === false ? 'Reactivate' : 'Deactivate'}</button>{/if}{#if audit}<a class="btn btn-ghost btn-sm" href="#/audit?q={c.id}" aria-label="History of {c.name}"><History size={14} /></a>{/if}</div></td>{/if}</tr>{/each}</tbody>
  </table></div>
{:else if tab === 'Providers & trucks'}
  <ProvidersTab {user} />
{:else if tab === 'Drivers'}
  <DriversTab {user} />
{:else if tab === 'Warehouses'}
  <WarehousesTab {user} />
{:else if tab === 'Routes & checkpoints'}
  <div class="layout">
    <section class="card flush">
      <header><h3>Routes</h3></header>
      <ul class="list">{#each r.routes as rt}<li><button class:on={route === rt.id} onclick={() => (route = rt.id)}><strong>{rt.name}</strong><span class="caption">{rt.code} · {fmtNum(rt.distanceKm)} km · {rt.stops.length} checkpoints</span></button></li>{/each}</ul>
    </section>
    <div class="stack">
      <section class="card flush">
        <header>
          <div><h3>{sel.name}</h3><div class="caption">{sel.code} · {fmtNum(sel.distanceKm)} km · planned transit {fmtH(stops.at(-1)!.plannedHours)} incl. {fmtH(borderDwell)} at borders</div></div>
          {#if canEdit}<div class="row"><button class="btn btn-ghost btn-sm" disabled={!changed} onclick={() => (timings[route] = original[route].map((st) => ({ ...st })))}>Reset</button><button class="btn btn-primary btn-sm" disabled={!changed} onclick={saveTimings}>Save timings</button></div>{/if}
        </header>
        <div class="note small">These hours are <strong>seed estimates for review</strong> by Kabonge and Testfie. ETA = planned arrival + delay carried from the last checkpoint (TR-04). After go-live they are replaced by historical medians per lane.</div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th class="num">#</th><th>Checkpoint</th><th>Type</th><th class="num">Planned arrival (h after departure)</th><th class="num">Expected dwell (h)</th><th class="num">Geofence</th></tr></thead>
          <tbody>{#each stops as st, i (st.checkpointId)}{@const cp = lookup.checkpoint(st.checkpointId)}
            <tr><td class="num">{i + 1}</td><td>{cp?.name}</td><td><Badge tone={kindTone[cp?.kind ?? 'town']}>{cp?.kind}</Badge></td>
              <td class="num">{#if canEdit && i > 0}<input class="input num" type="number" min="0" step="0.5" bind:value={st.plannedHours} aria-label="Planned hours to {cp?.name}" />{:else}{st.plannedHours}{/if}</td>
              <td class="num">{#if canEdit && i < stops.length - 1}<input class="input num" type="number" min="0" step="0.5" bind:value={st.plannedDwellHours} aria-label="Dwell at {cp?.name}" />{:else}{st.plannedDwellHours || '—'}{/if}</td>
              <td class="num small">{fmtNum(cp?.radiusM ?? 0)} m</td></tr>
          {/each}
            <tr class="subtotal"><td colspan="3">Total</td><td class="num">{stops.at(-1)!.plannedHours} h</td><td class="num">{totalDwell} h</td><td></td></tr>
          </tbody>
        </table></div>
      </section>
      <section class="card flush">
        <header><h3>All checkpoints (geofences)</h3></header>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Name</th><th>Type</th><th>Country</th><th class="num">Lat, Lng</th><th class="num">Geofence radius</th></tr></thead>
          <tbody>{#each r.checkpoints as c}<tr><td>{c.name}</td><td><Badge tone={kindTone[c.kind]}>{c.kind}</Badge></td><td>{c.country}</td><td class="num small">{c.lat.toFixed(4)}, {c.lng.toFixed(4)}</td><td class="num">{fmtNum(c.radiusM)} m</td></tr>{/each}</tbody>
        </table></div>
      </section>
    </div>
  </div>
{/if}

<style>
  .layout { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: var(--space-4); align-items: start; }
  @media (max-width: 1100px) { .layout { grid-template-columns: minmax(0, 1fr); } }
  .note { margin: var(--space-3) var(--space-5) 0; padding: var(--space-2) var(--space-3); background: var(--info-subtle); color: var(--info); border-radius: var(--radius-md); }
  .tbc { color: var(--warning); }
  td .input { width: 88px; height: 32px; margin-left: auto; }
  .list { list-style: none; margin: 0; padding: var(--space-2); }
  .list button { width: 100%; text-align: left; background: none; border: 0; border-left: 3px solid transparent; border-radius: var(--radius-md); padding: var(--space-2) var(--space-3); display: flex; flex-direction: column; gap: 2px; cursor: pointer; color: var(--text); font: inherit; }
  .list button:hover { background: var(--surface-sunken); }
  .list button.on { background: var(--primary-subtle); border-left-color: var(--accent); }
  tr.off { opacity: .55; }
  .acts { display: flex; gap: 2px; justify-content: flex-end; }
  .room { margin: 0 0 var(--space-3); }
  .check { display: flex; align-items: center; gap: 6px; align-self: end; }
</style>
