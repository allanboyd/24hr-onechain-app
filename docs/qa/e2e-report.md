# End-to-end QA report: user journeys (web + field + API)

**Suite:** `pnpm e2e` (`tests/e2e/`). It runs real people in parallel: each person is a separate browser context, and phones are 390 px wide with touch.
**What `pnpm e2e` sets up:**
1. An isolated database, `btw_e2e` on :55433, migrated and seeded.
2. Builds of both apps for the API, written to `tests/e2e/.build`.
3. A single-point server on :3197 serving the web app at `/`, the field app at `/app/`, the brand sheet at `/brand/` and the API at `/v1`.

The user's running instance on :3101, their database and their `dist/` folders are never touched.
**Output:** `tests/e2e/out/report.{html,md}`, one screenshot per step, `server.log`. The `out/` folder is git-ignored.
**Options:** `E2E_ONLY=chain,transfer`, `E2E_SKIP_BUILD=1`, `E2E_KEEP=1` (leaves the server up for poking around).

## Journeys and results (final run: see bottom)

| # | Journey | What it proves |
|---|---|---|
| 1 | **Full chain** | Plan → approval → PO → hand-over → trip → receipt, step by step:<br>• The planner builds a mixed-load truck (Brand A + Brand B on truck 1, with a truck subtotal) and submits it.<br>• The director approves with a drawn signature.<br>• The server PDF downloads (real `%PDF`).<br>• "Email to supplier" reaches Mailpit at `export@kbl.example` with the PDF attached.<br>• Joel (KBL, phone) hands over KDB 456B to Hassan with a document photo and an agreed price of 1,650.<br>• Hassan's phone shows the trip **without a reload**.<br>• Hassan uses **Undo** once (nothing is recorded), checks in at Gilgil and Eldoret, then goes **offline** for two Webuye check-ins. The phone shows "Offline · 2 saved"; the server has nothing yet.<br>• Back online, the two check-ins sync in **exactly one** `/sync/batch` with source `driver`.<br>• At the Malaba border the app shows the border-wait note. Hassan reports a "Border / documents" problem, then taps **Fixed — moving again**. Both reach the server.<br>• He continues through Katuna to Asie Kigali.<br>• The web timeline shows the sources ("driver tap", "SMS").<br>• Asie receives the delivery with 6 damaged cases, a remark, a photo and a signature.<br>• The web shows a discrepancy notification. Stock rises by +1,200 received and +6 damaged. Finance shows the 1,650 transport cost. Analytics renders and the shipment is Acknowledged. |
| 2 | **Transfer leg** | Nairobi → Kigali → Goma with two drivers:<br>• Joel hands PO truck 4 (Nairobi → Goma) to Hassan.<br>• The office clicks "Unload & transfer at Asie warehouse Kigali".<br>• Hassan drives leg 1 and stops at Kigali.<br>• Asie receives it as a **transfer point** (not into stock).<br>• The office adds leg 2 (Kigali → Goma). **Trucks too small for the cargo are not offered.** Said drives RAD 310E.<br>• Asie "sends it on" with a slide; Said drives through the Gisenyi/Goma border.<br>• Asie's final receipt at Goma closes the shipment (all legs Acknowledged). The web shows both legs reconciled. |
| 3 | **SMS check-in mid-route** | `arr kampala kdb 456b` (lower case, spaces) is sent from Hassan's number to `/v1/dev/sms/inbound`. His phone moves to "I'm leaving Kampala" without a reload, and the server records source `sms`. This runs inside journey 1. |
| 4 | **Onboarding + remote sign-out** | • The admin creates drivers in Users & devices, including "Moses Lado", whose first name clashes with loader "Moses", and sets a PIN.<br>• The driver signs in on the field app with that PIN.<br>• The admin sees the phone under Devices and clicks **Sign out remotely**. The phone goes back to sign-in **by itself** (about 10 s) with an explanation.<br>• The driver can sign in again. |
| 5 | **Role guards** | • A driver signing in on the web gets "Use the BTW field app" and cannot reach any office screen by URL.<br>• A loading-point user can open Loading but gets **No access** on `/users`, `/finance` and `/plans/new`.<br>• The director on the field app gets "Use the web app" with a same-origin link.<br>• A wrong PIN is refused with a clear message. |
| 6 | **Layout, errors, focus** | • Every web page as the director at 1440, 1024 and 390 px, plus Integrations as the admin.<br>• Every field role (driver, loading point, receiver) on its home screen and menu at 360, 390 and 430 px.<br>• No horizontal overflow, no error states, no console errors, no failed requests.<br>• A visible focus ring when tabbing to the primary action.<br>• "Reset demo data" is hidden for field users on the live API. |
| 7 | **Brand + favicons** | `/brand/` loads all 32 logo images with no 404s. Both apps serve a favicon that loads. |

