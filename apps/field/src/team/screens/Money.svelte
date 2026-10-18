<script lang="ts">
  // Money: what is owed to transporters per trip, what was paid, and what waits for a director.
  import { untrack } from 'svelte';
  import { finance, type User } from '@btw/api';
  import Search from '@lucide/svelte/icons/search';
  import Wallet from '@lucide/svelte/icons/wallet';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import CompanyDot from '../../components/CompanyDot.svelte';
  import { co } from '../company.svelte';
  import { Res, onRefresh } from '../load.svelte';
  import { pendingOf, transporter } from '../money';
  import { truckReg } from '../shipment';
  import { usd } from '../fmt';
  import Chips from '../components/Chips.svelte';
  import Meter from '../components/Meter.svelte';
  import Skeleton from '../components/Skeleton.svelte';
  import Empty from '../components/Empty.svelte';
  import ErrorNote from '../components/ErrorNote.svelte';
  import type { View } from '../routes';
  let { query }: { user: User; view: View; query: URLSearchParams } = $props();
  const r = new Res(() => finance.trips());
  $effect(() => r.live());
  $effect(() => onRefresh(() => r.reload()));

  let f = $state(untrack(() => (query.get('f') === 'pending' ? 'pending' : 'owed'))), q = $state('');
  const all = $derived((r.data ?? []).filter((t) => t.transport > 0 || t.payments.length));
  const owed = $derived(all.reduce((a, t) => a + Math.max(0, t.balance), 0));
  const paid = $derived(all.reduce((a, t) => a + t.paid, 0));
  const pending = $derived(all.flatMap(pendingOf));
  const chips = $derived([
    { id: 'owed', label: 'Owed', count: all.filter((t) => t.balance > 0.5).length },
    { id: 'pending', label: 'Waiting approval', count: all.filter((t) => pendingOf(t).length).length },
    { id: 'settled', label: 'Settled', count: all.filter((t) => t.balance <= 0.5).length },
    { id: 'all', label: 'All', count: all.length },
  ]);
  const list = $derived(all.filter((t) => (f === 'owed' ? t.balance > 0.5 : f === 'pending' ? pendingOf(t).length > 0 : f === 'settled' ? t.balance <= 0.5 : true))
    .filter((t) => !q.trim() || `${t.shipment.ref} ${truckReg(t.shipment.legs[0])} ${transporter(t.shipment)}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => b.balance - a.balance));
</script>

<ErrorNote error={r.error} onretry={() => r.reload()} />
{#if r.loading}
  <Skeleton kind="kpis" rows={2} /><Skeleton rows={6} />
{:else}
  <section class="t-card glance">
    <span class="t-meta">Transport owed</span>
    <strong>{usd(owed)}</strong>
    <Meter value={paid} max={paid + owed} label="Paid of agreed transport" />
    <span class="t-meta">{usd(paid)} paid{pending.length ? ` · ${pending.length} payment${pending.length === 1 ? '' : 's'} waiting for a director` : ''}</span>
  </section>
  <label class="t-search"><Search size={20} /><input type="search" placeholder="Search trip, truck or transporter" bind:value={q} aria-label="Search trips" /></label>
  <Chips options={chips} bind:value={f} label="Payment state" />
  {#if list.length}
    <div class="t-list">
      {#each list as t (t.shipment.id)}
        <a class="t-item" href="#/money/{t.shipment.id}">
          <span class="t-icon"><Wallet size={20} /></span>
          <span class="t-main">
            <span class="t-line1">{#if co.active === null}<CompanyDot entityId={t.shipment.entityId} />{/if}<span class="t-ellipsis">{truckReg(t.shipment.legs[0]) || t.shipment.ref}</span>{#if pendingOf(t).length}<span class="wait">waiting</span>{/if}</span>
            <span class="t-meta t-ellipsis">{transporter(t.shipment)} · {t.shipment.ref}</span>
            <span class="t-meta">{usd(t.paid)} paid of {usd(t.transport)}</span>
          </span>
          <span class="t-amount" class:zero={t.balance <= 0.5}>{t.balance > 0.5 ? usd(t.balance) : 'Paid'}</span>
          <ChevronRight class="t-chev" size={20} />
        </a>
      {/each}
    </div>
  {:else}
    <Empty title="Nothing here" text={q ? 'Nothing matches your search.' : f === 'owed' ? 'Every transporter is paid.' : 'No trips in this list.'} />
  {/if}
{/if}

<style>
  .glance { display: flex; flex-direction: column; gap: 6px; }
  .glance strong { font: 800 30px/36px var(--ff-display); font-variant-numeric: tabular-nums; }
  .wait { font: 700 12px var(--ff-body); color: var(--warning); background: var(--warning-subtle); border-radius: 10px; padding: 2px 8px; flex: none; }
  .zero { color: var(--success); }
</style>
