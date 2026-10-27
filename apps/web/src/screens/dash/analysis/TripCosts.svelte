<script lang="ts">
  // Home · Fees & expenses: trip expenses by month, payments awaiting approval (was the Trip financials Overview tab).
  import { finance } from '@btw/api';
  import FinanceOverview from '../../../components/overview/FinanceOverview.svelte';
  type Trip = Awaited<ReturnType<typeof finance.trips>>[number];
  let trips = $state<Trip[] | null>(null);
  $effect(() => { finance.trips().then((t) => (trips = t)).catch(() => (trips = [])); });
</script>
{#if trips}<FinanceOverview {trips} />{:else}<div class="skeleton" style="height:240px"></div>{/if}
