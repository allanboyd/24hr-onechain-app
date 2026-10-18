<script lang="ts">
  // Wraps a write action (create / edit / approve). In a company scope it shows a small cue
  // "Recording for NUD" next to the action; in Group scope (read-only) it replaces the action with
  // "Choose a company to record this" and an inline company picker (docs/05 research: group is read-only).
  import type { Snippet } from 'svelte';
  import { session } from '../lib/session.svelte';
  import { company, GROUP, allowedIds, setCompany } from '../lib/company.svelte';
  import { allCompanies, companyLabel } from '../lib/companies';
  import CompanyMark from './CompanyMark.svelte';
  let { children, what = 'this', cue = true, inline = false, entityId }: { children: Snippet; what?: string; cue?: boolean; inline?: boolean; /** the record's own company: in Group scope offer one switch button */ entityId?: string } = $props();
  const user = $derived(session.user);
  const options = $derived(user ? allCompanies().filter((c) => allowedIds(user).includes(c.id)) : []);
  const group = $derived(company.active === GROUP);
</script>

{#if group && entityId}
  <button type="button" class="btn btn-secondary btn-sm switchto" onclick={() => user && setCompany(user, entityId)} title="Group view is read-only">
    <CompanyMark {entityId} size={16} />Switch to {companyLabel(entityId)} to act</button>
{:else if group}
  <span class="pick" class:inline role="group" aria-label="Choose a company to record {what}">
    <span class="small">Choose a company to record {what}:</span>
    {#each options as c (c.id)}
      <button type="button" class="btn btn-secondary btn-sm" onclick={() => user && setCompany(user, c.id)}><CompanyMark entityId={c.id} size={18} />{companyLabel(c.id)}</button>
    {/each}
  </span>
{:else}
  <span class="wrap" class:inline>
    {@render children()}
    {#if cue && options.length > 1}<span class="cue caption" title="Records are saved in this company"><CompanyMark entityId={company.active} size={16} />for {companyLabel(company.active)}</span>{/if}
  </span>
{/if}

<style>
  .wrap, .pick { display: inline-flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
  .pick { padding: var(--space-1) var(--space-2); border: 1px dashed var(--border-strong); border-radius: var(--radius-md); background: var(--surface-sunken); }
  .pick .btn { gap: 6px; }
  .switchto { gap: 6px; white-space: nowrap; }
  .cue { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
</style>
