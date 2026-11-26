<script lang="ts">
  // Sales: this month at a glance, the list by payment status, and a quick "New sale" for sales staff.
  import { sales, type User } from '@btw/api';
  import { Badge } from '@btw/ui';
  import Search from '@lucide/svelte/icons/search';
  import Plus from '@lucide/svelte/icons/plus';
  import ShoppingCart from '@lucide/svelte/icons/shopping-cart';
  import CompanyDot from '../../components/CompanyDot.svelte';
  import { can } from '../access';
  import { co } from '../company.svelte';
  import { Res, onRefresh } from '../load.svelte';
  import { dayLabel, num, usd } from '../fmt';
  import { warehouseLabel } from '../../lib';
  import Chips from '../components/Chips.svelte';
  import MiniBars from '../components/MiniBars.svelte';
  import NewSale from '../components/NewSale.svelte';
  import RecordPayment from '../components/RecordPayment.svelte';
  import type { Sale } from '@btw/api';
  import Skeleton from '../components/Skeleton.svelte';
  import Empty from '../components/Empty.svelte';
  import ErrorNote from '../components/ErrorNote.svelte';
  import type { View } from '../routes';
  let { user }: { user: User; view: View; query: URLSearchParams } = $props();
  const r = new Res(() => sales.list());
  $effect(() => r.live());
  $effect(() => onRefresh(() => r.reload()));
  const total = (s: { lines: { qty: number; price: number }[] }) => s.lines.reduce((a, l) => a + l.qty * l.price, 0);

  let f = $state('all'), q = $state(''), creating = $state(false);
  // V3-12 step 2: tap a sale that still owes money to record what the client paid
  let paying = $state<Sale | null>(null);
  const owes = (s: Sale) => s.status !== 'Paid' && total(s) - s.paid > 0.005;
  const mayPay = $derived(can(user, 'sales'));
  const all = $derived(r.data ?? []);
  const month = new Date().toISOString().slice(0, 7);
  const thisMonth = $derived(all.filter((s) => s.at.slice(0, 7) === month));
  const owed = $derived(all.reduce((a, s) => a + Math.max(0, total(s) - s.paid), 0));
  const days = $derived(Array.from({ length: 14 }, (_, i) => { const d = new Date(Date.now() - (13 - i) * 864e5).toISOString().slice(0, 10); return all.filter((s) => s.at.slice(0, 10) === d).reduce((a, s) => a + total(s), 0); }));
  const chips = $derived([{ id: 'all', label: 'All', count: all.length }, ...(['Unpaid', 'Part-paid', 'Paid'] as const).map((s) => ({ id: s, label: s, count: all.filter((x) => x.status === s).length }))]);
  const list = $derived(all.filter((s) => (f === 'all' || s.status === f) && (!q.trim() || `${s.ref} ${s.customer}`.toLowerCase().includes(q.trim().toLowerCase()))).slice(0, 100));
  const mayCreate = $derived(can(user, 'sales') && co.active !== null);
</script>

<ErrorNote error={r.error} onretry={() => r.reload()} />
{#if r.loading}
  <Skeleton kind="kpis" rows={2} /><Skeleton rows={6} />
{:else}
  <section class="t-card glance">
    <div class="t-row between"><span class="t-meta">Sales this month</span><span class="t-meta">Owed by customers</span></div>
    <div class="t-row between"><strong>{usd(thisMonth.reduce((a, s) => a + total(s), 0))}</strong><strong class="owed">{usd(owed)}</strong></div>
    <MiniBars values={days} height={44} label="Sales per day, last two weeks" />
    <span class="t-meta">{num(thisMonth.length)} sales this month · last 14 days</span>
  </section>
  <label class="t-search"><Search size={20} /><input type="search" placeholder="Search customer or ref" bind:value={q} aria-label="Search sales" /></label>
  <Chips options={chips} bind:value={f} label="Payment status" />
  {#if list.length}
    <div class="t-list">
      {#each list as s (s.id)}
        <svelte:element this={mayPay && owes(s) ? 'button' : 'div'} class="t-item" class:tap={mayPay && owes(s)} onclick={mayPay && owes(s) ? () => (paying = s) : undefined} aria-label={mayPay && owes(s) ? `Record payment from ${s.customer}, ${s.ref}` : undefined} role={mayPay && owes(s) ? undefined : 'group'}>
          <span class="t-icon"><ShoppingCart size={20} /></span>
          <span class="t-main">
            <span class="t-line1">{#if co.active === null}<CompanyDot entityId={s.entityId} />{/if}<span class="t-ellipsis">{s.customer}</span></span>
            <span class="t-meta t-ellipsis">{s.ref} · {warehouseLabel(s.warehouseId)}</span>
            <span class="t-meta">{dayLabel(s.at)} · {s.kind} · {num(s.lines.reduce((a, l) => a + l.qty, 0))} cases</span>
          </span>
          <span class="right"><span class="t-amount">{usd(total(s))}</span><Badge status={s.status} />{#if mayPay && owes(s)}<span class="t-meta owes">owes {usd(total(s) - s.paid)}</span>{/if}</span>
        </svelte:element>
      {/each}
    </div>
  {:else}
    <Empty title="No sales" text={q ? 'Nothing matches your search.' : 'Sales will show here.'} />
  {/if}
{/if}

{#if mayCreate}
  <button class="t-fab" onclick={() => (creating = true)}><Plus size={22} />New sale</button>
{/if}
{#if paying}<RecordPayment sale={paying} onclose={() => (paying = null)} ondone={() => { paying = null; r.reload(); }} />{/if}
{#if creating}<NewSale {user} onclose={() => (creating = false)} ondone={() => { creating = false; r.reload(); }} />{/if}

<style>
  .glance { display: flex; flex-direction: column; gap: 6px; }
  .glance strong { font: 800 26px/32px var(--ff-display); font-variant-numeric: tabular-nums; }
  .glance .owed { color: var(--warning); }
  .right { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; flex: none; }
  .t-item { cursor: default; }
  button.t-item { cursor: pointer; width: 100%; text-align: left; font: inherit; color: inherit; border: 0; }
  .owes { color: var(--warning); }
</style>
