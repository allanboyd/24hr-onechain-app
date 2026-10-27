<script lang="ts">
  // Home · Loading: queues and waiting time, trucks loaded per day, ordered vs loaded (was the Loading Overview tab).
  import { ref, type User } from '@btw/api';
  import { seesLoadingPoint } from '@btw/api/rules';
  import LoadingOverview from '../../../components/overview/LoadingOverview.svelte';
  let { user }: { user: User } = $props();
  // the loading points this person works (same rule as the API and the Truck desk queues)
  const points = $derived(ref().suppliers.filter((s) => (user.roles.some((x) => x === 'director' || x === 'admin') || seesLoadingPoint(user, s.id))
    && (!user.roles.includes('planner') || !user.pairs?.length || user.pairs.some((p) => p.supplierId === s.id))));
</script>
<LoadingOverview {points} />
