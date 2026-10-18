# 07 — Amendments (client list, 14 Oct 2026)

Source: the client's "Things to amend on the system" list. It refers to sections and IDs (PL-06…12, PO-06…08, PV-01…07, §8.14, §10.1, Figure 10.1) from a requirements version newer than the v0.3 in `docs/inspiration`. The truck-planning image, the **KBL receipt** and that newer document are not in the repo yet; **phase 2 waits for them**.

## Phase 1 — build now

> **Superseded in part (18 Oct 2026):** period plans no longer need approval and never overlap, director approval of POs is a `config.toml` switch (off by default), PO-07 reasons are optional, and loading deviations create PO revisions. See [09-plans-po-revisions.md](09-plans-po-revisions.md).

### A. Period planning (§8.3, PL-06 to PL-12)
- **Period:** 1 month, a quarter, half a year, a year, or custom (dates or months). A planner or director picks it.
- **Plan line:** supplier, brand + package (SKU), planned cases, price, and delivered-to company (receiving company / destination warehouse). The amount is computed.
- **Monthly split (optional):** a line's cases can be spread over the months of the period. It defaults to even, and the months must add up to the line total.
- **Approval:** Draft → Submitted → Approved / Returned / Rejected. Directors approve on web or app with the same drawn signature and stamp. An approved plan is locked; any change is a versioned amendment with a reason and an approver, and the history is kept.
- **Copy and overlap:** "Copy from an earlier plan" starts the next period, with the dates shifted. A warning appears when two plans for the same company and supplier overlap in time.
- **Scope:** everything is per company (BTW / NUD / KVD). Group view is read-only.
- **Naming:** in the UI these are **Period plans**. The existing per-order "plans" are the **purchase order** drafts (next section).

### B. Purchase orders against the plan (§8.4, PO-06 to PO-08)
- **Plan link:** each PO line links to a period-plan line of the same company, supplier and SKU, from the approved plan covering the PO date. The editor shows planned, already ordered, this PO and remaining quantity.
- **Exceptions:** a line above the remaining quantity is **Over plan**, and a brand not in the plan is **Unplanned**. Both need a reason before the PO can be submitted.
- **Approval:** directors approve each PO before it is issued. The approval screen shows the over-plan and unplanned marks with their reasons. The signature, stamp and letterhead stay as today.

### C. Planned vs actual (§8.14 PV-01 to PV-07, §10.1)
- **Measures:** planned, actual ordered, variance, plan used %, expected to date (pro-rata, or from the monthly split), and remaining.
- **Flags:** Behind plan, On track, Over plan and Unplanned. Default thresholds are set by directors (assumed: behind if ordered-to-date < 85% of expected, over if > 105% of plan; ask the client).
- **Layout (Figure 10.1, approximated until the figure arrives):**
  - a monthly chart with running totals, planned vs actual, and a "today" marker
  - a plan-used bar per brand
  - a table drilling down plan line → POs
- **Filters:** company (and Group for directors), period, supplier, brand.

### D. Destinations are warehouses
- Destinations are warehouses named by country and town: **Congo – Goma**, **Rwanda – Gisenyi**, **South Sudan – Juba**, and more as the client lists them.
- Plan lines, PO lines and shipments point to a destination warehouse, which belongs to a receiving company (Asie / Zonas).
- Kigali becomes a transit point, unless the client says otherwise.

### E. Each user sees only their own features
- There is a role × feature matrix (in this doc, below), enforced in navigation, routes and the API.
- For example, accounts don't see planning editors, planners don't see payments, and loaders, drivers and receivers use the field app only.

### F. Demo data: a 3-month end-to-end flow
- The assumption is a 3-month cycle per company: an approved period plan → POs (some on plan, one over plan, one unplanned) → trucks → legs → receipt → stock → sales. The history before it stays for the trends.

## Phase 2 — when the files arrive
- **Truck planning by the PO planners** (per the client's image). A truck can carry goods from **different POs**.
- **The next leg is a new shipment**, linked to the previous one: a transfer creates a new shipment, not a leg inside the old one.
- **KBL receipt:** the truck plan and receipt documents use the KBL receipt's columns and calculations.
- **Accounts:** accounts capture the additional costs for goods to reach the destination, which feed landing cost.

## Role × feature matrix (to confirm with the client)
| Feature | Director | Planner | Fleet / ops | Accounts | Admin | Loader | Driver | Receiver |
|---|---|---|---|---|---|---|---|---|
| Dashboard (company / group) | ✓ group | ✓ | ✓ | ✓ | ✓ | – | – | – |
| Period plans | approve | create / edit | view | view | – | – | – | – |
| Purchase orders | approve | create / edit | view | view | – | view own loading point | – | – |
| Planned vs actual | ✓ | ✓ | – | ✓ | – | – | – | – |
| Loading, shipments, tracking | ✓ | view | ✓ | view | – | field app | field app | field app |
| Inventory, sales | ✓ | view | – | ✓ | – | – | – | field app |
| Trip costs, payments, landing cost | approve | – | view | ✓ | – | – | – | – |
| Reports | ✓ | planning, sales | logistics | finance, sales | – | – | – | – |
| Users, master data, integrations | view | master data | – | – | ✓ | – | – | – |