Every step fails on any console error or failed request unless that request is the deliberate one under test (e.g. the wrong-PIN 401).

## Bugs found

| # | Severity | Where | Bug | Status |
|---|---|---|---|---|
| 1 | **High** | web | No route guards: any signed-in role could open office screens by URL (a driver could open `#/users` or `#/finance`; a loader could open `#/plans/new`). | **Fixed**: `canOpen()` in `routes.ts` uses the nav's role lists, and the app shows "No access". Driver-only accounts get "Use the BTW field app" with a link. |
| 2 | **High** | field | No live refresh. The driver never saw a newly handed-over trip, an SMS or geofence check-in made elsewhere, or a remote sign-out until the app restarted. The receiver didn't see arrivals and the loading point didn't see new orders. | **Fixed**: `apps/field/src/live.ts` refreshes on local change, every 15 s while visible, and on focus/online (skipped while offline). Used by all three role screens. |
| 3 | **High** | field | A revoked or expired session (remote sign-out, PIN reset, deactivation) left the user on a dead screen. | **Fixed**: `auth.onExpired` returns the user to sign-in with the message "You were signed out. Sign in again with your PIN." |
| 4 | **Medium** | web | "Add next leg (transfer)" offered trucks smaller than the cargo (T 512 DFG holds 1,800 cases; the leg carries 2,000). The receiver's hand-over then correctly refused it, but the receiver can't change the truck, so it was a dead end. | **Fixed**: the dialog shows each truck's capacity and "This leg carries N cases", disables trucks that are too small, and validates before saving. |
| 5 | **Medium** | web | Horizontal overflow: `/sales` at every width (1583 px page in a 1440 px window); `/analytics` at 390 px; the top bar at 390 px on **every** page (Sign out pushed off-screen). Cause: grid tracks of `1fr`, which can't shrink below a table's width, and a fixed-width mobile logo. | **Fixed**: `minmax(0, 1fr)` in Sales, Analytics, Finance, Master data, Tracking, Dashboard and the app shell; the mobile logo can shrink. |
| 6 | Low | field | "Use the web app" linked to `localhost:5173` even when served from the single point. | **Fixed**: same origin under `/app/`, else `VITE_WEB_URL`, else the dev URL. |
| 7 | Low | field | "Reset demo data" was shown on the live API, where it returns 403 for field roles. | **Fixed**: shown in mock mode only. |
| 8 | Low | web | Sign-out workaround (clearing `btw-last-device`) is no longer needed after QA-A's client fix. | **Removed**: sign-out now awaits `auth.logout()`. |
| 9 | Medium | API | `POST /v1/users` built the username from the first name, so "Moses Lado" collided with loader "Moses" and failed with a 422 whose message contained the raw SQL insert. | **Fixed by QA-A during this run**; the onboarding journey now passes. |
| 10 | Low | API | A driver given an account in Users & devices keeps `drivers.has_app = false`. The hand-over shows "Said Juma (no app — SMS)" and the API would send him SMS instructions although he has the app. | **Open (API)**: set `hasApp` when a driver-role user is linked, or derive it from the link. |
| 11 | Info | API/web | Once, in a standalone transfer run, the director's reload got a 401 on `GET /v1/me`. The client refreshed and the user stayed signed in. Not reproduced in later full runs. | **Watch**: the harness now records the 401 title and `out/server.log` to diagnose it if it recurs. |
| 12 | Low (UX) | web | Office screens don't refresh by themselves; e.g. shipment detail stays stale until you navigate. | **Open**: consider the field app's `live()` pattern or SSE for shipment, tracking and notifications. |

**Test infrastructure:** `apps/api/src/main.ts` gained `WEB_DIST` / `FIELD_DIST` overrides, resolved with `path.resolve`. Without them, a second instance would serve the user's `dist/`: when anyone rebuilt it mid-run, the browser's lazy-loaded chunk files returned 404.

## Final run
**95/95 steps passed** (all 7 journeys, 655 s, 7 Oct 2026, fresh build). Step-by-step table with screenshots: `tests/e2e/out/report.{md,html}`.
