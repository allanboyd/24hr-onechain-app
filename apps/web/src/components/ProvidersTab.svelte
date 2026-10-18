<script lang="ts">
  // Transport onboarding (docs/10): providers — transport companies, saccos, individual owners, market trucks — and
  // their trucks. Truck planners, fleet, planners, directors and admins add / edit / deactivate; everyone else reads.
  import { lookup, masterdata, onChange, ref, type Provider, type ProviderInput, type Truck, type TruckInput, type User } from '@btw/api';
  import { PROVIDER_KINDS, validateProvider, validateTruck } from '@btw/api/rules';
  import { Badge, fmtNum, say } from '@btw/ui';
  import Plus from '@lucide/svelte/icons/plus';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Power from '@lucide/svelte/icons/power';
  import Search from '@lucide/svelte/icons/search';
  import { can } from '../lib/features';
  import { describe } from '../lib/errors';
  let { user }: { user: User } = $props();

  let v = $state(0);
  $effect(() => onChange(() => v++));
  const r = $derived.by(() => { void v; return ref(); });
  const canEdit = $derived(can(user, 'master-data.transport'));
  const kindLabel = (k?: string) => PROVIDER_KINDS.find((x) => x.kind === k)?.label ?? 'Transport company';
  const kindTone = { company: 'info', sacco: 'accent', individual: 'neutral', market: 'warning' } as const;

  let q = $state(''); let kind = $state(''); let showInactive = $state(false);
  const providers = $derived(r.providers.filter((p) => (showInactive || p.active !== false) && (!kind || (p.kind ?? (p.regular ? 'company' : 'market')) === kind)
    && (!q.trim() || `${p.name} ${p.contactName ?? ''} ${p.phone} ${r.trucks.filter((t) => t.providerId === p.id).map((t) => `${t.reg} ${t.trailer}`).join(' ')}`.toLowerCase().includes(q.trim().toLowerCase()))));
  const fleetOf = (pid: string) => r.trucks.filter((t) => t.providerId === pid && (showInactive || t.active !== false)).sort((a, b) => (a.fleetNo ?? 999) - (b.fleetNo ?? 999) || a.reg.localeCompare(b.reg));
  const driverOf = (t: Truck) => (t.defaultDriverId ? lookup.driver(t.defaultDriverId) : undefined);
  const inactiveCount = $derived(r.providers.filter((p) => p.active === false).length + r.trucks.filter((t) => t.active === false).length);

  // ---- provider form ----
  let pDlg = $state<HTMLDialogElement>();
  let pId = $state<string | null>(null);
  let pf = $state<ProviderInput>({ name: '', kind: 'company', regular: true, phone: '', contactName: '', email: '', notes: '', active: true });
  let pErr = $state<string[]>([]);
  let busy = $state(false);
  function openProvider(p: Provider | null) {
    pId = p?.id ?? null; pErr = [];
    pf = p ? { name: p.name, kind: p.kind ?? (p.regular ? 'company' : 'market'), regular: p.regular, phone: p.phone, contactName: p.contactName ?? '', email: p.email ?? '', notes: p.notes ?? '', active: p.active !== false }
      : { name: '', kind: 'company', regular: true, phone: '', contactName: '', email: '', notes: '', active: true };
    pDlg?.showModal();
  }
  async function saveProvider(e: Event) {
    e.preventDefault();
    pErr = validateProvider(pf, r.providers, pId);
    if (pErr.length) return;
    busy = true;
    try { const x = await masterdata.saveProvider(pId, $state.snapshot(pf)); pDlg?.close(); say(pId ? `${x.name} saved` : `${x.name} added — now add its trucks`); }
    catch (err) { pErr = [describe(err).message]; } finally { busy = false; }
  }
  async function toggleProvider(p: Provider) {
    const off = p.active !== false;
    if (off && !window.confirm(`Deactivate ${p.name}? Its trucks can no longer be queued; history is kept.`)) return;
    try { await masterdata.saveProvider(p.id, { active: !off }); say(`${p.name} ${off ? 'deactivated' : 'reactivated'}`); } catch (err) { say(describe(err).message); }
  }

  // ---- truck form ----
  let tDlg = $state<HTMLDialogElement>();
  let tId = $state<string | null>(null);
  let tf = $state<TruckInput>({ providerId: '', reg: '', trailer: '', capacityCases: 2000, defaultDriverId: null, active: true, note: null, documents: [] });
  let tErr = $state<string[]>([]);
  function openTruck(t: Truck | null, providerId?: string) {
    tId = t?.id ?? null; tErr = [];
    tf = t ? { providerId: t.providerId, reg: t.reg, trailer: t.trailer, capacityCases: t.capacityCases, defaultDriverId: t.defaultDriverId ?? null, active: t.active !== false, note: t.note ?? null, documents: [...(t.documents ?? [])] }
      : { providerId: providerId ?? r.providers.find((p) => p.active !== false)?.id ?? '', reg: '', trailer: '', capacityCases: 2000, defaultDriverId: null, active: true, note: null, documents: [] };
    tDlg?.showModal();
  }
  const providerDrivers = $derived(r.drivers.filter((d) => d.providerId === tf.providerId && d.active !== false));
  const otherDrivers = $derived(r.drivers.filter((d) => d.providerId !== tf.providerId && d.active !== false));
  function addDocs(e: Event) {
    const files = [...((e.currentTarget as HTMLInputElement).files ?? [])];
    tf.documents = [...(tf.documents ?? []), ...files.map((f) => ({ id: '', kind: 'photo' as const, name: f.name }))];
    (e.currentTarget as HTMLInputElement).value = '';
  }
  async function saveTruck(e: Event) {
    e.preventDefault();
    const input = { ...$state.snapshot(tf), capacityCases: Number(tf.capacityCases), defaultDriverId: tf.defaultDriverId || null };
    tErr = validateTruck(input, { providers: r.providers, trucks: r.trucks, drivers: r.drivers }, tId);
    if (tErr.length) return;
    busy = true;
    try { const x = await masterdata.saveTruck(tId, input); tDlg?.close(); say(tId ? `${x.reg} saved` : `${x.reg} added to ${lookup.provider(x.providerId)?.name}`); }
    catch (err) { tErr = [describe(err).message]; } finally { busy = false; }
  }
  async function toggleTruck(t: Truck) {
    const off = t.active !== false;
    if (off && !window.confirm(`Deactivate ${t.reg}? It will not be offered for loading queues; its trips are kept.`)) return;
    try { await masterdata.saveTruck(t.id, { active: !off }); say(`${t.reg} ${off ? 'deactivated' : 'reactivated'}`); } catch (err) { say(describe(err).message); }
  }
