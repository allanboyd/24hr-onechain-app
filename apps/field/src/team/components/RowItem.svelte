<script lang="ts">
  // One list row of a home or a drill-down list: title, one or two short lines, status chip, amount, chevron → detail.
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import CompanyDot from '../../components/CompanyDot.svelte';
  import { co } from '../company.svelte';
  import StatusChip from './StatusChip.svelte';
  import GapBar from './GapBar.svelte';
  import type { GRow } from '../glance';
  let { r }: { r: GRow } = $props();
</script>
<a class="t-item ri" href="#{r.href}">
  <span class="t-main">
    <span class="t-line1">{#if co.active === null && r.entityId}<CompanyDot entityId={r.entityId} />{/if}<span class="t-ellipsis">{r.title}</span></span>
    {#if r.meta}<span class="t-meta clamp">{r.meta}</span>{/if}
    {#if r.meta2}<span class="t-meta t-ellipsis">{r.meta2}</span>{/if}
    {#if r.gap}<GapBar gap={r.gap} compact />{/if}
  </span>
  <span class="side">
    {#if r.amount}<span class="t-amount">{r.amount}</span>{/if}
    {#if r.chip}<StatusChip tone={r.chip.tone} label={r.chip.label} />{/if}
  </span>
  <ChevronRight class="t-chev" size={20} />
</a>
<style>
  .ri { min-height: 64px; align-items: center; }
  .side { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; flex: none; max-width: 44%; }
  .clamp { overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; }
</style>
