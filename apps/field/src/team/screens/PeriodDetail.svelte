<script lang="ts">
  // Period plan (read-only on the phone): each brand's planned cases against what has been ordered so far.
  import { lookup, periodPlans, plans, type Plan, type User } from '@btw/api';
  import { Badge, fmtDate } from '@btw/ui';
  import CompanyChip from '../../components/CompanyChip.svelte';
  import { Res, onRefresh, settle } from '../load.svelte';
  import { orderedByLine, plannedCases, sumMap, supplierName } from '../plan';
  import { num } from '../fmt';
  import { warehouseLabel } from '../../lib';
  import Meter from '../components/Meter.svelte';
  import Skeleton from '../components/Skeleton.svelte';
  import Empty from '../components/Empty.svelte';
  import ErrorNote from '../components/ErrorNote.svelte';
  import WebButton from '../components/WebButton.svelte';
  import type { View } from '../routes';
  let { view }: { user: User; view: View; query: URLSearchParams } = $props();
  const id = $derived((view as { id?: string }).id!);
  const r = new Res(async () => { const [pp, orders] = await Promise.all([periodPlans.get(id), settle(plans.list(), [] as Plan[])]); return { pp, orders }; });
  $effect(() => r.live());
  $effect(() => onRefresh(() => r.reload()));
  const pp = $derived(r.data?.pp);
  const ordered = $derived(pp ? orderedByLine(pp, r.data!.orders) : new Map<string, number>());
  const groups = $derived(pp ? [...new Set(pp.lines.map((l) => l.supplierId))].map((sid) => ({ sid, lines: pp.lines.filter((l) => l.supplierId === sid) })) : []);
</script>

<ErrorNote error={r.error} onretry={() => r.reload()} />
{#if r.loading}
  <Skeleton kind="card" /><Skeleton rows={4} />
{:else if !pp}
  <Empty title="Plan not found" text="It may belong to another company. Switch company and try again." />
{:else}
  {@const planned = plannedCases(pp)}
  {@const done = sumMap(ordered)}
  <section class="t-card hero">
    <div class="t-row between"><span class="ref">{pp.ref}</span><Badge status={pp.status} /></div>
    <h2 class="t-h1">{pp.title || 'Period plan'}</h2>
    <p class="t-sub">{fmtDate(pp.from)} – {fmtDate(pp.to)}</p>
    <CompanyChip entityId={pp.entityId} />
    <div class="big"><span><b>{num(done)}</b> of {num(planned)} cases ordered</span></div>
    <Meter value={done} max={planned} label="Ordered of planned" />
  </section>

  {#each groups as g (g.sid)}
    <h3 class="t-title">{supplierName(g.sid)}</h3>
    <section class="t-card lines">
      {#each g.lines as l (l.id)}
        {@const p = lookup.product(l.productId)}
        {@const o = ordered.get(l.id) ?? 0}
        <div class="line">
          <div class="t-row between"><span><b>{p?.brand ?? l.productId}</b> <span class="t-meta">{p?.pack}</span></span><span class="t-meta">{num(o)} / {num(l.cases)}</span></div>
          <span class="t-meta">to {warehouseLabel(l.destinationId)}</span>
          <Meter value={o} max={l.cases} label="{p?.brand} ordered of planned" />
        </div>
      {/each}
    </section>
  {/each}
  <WebButton path="/period-plans/{pp.id}" label="Edit in web app" />
{/if}

<style>
  .hero { display: flex; flex-direction: column; gap: 8px; border-top: 4px solid var(--t-accent); }
  .ref { font: 700 14px var(--ff-mono); color: var(--text-muted); }
  .big { margin-top: 6px; font-size: 16px; }
  .big b { font: 800 22px var(--ff-display); }
  .lines { display: flex; flex-direction: column; gap: 0; padding: 4px 16px; }
  .line { display: flex; flex-direction: column; gap: 4px; padding: 12px 0; border-bottom: 1px solid var(--t-line); }
  .line:last-child { border-bottom: 0; }
</style>
