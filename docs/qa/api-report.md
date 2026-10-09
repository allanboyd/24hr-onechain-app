# QA report: API, security and integrations

**Date:** 7 Oct 2026 · **Scope:** `apps/api` (NestJS + PostGIS), the shared client in `packages/api`, the integrations and the webhooks.
**Suite:** `pnpm --filter @btw/server test:qa`. Add `--only <suite>` to run one suite: `security`, `fuzz`, `integrations`, `sync`, `rules` or `load`.
**Result:** **229/229 checks pass.** The existing suites still pass too: the API HTTP test, the integration test (`test:integrations`), the 14-step mock workflow test, and the type-checks of both apps (0 errors, 0 warnings).

The suite never touches your data. Every suite creates its own database (`btw_qa_*`) and runs its own API process on ports 3291–3298. `boot()` refuses to start if its port is already in use. The `btw` database and the server on :3101 are left alone.

## What was tested
| Area | Coverage |
|---|---|
| Authentication | Missing, garbage, wrong-secret, `alg=none`, expired and unknown-user tokens. Refresh-token rotation and reuse detection. Logout. Remote revoke of a lost phone. Deactivating a user and resetting a PIN both end live sessions. Login responses and user lists don't expose password or PIN hashes. |
| Role matrix | 21 endpoints × 11 identities: the director, planner (Kabonge), two loaders (Joel at KBL; Tesfie, who also has fleet and operations), the Asie and Zonas receivers, accounts, the admin, two drivers, and an anonymous caller. |
| Data scoping and cross-scope writes | Lists filtered by entity, loading point and warehouse. These are refused: one driver acting on another driver's truck, Zonas acknowledging a delivery to Kigali, Asie selling Juba stock, and replaying another user's idempotency key. |
| Input validation | 16 malformed or invalid requests return 4xx with a clear message. Bodies over 15 MB are refused. A fuzz pass sends 1,172 junk requests across all 81 routes, using placeholder ids and then real ids: no 5xx, and no SQL text in any response. |
| Production mode | Every `/dev` route returns 404, and so do the demo-user and reset endpoints. Webhooks are refused when no secret is configured. When a secret is set, the webhook key is enforced. |
| Business rules | PO numbering per entity and year. A plan needs a signature to be approved, then locks, and changes go through amendments with history kept. Prices come from the price list. Truck capacity and an agreed transport price are required, and a loading can't be confirmed twice. Multi-leg shipments with a transfer point carry the good quantity forward. Stock posts only on the final acknowledgement. Discrepancy alerts. Over-stock sales are blocked unless a director overrides. Payments above the threshold need director approval. Landing cost. ETA and overdue. Undo is allowed for 10 minutes for the driver and at any time for the office, and is audited. Velocity classes and flags; changing the thresholds reclassifies immediately. |
| Offline sync | Every outbox operation goes through `/sync/batch`. Replays return the stored result. Items run in order. One bad item doesn't block the rest of the batch. Stale items get 409. Five concurrent submits of the same loading create exactly one shipment. Two concurrent submits of the same offline sale reduce stock once. |
| Integrations (real tracking handler) | Driver SMS in Africa's Talking webhook format: arrive, depart, issue, fix and help replies. A full USSD menu walk. GPS pings trigger automatic arrival and departure through PostGIS geofences, and location history is stored. The PO email lands in Mailpit with the PDF attached and `sentAt` is set. The driver's push and in-app notification on hand-over. Signed file links, forged and unsigned links, and HTML disguised as a photo. |
| Load | 50 drivers, each with their own account, truck and dispatched trip, for 60 s. They send GPS pings every second, a check-in every 8 s and a trip refresh every 15 s. Meanwhile a director edits master data every 2 s, with a 1.5 s reference-cache lifetime and a 6-connection pool. |

**Load result:** about 3,200 requests in 61 s (53 req/s) with **0 errors**.

| Call | p50 | p95 | p99 |
|---|---|---|---|
| GPS ping | 58 ms | 123 ms | 184 ms |
| Check-in | 127 ms | 305 ms | 352 ms |
| Trip refresh | 40 ms | 109 ms | 123 ms |

## Findings
All findings marked *Fixed* have a regression test in `apps/api/test/qa/*`.

