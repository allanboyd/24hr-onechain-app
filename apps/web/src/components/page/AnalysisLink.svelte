<script lang="ts">
  // "See the analysis → Home · Fleet" — work pages carry no charts; their analysis lives on one Home tab (docs/17 §3).
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import { DASH_GROUPS } from '@btw/api/dashboards';
  let { group, label }: {
    /** Home tab key (DashGroup: business · purchasing · loading · fleet · fees · deliveries · warehouse · sales · admin) */ group: string;
    /** tab name override (defaults to the Home tab's short name) */ label?: string;
  } = $props();
  const SHORT: Record<string, string> = { business: 'Business', fees: 'Fees & expenses', admin: 'Alerts & admin' };
  const name = $derived(label ?? SHORT[group] ?? DASH_GROUPS.find((g) => g.key === group)?.label ?? group);
</script>
<a class="al" href="#/dashboards/{group}">See the analysis <ArrowRight size={14} aria-hidden="true" /> <span class="where">Home · {name}</span></a>
<style>
  .al { display: inline-flex; align-items: center; gap: 4px; font: 600 var(--fs-body-sm) / var(--lh-body-sm) var(--ff-body); color: var(--link); text-decoration: none; white-space: nowrap; }
  .al:hover .where { text-decoration: underline; }
  .al:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; border-radius: var(--radius-sm); }
  .where { color: var(--link); }
</style>
