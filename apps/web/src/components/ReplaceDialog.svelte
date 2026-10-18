<script lang="ts">
  // "BTW-PP-2026-0001 already covers 2026-08-01 – 2026-10-31. Replace it?" — period plans never overlap per company.
  import type { PlanConflict } from '../lib/planning';
  let dialog = $state<HTMLDialogElement>();
  let conflicts = $state<PlanConflict[]>([]);
  let resolve: ((v: boolean) => void) | null = null;
  /** Open the dialog; resolves true for Replace, false for Cancel. */
  export function ask(c: PlanConflict[]): Promise<boolean> {
    conflicts = c; dialog?.showModal();
    return new Promise((r) => (resolve = r));
  }
  function done(v: boolean) { dialog?.close(); resolve?.(v); resolve = null; }
</script>

<dialog bind:this={dialog} class="sheet" onclose={() => done(false)} aria-labelledby="replace-title">
  <h3 id="replace-title">This period is already planned</h3>
  {#each conflicts as c (c.id)}
    <p><a class="mono" href="#/period-plans/{c.id}">{c.ref}</a> already covers {c.from} – {c.to}{c.title ? ` (${c.title})` : ''}.</p>
  {/each}
  <p><strong>Replace {conflicts.length === 1 ? 'it' : 'them'}?</strong> <span class="muted small">The replaced plan is kept for history but no longer counts.</span></p>
  <div class="row" style="justify-content:flex-end"><button class="btn btn-ghost" onclick={() => done(false)}>Cancel</button><button class="btn btn-primary" onclick={() => done(true)}>Replace</button></div>
</dialog>
