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

- **`purchase_orders = false` (default):** *Create purchase order* (`POST /pos`) issues the PO at once — "Approved automatically · <name> · <date>" on the letter and in the audit log (`approval: 'issued'`, `approvedById` = the creator). Its loadings and the "New trucks to load" notification follow immediately. The director decision endpoint returns 409; dashboards show no "awaiting approval" stage.
- **`purchase_orders = true`:** the created PO is **Awaiting approval** (`status`), nothing is loaded or sent; a director approves (signature) or rejects (comment → the PO is soft-deleted) with `POST /pos/:id/decision`. There is no separate draft object.
- Turning the switch off approves every PO still awaiting approval automatically at API start-up ("Approved automatically · system").
- **Who may create, update or delete:** planner (his buyer–supplier pairs), director and admin (`rules.PO_EDITORS`). See §4 — POs are never drafted (this replaces the "Issue purchase order" / "Ready to issue" flow of 18 Oct).

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

## 4. Purchase orders are created, updated or deleted — never drafted (26 Oct 2026)
One **Purchase orders** area in the web sidebar (`#/pos`: list, create `#/pos/new`, view `#/pos/:id`, update `#/pos/:id/edit`). The old `#/plans`, `#/plans/new` and `#/plans/:id` links (bookmarks, notifications) redirect to the list, the create form and the order's PO. The team PWA has no Drafts / PO approvals (payment approvals for directors stay; PO approvals only when the switch is on); its PO detail shows the versions and links to the web editor.

**Create.** Supplier (the planner's pairs), company (active company), title, dates, currency, instruction, trucks with lines (product, cases, route, delivered-to). Prices come from the price list (directors may override). The ref `<prefix>-<year>-00NN` is given on create; refs are never reused (deleted POs keep theirs). Result: Issued, or Awaiting approval (§2).

**Update = a revision, never an overwrite.** `PUT /pos/:id` with the full lines and a **required reason** saves the next revision `<original ref>-rev00N`. One counter per order for office updates and revisions at loading (§3): e.g. rev001 updated by the office, rev002 revised at loading, rev003 updated again. The new revision supersedes the previous one; loadings and shipments are re-pointed to it and pending loadings take its quantities (new trucks get a loading, removed pending trucks lose theirs). Reports, planned vs actual, stock in transit, finance and acknowledgements use the effective (latest) revision only — the existing no-double-counting rule.
- Lines already loaded can't go below the cases loaded, can't be removed and can't change product / truck / route / destination; no line can be added to a loaded truck. Once every truck is loaded the PO can no longer be updated (409).
- The letter of a revision reads "Revision N of <ref> — updated <date> (<reason>)" and lists the changes; the web offers *Email revised PO to supplier* (the revision starts *Not sent*).

**Versions.** Every version is an immutable snapshot in `po_versions` (one row per PO id: `base_po_id`, `revision` (0 = original), `kind` `original | updated | revised at loading`, title, instruction, required-by, currency, `lines`, `line_changes`, `reason`, `by_user_id`, `at`). Each revision also carries `line_changes` on its `pos` row. A line change is `{ lineId, truckNo, kind: 'updated' | 'revised at loading' | 'added' | 'removed', before?: { truckNo, productId, qty, price, routeId, deliveredToId }, after?: … }` (`rules.diffPoLines`). `GET /pos/:id` returns `versions` (original first), `effectiveId`, cases `loaded` per line and the reader's `actions` (`update`, `delete`, `approve`, `deleteBlocked`, `updateBlocked`). The PO view's **Versions** panel lists each version (kind, who, when, reason, changes, PDF of that version) and compares any two side by side (changed cells highlighted, added lines green, removed red). Loaders and receivers get versions without prices (receivers: their lines only) and cannot update or delete.

**Delete (soft).** `POST /pos/:id/delete` with a **required reason**, only while nothing has been loaded (no loading Loaded, no shipment); afterwards it is refused with "…can no longer be deleted. Update it instead". The whole chain gets `status = 'Deleted'`, `deleted_at`, `deleted_by_id`, `delete_reason`; its orders get status `Deleted`; pending loadings are removed (queued trucks stay in the waiting list — queue entries belong to the loading point, not to a PO). Deleted POs are hidden from `GET /pos` (listed with `?all=1`) and from reports, kept in the audit log with the reason.

**Stages** (`rules.poStage`, list chips, dashboards, phone pipeline): *Awaiting approval* (only with the switch on) → *Created* → *Sent to supplier* → *Loading* (a truck loaded) → *On the road* (a truck left) → *Delivered* (every truck acknowledged), plus *Deleted*.

**Notifications:** "Purchase order created … approved automatically" (planners, directors) or "Purchase order awaiting approval" (directors, switch on); "Purchase order updated <ref> → <ref>-rev00N · changes · reason" (planners, directors, loaders); "Purchase order deleted / rejected" with the reason. No "ready to issue" or "waiting approval" when the switch is off.

**Migration `0011_po_versions`:** adds `pos.status` (default `Issued`), `deleted_at`, `deleted_by_id`, `delete_reason`, `revision_kind`, `line_changes` and the table `po_versions`; marks old loading revisions `revised at loading`; snapshots every existing PO version from its order. Existing drafts: a **Submitted** order becomes a PO **Awaiting approval** (`po-<plan id>`, same ref) — approved automatically at start-up while the switch is off; **Draft, Returned, Rejected** (and empty submitted) orders never became POs and are discarded: kept in `plans` with status `Deleted`, invisible everywhere. The seed issues the former demo drafts and adds BTW-PO-2026-0002-rev001 (office update after three trucks loaded: a fifth truck added), NUD-PO-2026-0009-rev001 (office update) + rev002 (revised at loading) and KVD-PO-2026-0011 (deleted before loading).

**Tests:** `packages/api/test/pos.test.ts` (rules + mock flows), `plans.test.ts`, QA `revisions` (Rule 4: create / update / interleaving / reduce-below-loaded / delete / access, approvals off) and `rules` (approvals on: awaiting approval, approve, reject), `api.e2e.ts`, and the `pnpm e2e` full-chain journey (create → PDF/email, update → rev001 with the Versions panel, delete).

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
