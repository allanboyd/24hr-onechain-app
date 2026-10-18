<script lang="ts">
  // Destination warehouses (doc 08 §3): the owner adds a warehouse in any country/town, pins it on the map
  // (geofence for automatic check-ins) and can deactivate it. Shown everywhere as "Country – Town".
  import { ref, type User } from '@btw/api';
  import { Badge, fmtNum, say } from '@btw/ui';
  import Plus from '@lucide/svelte/icons/plus';
  import Pencil from '@lucide/svelte/icons/pencil';
  import { listWarehouses, saveWarehouse, serverBacked, warehouseLabel, type WarehouseInput, type WarehouseRow } from '../lib/warehouses';
  import 'leaflet/dist/leaflet.css';
  let { user }: { user: User } = $props();

  const r = ref();
  const canEdit = $derived(user.roles.some((x) => x === 'admin' || x === 'director'));
  let rows = $state<WarehouseRow[]>(listWarehouses());
  let dialog = $state<HTMLDialogElement>();
  let editing = $state<string | null>(null);
  let form = $state<WarehouseInput>(blank());
  let error = $state('');
  let mapEl = $state<HTMLDivElement>();
  let L: typeof import('leaflet') | null = null;
  let map: import('leaflet').Map | null = null;
  let pin: import('leaflet').Circle | null = null;

  function blank(): WarehouseInput { return { name: '', country: '', town: '', receivingCompanyId: r.receivingCompanies[0]?.id ?? '', lat: -1.95, lng: 30.06, radiusM: 500, active: true }; }
  const companyName = (id: string) => r.receivingCompanies.find((c) => c.id === id)?.name ?? '—';

  async function open(w: WarehouseRow | null) {
    editing = w?.id ?? null; error = '';
    form = w ? { name: w.name, country: w.country, town: w.town, receivingCompanyId: w.receivingCompanyId, lat: w.lat ?? -1.95, lng: w.lng ?? 30.06, radiusM: w.radiusM ?? 500, active: w.active ?? true } : blank();
    dialog?.showModal();
    await new Promise((res) => setTimeout(res, 0));
    L ??= await import('leaflet');
    if (!map && mapEl) {
      map = L.map(mapEl, { zoomControl: true }).setView([form.lat, form.lng], w ? 11 : 5);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 18 }).addTo(map);
      map.on('click', (e: import('leaflet').LeafletMouseEvent) => { form.lat = +e.latlng.lat.toFixed(5); form.lng = +e.latlng.lng.toFixed(5); drawPin(); });
    } else map?.setView([form.lat, form.lng], w ? 11 : 5);
    map?.invalidateSize(); drawPin();
  }
  function drawPin() {
    if (!L || !map) return;
    pin?.remove();
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#FE7514';
    pin = L.circle([form.lat, form.lng], { radius: form.radiusM, color: accent, weight: 2, fillOpacity: 0.15 }).addTo(map);
  }
  async function save(e: Event) {
    e.preventDefault();
    if (!form.country.trim() || !form.town.trim()) { error = 'Enter the country and the town.'; return; }
    if (!form.name.trim()) form.name = `${companyName(form.receivingCompanyId)} ${form.town.trim()}`;
    try {
      const { local } = await saveWarehouse(editing, { ...form, country: form.country.trim(), town: form.town.trim(), name: form.name.trim() });
      rows = listWarehouses(); dialog?.close();
      say(local ? 'Saved in this session — warehouse storage on the server comes with the next API release' : `Saved: ${form.country} – ${form.town}`);
    } catch (err) { error = (err as Error).message; }
  }
</script>

<div class="row between head">
  <p class="caption">Final destinations are warehouses, e.g. Congo – Goma, Rwanda – Gisenyi, South Sudan – Juba. Add another warehouse in any country or town; it becomes a destination in plans, POs and routes.{#if !serverBacked()} <Badge tone="warning">prototype: saved in this session</Badge>{/if}</p>
  {#if canEdit}<button class="btn btn-primary" onclick={() => open(null)}><Plus size={16} />Add warehouse</button>{/if}
</div>
<div class="card flush table-wrap"><table class="table">
  <thead><tr><th>Destination</th><th>Warehouse</th><th>Receiving company</th><th class="num">Pin (lat, lng)</th><th class="num">Geofence</th><th>Status</th>{#if canEdit}<th></th>{/if}</tr></thead>
  <tbody>{#each rows as w (w.id)}
    <tr class:off={w.active === false}><td><strong>{warehouseLabel(w)}</strong></td><td>{w.name}</td><td>{companyName(w.receivingCompanyId)}</td>
      <td class="num small">{w.lat != null ? `${w.lat.toFixed(4)}, ${w.lng?.toFixed(4)}` : '—'}</td><td class="num">{w.radiusM ? `${fmtNum(w.radiusM)} m` : '—'}</td>
      <td>{#if w.active === false}<Badge tone="neutral">Inactive</Badge>{:else}<Badge tone="success">Active</Badge>{/if}</td>
      {#if canEdit}<td><button class="btn btn-ghost btn-sm" onclick={() => open(w)} aria-label="Edit {warehouseLabel(w)}"><Pencil size={14} />Edit</button></td>{/if}</tr>
  {/each}</tbody>
</table></div>

<dialog class="sheet wide" bind:this={dialog}>
  <form class="body stack" onsubmit={save}>
    <h3>{editing ? 'Edit warehouse' : 'Add warehouse'}</h3>
    <div class="form-grid">
      <label class="field"><span>Country</span><input class="input" bind:value={form.country} placeholder="e.g. Congo" list="wh-countries" /></label>
      <label class="field"><span>Town / city</span><input class="input" bind:value={form.town} placeholder="e.g. Bukavu" /></label>
      <label class="field"><span>Warehouse name</span><input class="input" bind:value={form.name} placeholder="e.g. Asie Bukavu" /></label>
      <label class="field"><span>Receiving company</span><select class="select" bind:value={form.receivingCompanyId}>{#each r.receivingCompanies as c}<option value={c.id}>{c.name}</option>{/each}</select></label>
      <label class="field"><span>Geofence radius (m)</span><input class="input num" type="number" min="100" step="50" bind:value={form.radiusM} oninput={drawPin} /></label>
      <label class="field check"><input type="checkbox" bind:checked={form.active} /><span>Active (offered as a destination)</span></label>
    </div>
    <datalist id="wh-countries">{#each [...new Set(rows.map((w) => w.country).filter(Boolean))] as c}<option value={c}></option>{/each}</datalist>
    <div class="caption">Click the map to place the warehouse. The circle is the area where trucks check in automatically.</div>
    <div class="map" bind:this={mapEl}></div>
    <div class="caption num">Pin: {form.lat.toFixed(5)}, {form.lng.toFixed(5)}</div>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <div class="row" style="justify-content:flex-end"><button type="button" class="btn btn-ghost" onclick={() => dialog?.close()}>Cancel</button><button class="btn btn-primary">Save warehouse</button></div>
  </form>
</dialog>

<style>
  .head { margin-bottom: var(--space-3); align-items: flex-start; }
  .head p { max-width: 80ch; margin: 0; }
  tr.off td { color: var(--text-subtle); }
  dialog.wide { width: min(720px, calc(100vw - 32px)); }
  .map { height: 300px; border-radius: var(--radius-md); border: 1px solid var(--border); }
  .check { flex-direction: row; align-items: center; gap: var(--space-2); align-self: end; }
</style>
