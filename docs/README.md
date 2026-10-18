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
| `presentation/build_pptx.py` → `BTW-Platform-Overview.pptx` | Client presentation (`python3 docs/presentation/build_pptx.py`) | Updated 18 Oct 2026 |
| `architecture/` → `BTW-Platform-Architecture.html/.pdf/.docx` | Architecture & processes pack, 9 pages (`python3 build.py`, `node pdf.mjs`, `python3 build_docx.py`) | v1.1, 18 Oct 2026 |

**Settings:** business switches (PO approval, loading allowance ±%, alternatives, revision suffix) live in `apps/api/config.toml` — see `09-plans-po-revisions.md` §2.
**Demo logins added 18 Oct:** truck planners `btw-trucks` (+254700000017) and `trucks` (+254700000018), web password `demo1234`. Office staff can also sign in on the phone at `/app/` with their phone number and PIN `1234` (team PWA).
