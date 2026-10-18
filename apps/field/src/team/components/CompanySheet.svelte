<script lang="ts">
  // Switch company: BTW · NUD · Kivu, plus "Group · all companies" for directors (read-only overview).
  import type { User } from '@btw/api';
  import Sheet from '../../components/Sheet.svelte';
  import Check from '@lucide/svelte/icons/check';
  import { co, companiesFor, groupMark, setCompany } from '../company.svelte';
  let { user, onclose }: { user: User; onclose: () => void } = $props();
  const list = $derived(companiesFor(user));
  function pick(id: string | null) { setCompany(id); onclose(); }
</script>

<Sheet modal title="Work in" {onclose}>
  <div class="list" role="radiogroup" aria-label="Company">
    {#if user.canGroup}
      <button class="opt" role="radio" aria-checked={co.active === null} onclick={() => pick(null)}>
        {#if groupMark}<img src={groupMark} alt="" />{:else}<span class="mono">G</span>{/if}
        <span class="grow"><strong>Group</strong><span class="caption">All companies · read-only overview</span></span>
        {#if co.active === null}<Check size={22} />{/if}
      </button>
    {/if}
    {#each list as c (c.id)}
      <button class="opt" role="radio" aria-checked={co.active === c.id} onclick={() => pick(c.id)} style:--acc={c.accent}>
        {#if c.mark}<img src={c.mark} alt="" />{:else}<span class="mono" style:background={c.primary}>{c.code}</span>{/if}
        <span class="grow"><strong>{c.short}</strong><span class="caption">{c.name}</span></span>
        {#if co.active === c.id}<Check size={22} />{/if}
      </button>
    {/each}
  </div>
</Sheet>

<style>
  .list { display: flex; flex-direction: column; gap: 10px; padding-bottom: 8px; }
  .opt { display: flex; align-items: center; gap: 14px; width: 100%; min-height: 68px; padding: 10px 14px; border-radius: 16px; border: 1px solid var(--border); background: var(--surface); color: var(--text); text-align: left; cursor: pointer; font: inherit; box-shadow: inset 4px 0 0 var(--acc, var(--border-strong)); }
  .opt[aria-checked='true'] { border-color: var(--text); background: var(--surface-sunken); }
  .opt:active { transform: scale(.98); }
  img, .mono { width: 44px; height: 44px; border-radius: 12px; background: #fff; object-fit: contain; padding: 3px; flex: none; border: 1px solid var(--border); }
  .mono { display: grid; place-items: center; color: #fff; font: 800 13px var(--ff-display); background: var(--primary); }
  .grow { display: flex; flex-direction: column; gap: 2px; }
  strong { font-size: 17px; }
</style>
