<script lang="ts" module>
  export type StaticKind = 'entity' | 'supplier' | 'product' | 'receiving-company';
</script>
<script lang="ts">
  // docs/12 A-05: add / edit / deactivate companies, suppliers, goods and receiving companies (Kabonge, directors).
  // Live validation with the same rules the API and the mock run (packages/api rules validate*); every save is in the audit log.
  import { masterdata, ref, type Entity, type Product, type ReceivingCompany, type Supplier } from '@btw/api';
  import { CURRENCIES, MASTER_LIMITS, PRODUCT_CATEGORIES, validateEntity, validateProduct, validateReceivingCompany, validateSupplier } from '@btw/api/static-data';
  import { say } from '@btw/ui';
  import { describe } from '../lib/errors';

  let dlg = $state<HTMLDialogElement>();
  let kind = $state<StaticKind>('entity');
  let id = $state<string | null>(null);
  let busy = $state(false);
  let serverErr = $state('');
  let touched = $state(false);
  // one flat form for every kind (only the fields of `kind` are used)
  let f = $state({ code: '', name: '', shortName: '', poPrefix: '', email: '', tagline: '', reportingCurrency: 'USD', address: '', phones: '',
    city: '', country: '', lat: '' as number | '', lng: '' as number | '',
    sku: '', brand: '', pack: '', unitsPerCase: 24 as number | '', sizeMl: 330 as number | '', supplierId: '', category: '', price: '' as number | '',
    countries: '', active: true });

  const TITLE: Record<StaticKind, string> = { entity: 'company', supplier: 'supplier', product: 'goods item', 'receiving-company': 'receiving company' };
  const lines = (s: string) => s.split(/\n|,/).map((x) => x.trim()).filter(Boolean);
  const num = (v: number | '') => (v === '' || v === null || v === undefined ? undefined : Number(v));

  function input() {
    if (kind === 'entity') return { code: f.code, name: f.name, shortName: f.shortName, poPrefix: f.poPrefix || undefined, email: f.email, tagline: f.tagline, reportingCurrency: f.reportingCurrency as Entity['reportingCurrency'], address: lines(f.address), phones: lines(f.phones), active: f.active };
    if (kind === 'supplier') return { code: f.code, name: f.name, city: f.city, country: f.country, email: f.email, lat: num(f.lat), lng: num(f.lng), active: f.active };
    if (kind === 'product') return { sku: f.sku, brand: f.brand, pack: f.pack, unitsPerCase: num(f.unitsPerCase), sizeMl: num(f.sizeMl), supplierId: f.supplierId, category: f.category || null, ...(num(f.price) !== undefined ? { price: num(f.price) } : {}), active: f.active };
    return { name: f.name, countries: lines(f.countries), active: f.active };
  }
  const errors = $derived.by(() => {
    const r = ref(); const v = input() as never;
    if (kind === 'entity') return validateEntity(v, r.entities, id);
    if (kind === 'supplier') return validateSupplier(v, r.suppliers, id);
    if (kind === 'product') return validateProduct(v, { products: r.products, supplierIds: r.suppliers.map((s) => s.id) }, id);
    return validateReceivingCompany(v, r.receivingCompanies, id);
  });

  export function open(k: StaticKind, rec: Entity | Supplier | Product | ReceivingCompany | null) {
    kind = k; id = rec?.id ?? null; serverErr = ''; touched = false;
    const r = ref();
    const base = { code: '', name: '', shortName: '', poPrefix: '', email: '', tagline: '', reportingCurrency: 'USD', address: '', phones: '', city: '', country: '', lat: '' as number | '', lng: '' as number | '',
      sku: '', brand: '', pack: '', unitsPerCase: 24 as number | '', sizeMl: 330 as number | '', supplierId: r.suppliers[0]?.id ?? '', category: '', price: '' as number | '', countries: '', active: true };
    if (rec && k === 'entity') { const e = rec as Entity; f = { ...base, code: e.code, name: e.name, shortName: e.shortName, poPrefix: e.poPrefix, email: e.email, tagline: e.tagline, reportingCurrency: e.reportingCurrency, address: e.address.join('\n'), phones: e.phones.join(', '), active: e.active !== false }; }
    else if (rec && k === 'supplier') { const s = rec as Supplier; const cp = r.checkpoints.find((c) => c.id === s.checkpointId); f = { ...base, code: s.code, name: s.name, city: s.city, country: s.country, email: s.email, lat: cp?.lat ?? '', lng: cp?.lng ?? '', active: s.active !== false }; }
    else if (rec && k === 'product') { const p = rec as Product; f = { ...base, sku: p.sku, brand: p.brand, pack: p.pack, unitsPerCase: p.unitsPerCase, sizeMl: p.sizeMl, supplierId: p.supplierId, category: p.category ?? '', price: r.priceList.find((x) => x.productId === p.id)?.price ?? '', active: p.active !== false }; }
    else if (rec) { const c = rec as ReceivingCompany; f = { ...base, name: c.name, countries: c.countries.join(', '), active: c.active !== false }; }
    else f = base;
    dlg?.showModal();
  }
  async function save(e: Event) {
    e.preventDefault(); touched = true;
    if (errors.length) return;
    busy = true; serverErr = '';
    try {
      const v = $state.snapshot(input()) as never;
      const x = kind === 'entity' ? await masterdata.saveEntity(id, v) : kind === 'supplier' ? await masterdata.saveSupplier(id, v) : kind === 'product' ? await masterdata.saveProduct(id, v) : await masterdata.saveReceivingCompany(id, v);
      dlg?.close(); say(`${'name' in x ? x.name : (x as Product).brand} ${id ? 'saved' : 'added'} — change kept in the audit log`);
    } catch (err) { serverErr = describe(err).message; } finally { busy = false; }
  }
  const room = $derived(kind === 'entity' ? `${ref().entities.length} of ${MASTER_LIMITS.entities} companies` : kind === 'supplier' ? `${ref().suppliers.length} of ${MASTER_LIMITS.suppliers} suppliers` : '');
