<script lang="ts">
  // One shipment: where it is, each leg's checkpoint timeline, problems reported, cargo, driver to call.
  import { lookup, shipments, type User } from '@btw/api';
  import { Badge, CheckpointTimeline, fmtDateTime } from '@btw/ui';
  import Phone from '@lucide/svelte/icons/phone';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import CompanyChip from '../../components/CompanyChip.svelte';
  import { cpShort, warehouseLabel } from '../../lib';
  import { Res, onRefresh } from '../load.svelte';
  import { cargo, currentLeg, etaText, truckReg } from '../shipment';
  import { num } from '../fmt';
  import Skeleton from '../components/Skeleton.svelte';
  import Empty from '../components/Empty.svelte';
  import ErrorNote from '../components/ErrorNote.svelte';
  import WebButton from '../components/WebButton.svelte';
  import type { View } from '../routes';
  let { view }: { user: User; view: View; query: URLSearchParams } = $props();
  const id = $derived((view as { id?: string }).id!);
  const r = new Res(() => shipments.get(id));
  $effect(() => r.live());
  $effect(() => onRefresh(() => r.reload()));
  const s = $derived(r.data);
  const now = $derived(s ? currentLeg(s) : null);
</script>

<ErrorNote error={r.error} onretry={() => r.reload()} />
{#if r.loading}
  <Skeleton kind="card" /><Skeleton rows={4} />
{:else if !s}
  <Empty title="Shipment not found" text="It may belong to another company. Switch company and try again." />
{:else}
  <section class="t-card hero">
    <div class="t-row between"><span class="ref">{s.ref}</span><Badge status={s.status} /></div>
    <h2 class="t-h1">{truckReg(now!) || '—'}</h2>
    <p class="t-sub">{cpShort(s.legs[0].fromId)} → {warehouseLabel(s.warehouseId)}</p>
    <div class="t-row wrap"><CompanyChip entityId={s.entityId} /><span class="t-meta">PO {lookup.poRef(s.poId)} · truck {s.truckNo}</span></div>
    {#if now}<p class="eta">{etaText(now)}</p>{/if}
  </section>

  {#each s.legs as leg (leg.id)}
    {@const d = lookup.driver(leg.driverId)}
    <section class="t-card">
      <div class="t-row between head">
        <h3>Leg {leg.seq} · {cpShort(leg.fromId)} → {cpShort(leg.toId)}</h3>
        <Badge status={leg.status} />
      </div>
      <dl class="t-kv">
        <dt>Truck</dt><dd>{truckReg(leg) || '—'}</dd>
        <dt>Driver</dt><dd>{d?.name ?? '—'}</dd>
        <dt>Cargo</dt><dd>{num(cargo(leg))} cases</dd>
        <dt>Arrival</dt><dd>{etaText(leg)}</dd>
      </dl>
      {#if d?.phone}<a class="btn btn-secondary btn-lg call" href="tel:{d.phone}"><Phone size={18} />Call {d.name.split(' ')[0]}</a>{/if}
      {#if leg.issues.length}
        <ul class="issues">
          {#each leg.issues as i (i.id)}
            <li class:fixed={!!i.fixedAt}><TriangleAlert size={18} /><span><strong>{i.reason}</strong><span class="t-meta">{i.place} · {fmtDateTime(i.at)}{i.fixedAt ? ' · fixed' : ''}</span></span></li>
          {/each}
        </ul>
      {/if}
      <h4>Checkpoints</h4>
      <CheckpointTimeline {leg} compact />
      <details>
        <summary>What's on the truck</summary>
        <ul class="lines">{#each leg.lines as l}{@const p = lookup.product(l.productId)}<li><span>{p?.brand} {p?.pack}</span><b>{num(l.loadedQty)}</b></li>{/each}</ul>
      </details>
    </section>
  {/each}
  <WebButton path="/shipments/{s.id}" label="Send on, split or correct in web app" />
{/if}

<style>
  .hero { display: flex; flex-direction: column; gap: 6px; border-top: 4px solid var(--t-accent); }
  .ref { font: 700 14px var(--ff-mono); color: var(--text-muted); }
  .wrap { flex-wrap: wrap; }
  .eta { margin: 4px 0 0; font: 700 16px var(--ff-body); }
  .head { margin-bottom: 10px; }
  h3 { font: 700 17px/22px var(--ff-display); margin: 0; }
  h4 { font: 700 13px var(--ff-display); text-transform: uppercase; letter-spacing: .06em; color: var(--text-muted); margin: 16px 0 8px; }
  .call { width: 100%; margin-top: 12px; text-decoration: none; }
  .issues { list-style: none; margin: 12px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  .issues li { display: flex; gap: 10px; padding: 10px 12px; border-radius: 12px; background: var(--danger-subtle); color: var(--danger); }
  .issues li.fixed { background: var(--surface-sunken); color: var(--text-muted); }
  .issues li span { display: flex; flex-direction: column; color: var(--text); }
  details { margin-top: 12px; border-top: 1px solid var(--border); padding-top: 10px; }
  summary { font-weight: 700; cursor: pointer; min-height: 40px; display: flex; align-items: center; }
  .lines { list-style: none; margin: 0; padding: 0; }
  .lines li { display: flex; justify-content: space-between; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--t-line); }
</style>
