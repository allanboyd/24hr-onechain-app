<script lang="ts">
  // Company column for list tables — rendered only in Group scope (company scopes show one company).
  import CompanyMark from './CompanyMark.svelte';
  import { company, GROUP } from '../lib/company.svelte';
  import { companyLabel } from '../lib/companies';
  let { entityId, head = false }: { entityId?: string | null; head?: boolean } = $props();
</script>
{#if company.active === GROUP}
  {#if head}<th>Company</th>{:else}<td><span class="cc"><CompanyMark entityId={entityId ?? null} size={18} />{entityId ? companyLabel(entityId) : '—'}</span></td>{/if}
{/if}
<style>.cc { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; font-size: 13px; }</style>
