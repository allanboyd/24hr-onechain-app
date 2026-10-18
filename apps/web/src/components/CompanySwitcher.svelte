<script lang="ts">
  // Company switcher (top bar). Only shown when the user can see more than one company; directors/admins
  // also get "Group · all companies". Keyboard: a native <select> under a branded face, so it works everywhere.
  import type { User } from '@btw/api';
  import { companyBrand, allCompanies, companyLabel } from '../lib/companies';
  import { company, GROUP, allowedIds, canGroup, setCompany } from '../lib/company.svelte';
  import CompanyMark from './CompanyMark.svelte';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  let { user }: { user: User } = $props();

  const ids = $derived(allowedIds(user));
  const options = $derived(allCompanies().filter((c) => ids.includes(c.id)));
  const group = $derived(canGroup(user));
  const show = $derived(options.length > 1 || group);
  const current = $derived(company.active === GROUP ? null : companyBrand(company.active));
</script>

{#if show}
  <label class="switch" title="Switch company">
    <span class="sr">Company</span>
    <CompanyMark entityId={current?.id ?? null} size={26} />
    <span class="txt"><span class="caption">Working in</span><strong>{current ? current.shortName : 'Group'}<span class="long">{current ? '' : ' · all companies'}</span></strong></span>
    <ChevronDown size={16} />
    <select value={company.active} onchange={(e) => setCompany(user, (e.currentTarget as HTMLSelectElement).value)} aria-label="Company">
      {#if group}<option value={GROUP}>Group · all companies</option>{/if}
      {#each options as c (c.id)}<option value={c.id}>{c.name} ({companyLabel(c.id)})</option>{/each}
    </select>
  </label>
{:else if current}
  <span class="fixed"><CompanyMark entityId={current.id} size={24} /><strong class="small">{current.shortName}</strong></span>
{/if}

<style>
  .switch { position: relative; display: inline-flex; align-items: center; gap: var(--space-2); padding: 4px var(--space-3) 4px 6px; border: 1px solid var(--border-strong); border-radius: var(--radius-md); background: var(--surface); cursor: pointer; min-width: 0; border-left: 4px solid var(--company-accent, var(--accent)); }
  .switch:focus-within { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
  .txt { display: flex; flex-direction: column; line-height: 1.15; min-width: 0; }
  .txt strong { font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 22ch; }
  .txt .caption { font-size: 11px; }
  select { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; font-size: 16px; }
  .fixed { display: inline-flex; align-items: center; gap: var(--space-2); padding: 4px var(--space-3) 4px 6px; border-left: 4px solid var(--company-accent, var(--accent)); }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  @media (max-width: 560px) { .txt .caption, .long { display: none; } .txt strong { max-width: 14ch; } }
</style>
