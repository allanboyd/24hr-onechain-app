<script lang="ts">
  import { lookup, ref, type User } from '@btw/api';
  import { Badge, fmtDate, fmtNum, say } from '@btw/ui';
  import Plus from '@lucide/svelte/icons/plus';
  import Upload from '@lucide/svelte/icons/upload';
  let { user }: { params?: any; user: User } = $props();
  const r = ref();
  const tabs = ['Products', 'Suppliers', 'Providers & trucks', 'Drivers', 'Routes & checkpoints', 'Entities & companies'] as const;
  let tab = $state<(typeof tabs)[number]>('Products');
  let route = $state(r.routes[0].id);
  const sel = $derived(r.routes.find((x) => x.id === route)!);
  const canEdit = $derived(user.roles.some((x) => x === 'admin' || x === 'fleet' || x === 'planner'));
  const kindTone = { border: 'warning', weighbridge: 'info', warehouse: 'success', loading: 'accent', town: 'neutral' } as const;
  const add = () => say(`Add/edit form for ${tab} comes in the next iteration (MD-*).`);
  const importXls = () => say('Excel import with a dry-run validation report comes with the backend (§13, /masterdata/{kind}/import)');
  let q = $state('');
  const products = $derived(r.products.filter((p) => !q || `${p.sku} ${p.brand} ${p.pack}`.toLowerCase().includes(q.toLowerCase())));

  // Route timings — Kabonge / Tesfie review these seed values (plan §9 item 7). Edits are local to the prototype.
  const original = Object.fromEntries(r.routes.map((x) => [x.id, x.stops.map((st) => ({ ...st }))]));
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
</script>