| # | Severity | Finding | Status |
|---|---|---|---|
| 1 | **Critical** | **The API froze for good under load.** Write transactions read the master-data cache while holding a database connection. When the 60 s cache expired, the reload needed connections from the same 10-connection pool, so every request hung until timeout (~300 s). The test reproduced it: 150 timeouts. | Fixed. Separate 2-connection pool for the cache, one load at a time, stale cache served while it refreshes, and a 30 s idle-in-transaction timeout. Pool size configurable (`DB_POOL`, default 20). |
| 2 | **High** | **4-digit PINs could be guessed:** no attempt limit. | Fixed. 5 failures in 15 min lock that account for 15 min (429); an admin PIN reset clears the lock. |
| 3 | **High** | **`POST /dev/reset` was open to anyone** outside production, and `pnpm start` listens on all network interfaces. Anyone on the LAN could wipe the database. | Fixed. Now requires a director or admin, and stays 404 in production. |
| 4 | **High** | **Anyone could post SMS check-ins for a truck:** the plate number was trusted and the sender's phone was never checked. | Fixed. The sender must be that leg's driver or an office/fleet user; anyone else gets a refusal reply. |
| 5 | High | **A late logout ended the newer session** on the same device (the web re-login bug). | Fixed. Server: access tokens carry a session id (`sid`), so logout ends that session and older ones only. Client: `auth.logout()` returns a promise, and each web sign-in gets its own device id; phones keep a stable one. |
| 6 | High | **A PIN or password reset didn't end existing sessions.** | Fixed. The token version is bumped and refresh tokens are revoked. |
| 7 | High | **Concurrent replays of one offline item could both apply.** Idempotency keys were also global, so another user's key returned that user's stored result. | Fixed. The key is claimed first, so later duplicates wait for the first result. Keys are per user; another user's key gets 409. |
| 8 | Medium | **A corrupt signature image made the PO letter and acknowledgement PDFs fail permanently** (422). | Fixed. Signatures are validated as real PNG/JPEG images on approval and acknowledgement. PDFs re-render without user images if one can't be decoded. |
| 9 | Medium | **Acknowledgements accepted products that weren't on the truck and quantities chosen by the client**, which allowed inventing stock. | Fixed. Products must be on the leg; the expected quantity comes from the loading; counts must be whole numbers ≥ 0. |
| 10 | Medium | **Check-in times in the future were accepted** (faked punctuality). | Fixed. More than 10 min ahead is refused. |
| 11 | Medium | **Accounts staff could check trucks in, acknowledge deliveries and change loading queues.** The waiting list also accepted trucks and drivers that don't exist. | Fixed. Writes are limited to driver, loader, receiver, operations, fleet, planner, director and admin. Trucks and drivers are validated. |
| 12 | Medium | **Database errors reached clients as 422 with the raw SQL text.** Example: creating a second user with the same first name. | Fixed. DB errors return 500 with no detail; unique violations return 409. Usernames are de-duplicated (`peter`, `peter2`). |
| 13 | Medium | **About 15 routes returned 500 on junk input**: user and master-data creation, market trucks, amendments, payments, the ledger, positions, sync. | Fixed. Body-shape guard (missing body → `{}`, non-object JSON → 400), type checks in handlers, and `positions` validates lat/lng. |
| 14 | Medium | **Plans accepted negative quantities, products from another supplier, and unknown routes or receivers.** | Fixed. All refused with clear messages. |
| 15 | Medium | **The director's over-stock sale override could never be used**, because recording a sale required the sales or receiver role. Unknown products could also be sold. | Fixed. |
| 16 | Medium | **Payments weren't checked against their cost line:** any id was accepted, and overpaying was allowed. | Fixed. The cost must belong to the trip, and the amount can't exceed the remaining balance. |
| 17 | Medium | **Webhooks ran in production without a secret.** | Fixed. Refused (403) until `WEBHOOK_SECRET` is set. |
| 18 | Low | **The USSD "arrived at" option pointed to the checkpoint the truck was already at.** | Fixed. It now offers the next one. |
| 19 | Low | **Directors couldn't add trucks or drivers, and directors/admins couldn't record a loading.** | Fixed. |

## Still open
- **Rate limiting is in memory**, per API process. Move it to Postgres or Redis before running more than one instance. Lockout is per account, so someone can deliberately lock a driver out for 15 min; the admin PIN reset unlocks.
- **`/v1/dev/*` tools are unauthenticated outside production** (the SMS inbox, simulating inbound SMS, the PDF preview). They're needed by the web Integrations page; they're safe on localhost but visible on the LAN with `pnpm start`. Run with `NODE_ENV=production`, or restrict them to loopback, whenever the server isn't on a trusted machine.
- **Old check-in times are only bounded for undo** (10 min for drivers). Offline queues legitimately carry past device times, so there is no lower limit on `at`.
- **Receivers and loaders can record check-ins at mid-route checkpoints** on trucks they can see. This is useful for office calls; restrict it if the client wants to.
- **The mock client doesn't mirror the new server validations**: payment balance, director sale, signature format. The demo UI never sends those inputs, so this only affects mock-mode demos.
- **The running `pnpm start` server on :3101 still runs the old code.** Restart it to pick up these fixes.

## Notes for the other tester (web/field)
- **Field menu "Reset demo data":** in http mode it now needs a director or admin. Drivers get 403, and the field app swallows the error silently. Hide the button for other roles, or show the message.
- **Signatures:** must be real PNG/JPEG data URLs (canvas `toDataURL('image/png')` is fine); placeholder strings are refused.
- **Web logout:** the `btw-last-device` workaround can stay; the client and server fixes make it unnecessary.