</script>

<dialog class="sheet wide" bind:this={dlg} aria-label="{id ? 'Edit' : 'Add'} {TITLE[kind]}">
  <form class="body stack" onsubmit={save} novalidate>
    <div class="row between"><h3>{id ? 'Edit' : 'Add'} {TITLE[kind]}</h3>{#if room && !id}<span class="caption">{room}</span>{/if}</div>
    <div class="form-grid">
      {#if kind === 'entity'}
        <label class="field"><span>Code</span><input class="input mono" bind:value={f.code} placeholder="BTW" /></label>
        <label class="field"><span>Display name</span><input class="input" bind:value={f.shortName} placeholder="BTW" /></label>
        <label class="field full"><span>Legal name</span><input class="input" bind:value={f.name} /></label>
        <label class="field"><span>PO prefix</span><input class="input mono" bind:value={f.poPrefix} placeholder="{f.code || 'BTW'}-PO" /></label>
        <label class="field"><span>Reporting currency</span><select class="select" bind:value={f.reportingCurrency}>{#each CURRENCIES as c}<option>{c}</option>{/each}</select></label>
        <label class="field"><span>Email</span><input class="input" type="email" bind:value={f.email} /></label>
        <label class="field"><span>Phones (comma separated)</span><input class="input" bind:value={f.phones} /></label>
        <label class="field full"><span>Address (one line each)</span><textarea class="input" rows="2" bind:value={f.address}></textarea></label>
        <label class="field full"><span>Tagline</span><input class="input" bind:value={f.tagline} /></label>
      {:else if kind === 'supplier'}
        <label class="field"><span>Code</span><input class="input mono" bind:value={f.code} placeholder="KBL" /></label>
        <label class="field"><span>Export section name</span><input class="input" bind:value={f.name} /></label>
        <label class="field"><span>City (loading point)</span><input class="input" bind:value={f.city} /></label>
        <label class="field"><span>Country</span><input class="input" bind:value={f.country} /></label>
        <label class="field"><span>Email (PO letters go here)</span><input class="input" type="email" bind:value={f.email} /></label>
        <label class="field"><span>Loading point latitude</span><input class="input num" type="number" step="0.0001" bind:value={f.lat} /></label>
        <label class="field"><span>Loading point longitude</span><input class="input num" type="number" step="0.0001" bind:value={f.lng} /></label>
      {:else if kind === 'product'}
        <label class="field"><span>SKU</span><input class="input mono" bind:value={f.sku} placeholder="KBL-132" /></label>
        <label class="field"><span>Supplier</span><select class="select" bind:value={f.supplierId}>{#each ref().suppliers as s}<option value={s.id}>{s.code} · {s.city}</option>{/each}</select></label>
        <label class="field"><span>Brand</span><input class="input" bind:value={f.brand} /></label>
        <label class="field"><span>Pack</span><input class="input" bind:value={f.pack} placeholder="24 x 330 ml cans" /></label>
        <label class="field"><span>Units per case</span><input class="input num" type="number" min="1" bind:value={f.unitsPerCase} /></label>
        <label class="field"><span>Size (ml)</span><input class="input num" type="number" min="1" bind:value={f.sizeMl} /></label>
        <label class="field"><span>Category</span><select class="select" bind:value={f.category}><option value="">—</option>{#each PRODUCT_CATEGORIES as c}<option>{c}</option>{/each}</select></label>
        <label class="field"><span>Purchase price per case (USD, optional)</span><input class="input num" type="number" min="0" step="0.01" bind:value={f.price} /></label>
      {:else}
        <label class="field full"><span>Company name</span><input class="input" bind:value={f.name} placeholder="Asie Company" /></label>
        <label class="field full"><span>Countries (comma separated)</span><input class="input" bind:value={f.countries} placeholder="Rwanda, DR Congo" /></label>
      {/if}
      <label class="check full"><input type="checkbox" bind:checked={f.active} /> Active <span class="caption">(deactivated records stay in history and are no longer offered)</span></label>
    </div>
    {#if (touched || id) && errors.length}<ul class="errs" role="alert">{#each errors as e}<li>{e}</li>{/each}</ul>{/if}
    {#if serverErr}<p class="error" role="alert">{serverErr}</p>{/if}
    <div class="row end"><button type="button" class="btn btn-ghost" onclick={() => dlg?.close()}>Cancel</button><button class="btn btn-primary" disabled={busy}>{id ? 'Save changes' : 'Add'}</button></div>
  </form>
</dialog>

<style>
  .full { grid-column: 1 / -1; }
  .check { display: flex; align-items: center; gap: 6px; }
  .errs { margin: 0; padding-left: 18px; color: var(--danger); font-size: 14px; }
  .end { justify-content: flex-end; }
</style>