</script>

<div class="toolbar">
  <label class="t-search"><Search size={16} /><input class="input" type="search" bind:value={q} placeholder="Provider, contact or truck" aria-label="Search providers and trucks" /></label>
  <label class="field inline"><span class="sr-only">Kind</span><select class="select" bind:value={kind} aria-label="Kind of provider"><option value="">All kinds</option>{#each PROVIDER_KINDS as k}<option value={k.kind}>{k.label}</option>{/each}</select></label>
  {#if inactiveCount}<label class="small chk"><input type="checkbox" bind:checked={showInactive} />Show deactivated ({inactiveCount})</label>{/if}
  <span class="grow"></span>
  {#if canEdit}<button class="btn btn-secondary" onclick={() => openTruck(null)}><Plus size={16} />Add truck</button><button class="btn btn-primary" onclick={() => openProvider(null)}><Plus size={16} />Add provider</button>{/if}
</div>

<div class="stack">
  {#each providers as pr (pr.id)}
    {@const fleet = fleetOf(pr.id)}
    <section class="card flush" class:off={pr.active === false}>
      <header>
        <div class="stack-xs">
          <div class="row"><h3>{pr.name}</h3><Badge tone={kindTone[pr.kind ?? 'company']}>{kindLabel(pr.kind)}</Badge><Badge tone={pr.regular ? 'success' : 'neutral'}>{pr.regular ? 'Regular' : 'Non-regular'}</Badge>{#if pr.active === false}<Badge tone="danger">Deactivated</Badge>{/if}<span class="caption">{fleet.length} truck{fleet.length === 1 ? '' : 's'}</span></div>
          <div class="small muted">{[pr.contactName, pr.phone, pr.email].filter(Boolean).join(' · ') || 'No contact details yet'}</div>
          {#if pr.notes}<div class="caption">{pr.notes}</div>{/if}
        </div>
        {#if canEdit}<div class="row acts">
          <button class="btn btn-ghost btn-sm" onclick={() => openTruck(null, pr.id)} disabled={pr.active === false}><Plus size={14} />Truck</button>
          <button class="btn btn-ghost btn-sm" onclick={() => openProvider(pr)} aria-label="Edit {pr.name}"><Pencil size={14} />Edit</button>
          <button class="btn btn-ghost btn-sm" onclick={() => toggleProvider(pr)} aria-label="{pr.active === false ? 'Reactivate' : 'Deactivate'} {pr.name}"><Power size={14} />{pr.active === false ? 'Reactivate' : 'Deactivate'}</button>
        </div>{/if}
      </header>
      <div class="table-wrap"><table class="table">
        <thead><tr><th class="num">#</th><th>Prime</th><th>Trailer</th><th>Driver</th><th>Phone</th><th>Tracking</th><th class="num">Capacity (cases)</th><th>Papers</th>{#if canEdit}<th><span class="sr-only">Actions</span></th>{/if}</tr></thead>
        <tbody>{#each fleet as t, i (t.id)}{@const d = driverOf(t)}
          <tr class:off={t.active === false}><td class="num">{t.fleetNo ?? i + 1}</td><td><strong>{t.reg}</strong>{#if t.active === false} <Badge tone="danger">off</Badge>{/if}</td><td>{t.trailer || '—'}</td>
            <td>{#if d}{d.name}{:else}<Badge tone="warning">no driver — to confirm</Badge>{/if}</td>
            <td class="small">{#if d}{d.localPhone ?? d.phone}{#if d.phoneNote}<div class="caption tbc">{d.phoneNote}</div>{/if}{:else}—{/if}</td>
            <td>{#if d}{#if d.hasApp}<Badge tone="success">Driver app</Badge>{:else}<Badge tone="neutral">no app — SMS</Badge>{/if}{:else}—{/if}</td>
            <td class="num">{fmtNum(t.capacityCases)}{#if t.note}<div class="caption tbc">{t.note}</div>{/if}</td>
            <td class="small">{t.documents?.length ? t.documents.map((x) => x.name).join(', ') : '—'}</td>
            {#if canEdit}<td><div class="acts"><button class="btn btn-ghost btn-sm" onclick={() => openTruck(t)} aria-label="Edit {t.reg}"><Pencil size={14} /></button><button class="btn btn-ghost btn-sm" onclick={() => toggleTruck(t)} aria-label="{t.active === false ? 'Reactivate' : 'Deactivate'} {t.reg}" title={t.active === false ? 'Reactivate' : 'Deactivate'}><Power size={14} /></button></div></td>{/if}</tr>
        {:else}<tr><td colspan={canEdit ? 9 : 8} class="empty small">No trucks yet{#if canEdit && pr.active !== false} — <button class="btn btn-ghost btn-sm" onclick={() => openTruck(null, pr.id)}>add the first truck</button>{/if}</td></tr>{/each}</tbody>
      </table></div>
    </section>
  {:else}<div class="card empty">No provider matches.</div>{/each}
</div>

<dialog class="sheet" bind:this={pDlg} aria-labelledby="pr-title">
  <form class="body stack" onsubmit={saveProvider}>
    <div><h3 id="pr-title">{pId ? 'Edit provider' : 'Add transport provider'}</h3><div class="caption">Transport companies, saccos, individual owners or market trucks hired on the spot.</div></div>
    <div class="form-grid">
      <label class="field"><span>Name</span><input class="input" bind:value={pf.name} required maxlength="120" placeholder="e.g. Umoja Truckers Sacco" /></label>
      <label class="field"><span>Kind</span><select class="select" bind:value={pf.kind} onchange={() => { if (pf.kind === 'market') pf.regular = false; }}>{#each PROVIDER_KINDS as k}<option value={k.kind}>{k.label}</option>{/each}</select></label>
      <label class="field"><span>Contact person</span><input class="input" bind:value={pf.contactName} /></label>
      <label class="field"><span>Phone</span><input class="input" type="tel" bind:value={pf.phone} placeholder="+254 7xx xxx xxx" /></label>
      <label class="field"><span>Email</span><input class="input" type="email" bind:value={pf.email} /></label>
      <label class="field chkfield"><span>Arrangement</span><label class="small chk"><input type="checkbox" bind:checked={pf.regular} />Regular transporter (not a one-off market hire)</label></label>
    </div>
    <label class="field"><span>Notes</span><textarea class="input" rows="3" bind:value={pf.notes} maxlength="2000" placeholder="Rates agreed, payment terms, who allocates the trucks …"></textarea></label>
    {#if pId}<label class="small chk"><input type="checkbox" bind:checked={pf.active} />Active (deactivated providers are kept for history)</label>{/if}
    {#if pErr.length}<ul class="errs" role="alert">{#each pErr as x}<li>{x}</li>{/each}</ul>{/if}
    <div class="row" style="justify-content:flex-end"><button type="button" class="btn btn-ghost" onclick={() => pDlg?.close()}>Cancel</button><button class="btn btn-primary" disabled={busy}>{pId ? 'Save' : 'Add provider'}</button></div>
  </form>
</dialog>

<dialog class="sheet" bind:this={tDlg} aria-labelledby="tr-title">
  <form class="body stack" onsubmit={saveTruck}>
    <div><h3 id="tr-title">{tId ? `Edit ${tf.reg}` : 'Add truck'}</h3><div class="caption">Registration is unique; capacity in cases is used to check loadings.</div></div>
    <div class="form-grid">
      <label class="field"><span>Provider</span><select class="select" bind:value={tf.providerId}>{#each r.providers.filter((p) => p.active !== false || p.id === tf.providerId) as p}<option value={p.id}>{p.name}</option>{/each}</select></label>
      <label class="field"><span>Capacity (cases)</span><input class="input num" type="number" min="1" max="10000" step="1" bind:value={tf.capacityCases} /></label>
      <label class="field"><span>Truck (prime) registration</span><input class="input" bind:value={tf.reg} required placeholder="KDC 123X" /></label>
      <label class="field"><span>Trailer</span><input class="input" bind:value={tf.trailer} placeholder="ZF 0000" /></label>
      <label class="field"><span>Default driver</span><select class="select" bind:value={tf.defaultDriverId}>
        <option value={null}>— none yet</option>
        {#if providerDrivers.length}<optgroup label="This provider">{#each providerDrivers as d}<option value={d.id}>{d.name} · {d.phone}</option>{/each}</optgroup>{/if}
        <optgroup label="Other drivers">{#each otherDrivers as d}<option value={d.id}>{d.name} · {d.phone}</option>{/each}</optgroup>
      </select><span class="help">Add new drivers in the Drivers tab.</span></label>
      <label class="field"><span>Note (optional)</span><input class="input" value={tf.note ?? ''} oninput={(e) => (tf.note = (e.currentTarget as HTMLInputElement).value || null)} placeholder="e.g. capacity to confirm" /></label>
    </div>
    <div class="stack-xs">
      <span class="label">Papers (optional) — insurance, inspection, transit licence …</span>
      {#if tf.documents?.length}<div class="row wrap">{#each tf.documents as d, i}<span class="doc small">{d.name}<button type="button" class="btn btn-ghost btn-sm" aria-label="Remove {d.name}" onclick={() => tf.documents!.splice(i, 1)}>×</button></span>{/each}</div>{/if}
      <input class="input" type="file" multiple accept="image/*,application/pdf" onchange={addDocs} aria-label="Attach truck papers" />
    </div>
    {#if tId}<label class="small chk"><input type="checkbox" bind:checked={tf.active} />Active (deactivated trucks are not offered for queues)</label>{/if}
    {#if tErr.length}<ul class="errs" role="alert">{#each tErr as x}<li>{x}</li>{/each}</ul>{/if}
    <div class="row" style="justify-content:flex-end"><button type="button" class="btn btn-ghost" onclick={() => tDlg?.close()}>Cancel</button><button class="btn btn-primary" disabled={busy}>{tId ? 'Save' : 'Add truck'}</button></div>
  </form>
</dialog>

<style>
  .toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-3); margin-bottom: var(--space-4); }
  .toolbar .grow { flex: 1; }
  .t-search { display: inline-flex; align-items: center; gap: var(--space-2); color: var(--text-muted); }
  .t-search .input { width: min(280px, 60vw); }
  .chk { display: inline-flex; align-items: center; gap: var(--space-2); }
  .chkfield .chk { min-height: 40px; }
  .acts { display: flex; gap: 2px; justify-content: flex-end; flex-wrap: wrap; }
  header { align-items: flex-start; }
  section.off, tr.off { opacity: 0.6; }
  .tbc { color: var(--warning); }
  .errs { margin: 0; padding: var(--space-2) var(--space-3) var(--space-2) var(--space-6); background: var(--danger-subtle); color: var(--danger); border-radius: var(--radius-md); font-weight: 600; }
  .doc { display: inline-flex; align-items: center; gap: 2px; padding: 0 0 0 var(--space-2); border: 1px solid var(--border); border-radius: var(--radius-md); }
  .wrap { flex-wrap: wrap; }
  .stack-xs { display: flex; flex-direction: column; gap: 4px; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  .field.inline { margin: 0; }
</style>