<div class="page-head">
  <div><div class="overline crumb">Admin</div><h1>Master data</h1></div>
  {#if canEdit}<div class="row"><button class="btn btn-secondary" onclick={importXls}><Upload size={16} />Import from Excel</button><button class="btn btn-primary" onclick={add}><Plus size={16} />Add</button></div>{/if}
</div>

<div class="tabs" role="tablist">
  {#each tabs as t}<button role="tab" aria-selected={tab === t} onclick={() => (tab = t)}>{t}</button>{/each}
</div>

{#if tab === 'Products'}
  <div class="filters"><label class="field"><span>Search</span><input class="input" type="search" bind:value={q} placeholder="SKU, brand or package" /></label></div>
  <p class="caption" style="margin:0 0 var(--space-2)">SKU = brand + package (Appendix B). One product master stops naming variations between orders (§7.3 #6, Q7).</p>
  <div class="card flush table-wrap"><table class="table">
    <thead><tr><th>SKU code</th><th>Brand</th><th>Package</th><th class="num">Units / case</th><th class="num">Size (ml)</th><th>Supplier</th><th class="num">Price / case</th><th>Effective from</th></tr></thead>
    <tbody>{#each products as p}{@const pl = r.priceList.find((x) => x.productId === p.id)}
      <tr><td class="mono small">{p.sku}</td><td>{p.brand}</td><td>{p.pack}</td><td class="num">{p.unitsPerCase}</td><td class="num">{p.sizeMl}</td><td>{lookup.supplier(p.supplierId)?.code}</td><td class="num">{pl ? `${pl.currency} ${fmtNum(pl.price, 2)}` : '—'}</td><td class="small">{pl ? fmtDate(pl.from) : '—'}</td></tr>
    {/each}</tbody>
  </table></div>
{:else if tab === 'Suppliers'}
  <div class="card flush table-wrap"><table class="table">
    <thead><tr><th>Code</th><th>Export section</th><th>City</th><th>Country</th><th>Email</th><th>Loading point</th></tr></thead>
    <tbody>{#each r.suppliers as s}<tr><td><strong>{s.code}</strong></td><td>{s.name}</td><td>{s.city}</td><td>{s.country}</td><td class="small">{s.email}</td><td class="small">{lookup.checkpoint(s.checkpointId)?.name}</td></tr>{/each}</tbody>
  </table></div>
{:else if tab === 'Providers & trucks'}
  <div class="stack">
    {#each r.providers as pr}
      <section class="card flush">
        <header><div class="row"><h3>{pr.name}</h3><Badge tone={pr.regular ? 'success' : 'neutral'}>{pr.regular ? 'Regular' : 'Non-regular (market)'}</Badge></div><span class="small muted">{pr.phone}</span></header>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Truck</th><th>Trailer</th><th class="num">Capacity (cases)</th><th>Default driver</th></tr></thead>
          <tbody>{#each r.trucks.filter((t) => t.providerId === pr.id) as t}<tr><td><strong>{t.reg}</strong></td><td>{t.trailer}</td><td class="num">{fmtNum(t.capacityCases)}</td><td>{lookup.driver(t.defaultDriverId ?? '')?.name ?? '—'}</td></tr>{:else}<tr><td colspan="4" class="empty small">No trucks</td></tr>{/each}</tbody>
        </table></div>
      </section>
    {/each}
  </div>
{:else if tab === 'Drivers'}
  <div class="card flush table-wrap"><table class="table">
    <thead><tr><th>Name</th><th>Phone</th><th>Licence</th><th>Provider</th><th>Tracking channel</th></tr></thead>
    <tbody>{#each r.drivers as d}<tr><td>{d.name}</td><td class="small">{d.phone}</td><td class="mono small">{d.licence}</td><td>{lookup.provider(d.providerId)?.name}</td><td>{#if d.hasApp}<Badge tone="success">Driver app</Badge>{:else}<Badge tone="warning">SMS / office updates</Badge>{/if}</td></tr>{/each}</tbody>
  </table></div>
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
        <div class="note small">These hours are <strong>seed estimates for review</strong> by Kabonge and Tesfie. ETA = planned arrival + delay carried from the last checkpoint (TR-04). After go-live they are replaced by historical medians per lane.</div>
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
{:else}
  <div class="grid grid-2">
    <section class="card flush">
      <header><h3>Ordering entities</h3></header>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Code</th><th>Name</th><th>PO prefix</th><th>Address</th></tr></thead>
        <tbody>{#each r.entities as e}<tr><td><strong>{e.code}</strong></td><td>{e.name}</td><td class="mono small">{e.poPrefix}</td><td class="small">{e.address}</td></tr>{/each}</tbody>
      </table></div>
    </section>
    <section class="card flush">
      <header><h3>Receiving companies & warehouses</h3></header>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Company</th><th>Countries</th><th>Warehouses</th></tr></thead>
        <tbody>{#each r.receivingCompanies as c}<tr><td><strong>{c.name}</strong></td><td>{c.countries.join(', ')}</td><td class="small">{r.warehouses.filter((w) => w.receivingCompanyId === c.id).map((w) => w.name).join(', ')}</td></tr>{/each}</tbody>
      </table></div>
    </section>
  </div>
{/if}

<style>
  .layout { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: var(--space-4); align-items: start; }
  @media (max-width: 1100px) { .layout { grid-template-columns: minmax(0, 1fr); } }
  .note { margin: var(--space-3) var(--space-5) 0; padding: var(--space-2) var(--space-3); background: var(--info-subtle); color: var(--info); border-radius: var(--radius-md); }
  td .input { width: 88px; height: 32px; margin-left: auto; }
  .list { list-style: none; margin: 0; padding: var(--space-2); }
  .list button { width: 100%; text-align: left; background: none; border: 0; border-left: 3px solid transparent; border-radius: var(--radius-md); padding: var(--space-2) var(--space-3); display: flex; flex-direction: column; gap: 2px; cursor: pointer; color: var(--text); font: inherit; }
  .list button:hover { background: var(--surface-sunken); }
  .list button.on { background: var(--primary-subtle); border-left-color: var(--accent); }
</style>
