# Project docs

| File | What it is | Status |
|---|---|---|
| `inspiration/Requirements_Document_Supply_Chain_System_v0_3.docx` | Requirements (source of truth for scope) | Client draft v0.3 |
| `inspiration/preffered-logo.jpeg` | Brand logo (source of truth for visuals; never altered) | Supplied |
| `01-requirements-summary.md` | Summary, requirements by module and channel, NFRs, open questions | Waiting for answers |
| `02-design-system.md` | Design system proposal | Waiting for approval |
| `design-system/tokens.json` | The single definition of every colour, font, size and radius | Waiting for approval |
| `design-system/contrast-report.md` | WCAG AA results (`python3 design-system/check_contrast.py > design-system/contrast-report.md`) | 0 failures |
| `design-system/preview.html` | Visual preview, light and dark (`python3 design-system/build_preview.py` to rebuild) | — |
| `03-mvp-plan.md` | Research findings, stack decision, architecture, checkpoint tracking design, offline sync, MVP scope and milestones | Proposal, waiting for sign-off (§9) |
| `api/openapi.yaml` | API contract (draft) the backend implements and the apps call | Draft |
| `../apps/web`, `../apps/field` | Clickable prototype: every workflow screen, mock data, no backend | See root `README.md` |
| `09-plans-po-revisions.md` | Period plans as suggestions (Active / Replaced, no overlaps), PO approval switch in `apps/api/config.toml`, loading allowance and automatic PO revisions | Built (demo) |
| `10-truck-planner-role.md` | Truck planner role: features, onboarding providers/trucks/drivers, queues, Truck desk, demo logins | Built (demo) |
| `11-roles-and-dashboards-plan.md` | Plan from the updated roles document and the 56-dashboard proposal: real users, access matrix, warehouse money, landed cost v2, chart types, P1 dashboards | Agreed; built through workstream E |
| `12-roles-access.md` | Real roster (Daniel, Michael, Kabonge, Testfie, Joel, Eric, Moses, Asie, Yonas), logins, access matrix as built, decisions to confirm | Built (demo) |
| `13-dashboard-kit.md` | Dashboard building blocks: chart types, dashboard frame, PDF / Excel / CSV export, gallery at `#/dev/charts` | Built |
| `14-warehouse-money.md` | Warehouse expenses, stock counts, re-exports Asie → Yonas, transport fees, selling prices, landed cost v2 (worked example), combined performance report, ack reasons; config keys; decisions to confirm | Built (demo) |
| `15-dashboards.md` | First-release (P1) dashboards: who sees which, the question, visual, data source and route; role home screens (C-05 web); `GET /v1/dashboards`; scoping and tests | Built (web) |
| `CHECKLIST.md` | Living checklist with statuses, dated updates and open questions | Living |
| `16-phone-home-screens.md` | Phone home screens per person (directors, Kabonge, Testfie), receivers' warehouse strip, loaders' today list, "last synced" | Built (demo) |
| `17-page-design-review.md` | Page design review: which pages start with an overview, page types, merges, phased plan | For review |
| `presentation/build_pptx.py` → `BTW-Platform-Overview.pptx` | Client presentation, 36 slides: real roster, access matrix, warehouse money, landed cost v2, dashboards and home screens (web + phone), demo logins, open questions (`python3 docs/presentation/build_pptx.py`; screenshots in `presentation/assets/`) | Updated 25 Oct 2026 |
| `architecture/` → `BTW-Platform-Architecture.html/.pdf/.docx` | Architecture & processes pack, 10 pages: named roster in the process, access scopes, warehouse money, re-exports, dashboards endpoint, migrations 0009 / 0010, landed cost v2 data flow (`python3 build.py`, `node pdf.mjs`, `python3 build_docx.py`) | v1.2, 25 Oct 2026 |

**Settings:** business switches (PO approval, loading allowance ±%, alternatives, revision suffix) live in `apps/api/config.toml` — see `09-plans-po-revisions.md` §2.
**Demo logins (25 Oct):** `daniel`, `michael`, `kabonge`, `testfie`, `joel`, `eric`, `moses`, `asie`, `yonas` — web password `demo1234`; on a phone (field app or team PWA at `/app/`) the phone number and PIN `1234`. Full list in `12-roles-access.md` §1. The old made-up users (`btw-plan`, `btw-acc`, `btw-trucks`, …) are retired.
