<script lang="ts">
  import { plans, ref, type User } from '@btw/api';
  import { router } from '@btw/ui';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import RecordFor from '../components/RecordFor.svelte';
  import CompanyMark from '../components/CompanyMark.svelte';
  import { company, GROUP } from '../lib/company.svelte';
  import { companyBrand } from '../lib/companies';
  let { user }: { user: User } = $props();
  const r = ref();
  // The ordering company (letterhead) is the active company; Group view is read-only.
  const entityId = $derived(company.active === GROUP ? '' : company.active);
  const co = $derived(entityId ? companyBrand(entityId) : null);
  let supplierId = $state('s-kbl');
  let busy = $state(false);
  const supplier = $derived(r.suppliers.find((s) => s.id === supplierId)!);
  const lanes = $derived(r.routes.filter((rt) => rt.stops[0].checkpointId === supplier.checkpointId));
  const canCreate = $derived(user.roles.includes('planner'));
  async function create(e: Event) {
    e.preventDefault(); busy = true;
    const p = await plans.create(entityId, supplierId);
    router.go(`/plans/${p.id}`);
  }
</script>
<div class="page-head"><div><div class="overline crumb"><a href="#/plans">PO drafts</a></div><h1>New purchase order</h1></div></div>
<div class="grid wrap">
  <form class="card stack" onsubmit={create}>
    <p class="muted">Step 1 of 2 — who is ordering and from which supplier export section. You add trucks and lines next.</p>
    <div class="form-grid">
      <div class="field"><span>Ordering company (letterhead)</span>
        {#if co}<div class="co"><CompanyMark entityId={entityId} size={32} /><div><strong>{co.name}</strong><div class="caption">The PO is issued on {co.shortName}'s letterhead. Switch company in the top bar to order for another company.</div></div></div>
        {:else}<RecordFor what="a purchase order"><span></span></RecordFor>{/if}</div>
      <label class="field"><span>Addressed to (supplier export section)</span>
        <select class="select" bind:value={supplierId}>{#each r.suppliers as s}<option value={s.id}>{s.code} — {s.city}, {s.country}</option>{/each}</select></label>
    </div>
    <p class="caption">The reference number (e.g. <span class="mono">{r.entities.find((e) => e.id === entityId)?.poPrefix}-2026-00NN</span>) is generated per entity and year when the draft is created (PO-02).</p>
    {#if !canCreate}<p class="error">Only planners can create plans.</p>{/if}
    <div class="row"><button class="btn btn-primary" disabled={busy || !canCreate || !entityId}>Create draft <ArrowRight size={16} /></button><a class="btn btn-ghost" href="#/plans">Cancel</a></div>
  </form>
  <aside class="card stack-sm">
    <div class="overline">Lanes from {supplier.code} {supplier.city}</div>
    {#each lanes as rt}
      <div class="row between small"><span>{rt.name}</span><span class="caption">{rt.distanceKm.toLocaleString()} km · ~{Math.round(rt.stops.at(-1)!.plannedHours / 24 * 10) / 10} days</span></div>
    {:else}<p class="small muted">No routes start here yet — add one in Master data.</p>{/each}
    <p class="caption">Each line picks one of these lanes; the receiving company (Asie / Zonas) follows the destination (§17.2).</p>
  </aside>
</div>
<style>
  .co { display: flex; gap: var(--space-3); align-items: center; padding: var(--space-2) var(--space-3); border: 1px solid var(--border); border-left: 4px solid var(--company-accent, var(--accent)); border-radius: var(--radius-md); background: var(--surface); }
  .wrap { grid-template-columns: minmax(0, 640px) minmax(0, 360px); align-items: start; }
  @media (max-width: 1100px) { .wrap { grid-template-columns: minmax(0, 1fr); } }
</style>
