<script lang="ts">
  // "Plan or check a period" (docs/17 §4: moved here from the retired Reports page). Plan a future period (demand → gap
  // after what is already planned → trucks per lane) or check a past one (what was not captured). Old links
  // #/reports?r=period&mode=check&wh=… redirect here (lib/redirects.ts).
  import type { User } from '@btw/api';
  import { untrack } from 'svelte';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import { PageHeader, readQuery, writeQuery } from '../components/page';
  import PeriodTab from '../components/reports/PeriodTab.svelte';
  import { can } from '../lib/features';
  let { user }: { user: User } = $props();
  // the capture check reads every record of the period: Reports feature (directors, admin, accounts …)
  const canCheck = $derived(can(user, 'reports'));
  let mode = $state<'plan' | 'check'>(untrack(() => (readQuery('mode') === 'check' && can(user, 'reports') ? 'check' : 'plan')));
  $effect(() => { writeQuery({ mode: mode === 'check' ? 'check' : null }); });
</script>

<PageHeader overline="Procurement · Period plans" title="Plan or check a period" description="What a coming period needs, or whether a past one was captured completely."
  info="Plan: expected demand per brand and warehouse, minus stock, trucks on the road and what period plans and purchase orders already cover, turned into trucks per lane. Check: deliveries, sales, costs and documents of a past period that look incomplete.">
  {#snippet secondary()}<a class="btn btn-secondary" href="#/period-plans"><ArrowLeft size={16} aria-hidden="true" />Period plans</a>{/snippet}
</PageHeader>
<PeriodTab bind:mode wh={readQuery('wh')} {canCheck} />
