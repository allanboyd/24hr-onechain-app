# 09 — Period plans as suggestions, configurable PO approval, PO revisions at loading

Client rules of 18 Oct 2026. They replace parts of [07](07-amendments-plan.md) §A (period-plan approval), §B (PO-07 reasons, director approval) and extend loading (LD-*).

## 1. Period plans are suggestions and stand alone
- **No approval.** Period plans have no submit / approve / return / reject / amend steps any more. Planners, directors and admins save them directly. The endpoints `POST /period-plans/:id/submit`, `/decision` and `/amendments` are gone.
- **Statuses:** `Active` or `Replaced`. Migration `0007_plans_po_revisions` sets every existing plan that is not Replaced to Active.
- **Edit history:** each save bumps `version`, adds a `created` / `edited` / `replaced` entry to `history`, and keeps a snapshot in `period_plan_versions` (`GET /period-plans/:id/versions`).
- **No overlaps.** For each company, the `[from, to]` of an Active plan never overlaps another Active plan. Creating a plan, copying one, or changing its dates onto a covered period returns **409** `code: "overlap"`, with `conflicts: [{ id, ref, from, to, title }]`. The title reads "BTW-PP-2026-0001 already covers 2026-08-01 – 2026-10-31. Replace it?".
  - Sending the same request with **`replace: true`** overwrites instead of duplicating. The overlapped plans become `Replaced`, with `replacedById` set. They stay viewable but are hidden from the default list (`GET /period-plans?all=1` shows them). A Replaced plan cannot be edited.
  - The web shows the conflict as a Replace / Cancel dialog.
- **Plans gate nothing.** A PO can be created and issued with or without a covering plan. The over-plan and unplanned marks (PO-06/07) are informational only, and the note is optional. Reports use **Active** plans: planned vs actual, and the plan context on a PO.

## 2. PO approval comes from `apps/api/config.toml`
The API reads `apps/api/config.toml` at startup. You can point it at another file with the env var `CONFIG_FILE`. If the file is missing, the defaults below apply.

```toml
[approvals]
purchase_orders = false     # true = a director must approve (and sign) a PO before it is issued

[loading]
allowance_pct = 10          # how far a truck's loaded total may differ from the PO (± %) before the office must step in
allow_alternatives = true   # the loader may load substitute products (same supplier) when an item is missing
revision_suffix = "-rev"    # PO-001 → PO-001-rev001, -rev002, …
```

Clients receive these settings in `GET /v1/ref` as:

```ts
config: { approvals: { purchaseOrders: boolean }, loading: { allowancePct: number, allowAlternatives: boolean, revisionSuffix: string } }
```

The type is `AppConfig` in `packages/api/src/types.ts`, with defaults in `rules.defaultConfig`. The mock client uses the same defaults; `demo.setConfig()` or localStorage `btw-config` override them for demos and tests.

- **`purchase_orders = false` (default):** the planner's **"Issue purchase order"** (`POST /plans/:id/submit`) creates the PO at once. It runs the same code path as approval: the PO, one loading per truck, and the "New trucks to load" notification. The issuer is stored as `approvedById` / `approvedAt`, the PO has `approval: 'issued'`, and the order shows **Issued**.
  - A Submitted order shows **Ready to issue** and can be issued.
  - The director decision endpoint returns 409. Dashboards show no "awaiting approval" counts.
  - The PO letter says **"ISSUED <date> by <name>"** instead of the APPROVED stamp.
- **`purchase_orders = true`:** today's director approval flow, unchanged (`approval: 'director'`).
- **Who may create or issue:** planner, director and admin (`rules.PO_EDITORS`).

## 3. Loading uses the PO, with an allowance and automatic revisions
- **Hand-over form.** The loader's hand-over (field `LoadingPoint`, web Loading → Record loading) is prefilled from the PO truck lines. The loader can change each line's quantity.
  - When `allow_alternatives` is on, the loader can also add **alternatives** from the same supplier's price list. An alternative can say which PO line it replaces.
  - The API input is `ConfirmLoadingInput.alternatives?: { productId, qty, replacesPlanLineId? }[]`.
- **Allowance.** The truck's loaded total (alternatives included) may differ from its ordered total by at most ±`allowance_pct`, and may never exceed the truck's capacity.
  - Beyond that, the API refuses with "Over the 10% loading allowance — ask the planner to change the PO …" (or "Below …").
  - The UIs show a live allowance meter built on the same `rules.loadingCheck`.
- **Automatic PO revision.** Any difference from the PO (a quantity, a missing item, an alternative) creates a **PO revision** in the same transaction. Revisions are auto-issued whatever `purchase_orders` says.
  - The revision is a new `PurchaseOrder`, plus a backing order copy so the letter and PDF code keep working.
  - Its ref is `<original PO ref><revision_suffix><NNN>`, for example `BTW-PO-2026-0002-rev001`. The next deviation on any truck of that order gives `-rev002`, always numbered from the **original** ref.
  - Each revision is cloned from the **latest** revision, so it reflects everything loaded so far: this truck as loaded (missing lines dropped, alternatives added on the same route and destination), other trucks unchanged.
  - Stored on the PO:
    - `revisionOf` (the original PO id) and `revision` (n)
    - `changes[]`: `{ truckNo, productId, ordered, loaded, kind: 'qty' | 'missing' | 'alternative', replacesPlanLineId? }`
    - `revisionReason`
    - `createdBy: 'system'` and `onBehalfOfId` (the loader)
    - `approval: 'revision'`
  - The previous PO, and its order copy, get `supersededById`. They stay viewable and are not listed as separate orders.
- **Follow-through.** Every loading and shipment of the order (loaded or still pending) is re-pointed to the latest revision.
  - Shipments, acknowledgement expected quantities (taken from the loaded legs), in-transit stock, finance (goods priced from the latest revision, alternatives included) and planned vs actual "ordered" all use the effective revision.
  - `rules.ORDER_COUNTS` and the report scoping ignore superseded orders and POs, so nothing is counted twice.
  - The original is reached through `revisionOf`. `GET /pos/:id` returns `revisions` (the whole chain, original first).
- **Notification** to planners and directors: "PO BTW-PO-2026-0002 revised → BTW-PO-2026-0002-rev001 at loading (Tusker −200, Tusker Lite +200)".
- **What each screen shows:**
  - Pending loadings carry `nextRevisionRef`, so the loader sees "This will create BTW-PO-…-rev001" before sliding.
  - The POs list groups revisions under the original PO, with a "rev001" badge.
  - The PO view has a "Revised at loading" panel with links along the chain.
  - A revision's letter or PDF says "Revision 1 of BTW-PO-…" and lists the changes.

## Data and migration
Migration `apps/api/drizzle/0007_plans_po_revisions.sql` adds these columns:
- `period_plans.replaced_by_id`
- `plans.revision_of`, `plans.revision`, `plans.superseded_by_id`
- `pos.approval` (default `'director'`), `pos.revision_of`, `pos.revision`, `pos.changes`, `pos.revision_reason`, `pos.created_by`, `pos.on_behalf_of_id`, `pos.superseded_by_id`, plus index `pos_revision_idx`

It also sets existing period plans to Active. The seed has no overlapping plans per company: BTW's next quarter starts the day after the current one ends.

## Tests
- `packages/api/test/plans.test.ts`: pure rules and the mock flows.
- `apps/api/test/qa/revisions.ts`: QA suite `revisions`, run with the default config.
- `apps/api/test/qa/rules.ts`: run with `test/qa/config-approvals.toml`, where approval is on, the allowance is ±5 % and alternatives are off.
- `apps/api/test/api.e2e.ts`.
