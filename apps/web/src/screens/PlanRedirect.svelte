<script lang="ts">
  // docs/09 §4: purchase orders are no longer drafted — the old "PO drafts" links (#/plans, #/plans/new, #/plans/:id) keep
  // working from bookmarks and notifications: they land on the Purchase orders list, the create form, or the order's PO.
  import { plans, pos } from '@btw/api';
  let { params }: { params?: { id?: string } } = $props();
  const replace = (to: string) => { history.replaceState(null, "", `#${to}`); dispatchEvent(new HashChangeEvent("hashchange")); };
  $effect(() => {
    const path = location.hash.replace(/^#/, '').split('?')[0];
    if (path === '/plans/new') return replace('/pos/new');
    if (!params?.id) return replace('/pos');
    (async () => {
      const plan = await plans.get(params.id!).catch(() => null);
      if (plan?.poId) {
        // the PO in force: a revision repoints the chain, so open the PO and let it show the latest version
        const d = await pos.get(plan.poId).catch(() => null);
        return replace(`/pos/${d?.effectiveId ?? plan.poId}`);
      }
      replace('/pos');
    })();
  });
</script>
<div class="skeleton" style="height:40px;width:40%" aria-label="Opening the purchase order"></div>
