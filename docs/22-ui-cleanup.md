# 22 · UI cleanup: research and plan

**Status:** research done 25 Nov 2026 · waiting for the decisions in §5 · work is tracked on [`work/BOARD.md`](work/BOARD.md)

## 1. What we compared

| | BTW (ours) | Reference (Ewasaone staff portal) |
|---|---|---|
| Stack | Svelte 5, `packages/ui/src/base.css`, tokens from `docs/design-system/tokens.json`, Lucide icons | React + Tailwind, `shared-ui/src/styles/*.css`, own icon set |
| Shell | Dark grouped sidebar, sticky top bar | Same idea, more polish |
| Screens looked at | Login, Home (director, Group), Purchase orders list, Create purchase order, Master data | Staff sign-in, Dashboard, Approvals |

We copy **patterns and measurements**, not code. Screenshots (1440 × 900) are in [`work/research/ui-cleanup/`](work/research/ui-cleanup/): `btw-*.png` are ours and `ref-*.png` are the reference.

Our layout is already the same as the reference: dark grouped sidebar, sticky top bar, cards, KPI strip. The gap is in polish. It comes from four habits:

1. **One accent, used once.** The reference uses gold only for the active nav item and badges. We use orange for the top ribbon, the company-switcher border, the active nav bar, the tab underline, the bell badge and the login rule.
2. **A calmer type scale.** The reference uses one face (Plus Jakarta Sans), titles at 26–28 px / 800, and no uppercase overlines above page titles. We use Montserrat 800 at 36 px, an UPPERCASE overline on every page, and Inter for the body.
3. **Softer surfaces.** Their radius is 10 / 14 / 18 px with a 1 px very light border and an xs shadow. Ours is 6 / 10 px with a stronger border, which looks boxy.
4. **Field anatomy.** The reference always uses label, then hint, then control, then error, in a two-column body with "wide" fields. Our labels carry long explanations and wrap, so form rows go out of line.

## 2. Issues found (IDs are used on the board)

### Shell: sidebar and top bar (`S`)
| ID | Issue | Fix |
|---|---|---|
| S-1 | The top bar does not show which page you are on. The reference puts the page title on the left. | Put the route `title` on the left of the top bar. |
| S-2 | Name, role, a bare moon icon and a bare sign-out icon sit side by side. Sign out is one mis-click away. | Account chip (avatar initial, name, role, chevron) that opens a menu: Theme · Notifications settings · Sign out. |
| S-3 | The bell's "25" badge is orange and overlaps the icon. | Small bounded pill, `9+` / `99+` cap, neutral or danger tone. |
| S-4 | Too much orange: ribbon, switcher border, nav bar, tab underline. | Remove the ribbon and the switcher border. Keep the accent on the active nav item only (rule: accent = CTA and active state). |
| S-5 | The brand block (three logo tiles + "Group" + "BTW · NUD · Kivu") is crowded. | One 34 px mark + name + one-line subtitle, as in the reference. In the Group view, show the group lockup. |
| S-6 | 16 items in 5 groups, and the sidebar can't collapse. The footer "Live data" has little value. | Collapse to an icon rail (remembered in localStorage, tooltips on icons). Footer = Sign out. Show live/demo in the account menu. |
| S-7 | Nav group labels have big gaps above them (space-4). | Tighter group spacing (≈ 16 px label top, 2 px item gap), 13.5 px items, 18 px icons. |
| S-8 | No way to jump to a record. | *Later:* a "Find PO, truck, shipment…" box in the top-bar centre. Not in this round. |

### Login (`L`)
| ID | Issue | Fix |
|---|---|---|
| L-1 | Six demo users fill the page, and the real sign-in form is below the fold behind "Sign in with your own account". | One centred card (≤ 440 px): logo, eyebrow, "Sign in", username/phone, password, primary button. Under it, "Try a demo" as one select or a collapsed list (demo builds only). |
| L-2 | The lead line uses an em dash, which breaks our own text rule. | Rewrite without the em dash. Also run `pnpm check:text`. |
| L-3 | Field app (phone) sign-in has not been reviewed. | Same card at phone size, with a large PIN keypad. |

### Forms (`F`)
| ID | Issue | Fix |
|---|---|---|
| F-1 | Create PO asks for the company **twice**: a banner above the form and again inside "Ordering company". | One chooser, inside the form. |
| F-2 | Long labels wrap ("Ordering company (letterhead)", "Addressed to (supplier export section)") and push rows out of line. | Short label + hint line. Shared `Field` component (label, `*`, hint, control, error; `aria-describedby`). |
| F-3 | Native `<select>`s use the OS chevron and don't match the inputs (45 files). | Style `.select` in `base.css` with our own chevron, the same height, and the same focus ring. One change fixes every select. |
| F-4 | The 4-column grid leaves gaps (row 2 uses 2 of 4 columns). | Two-column form body. `wide` fields span both columns. The summary side card stays. |
| F-5 | Required marks and error messages are inconsistent. | Covered by `Field` + an error summary at the top on submit. |
| F-6 | Option text uses em dashes ("KBL — Nairobi, Kenya"). | Use a comma: "KBL, Nairobi, Kenya". |
| F-7 | "Cancel" floats top-left and the main action sits elsewhere. | Footer action bar: Cancel (secondary) and the primary action on the right, sticky on long forms. |

### Lists and tables (`T`)
| ID | Issue | Fix |
|---|---|---|
| T-1 | References break over lines (`BTW-PO-2026-` / `0013`). | `white-space: nowrap` on id columns. Show the revision chip on the same line. |
| T-2 | Dates take 3 lines ("31 October / 2026 / Joel"). | Short date ("31 Oct 2026") with the person on a second muted line. |
| T-3 | Search, three selects and the "53 of 53" count are out of line, and density / Columns / CSV sit on a second row. | One toolbar row: search · filters · spacer · count · density · Columns · CSV. |
| T-4 | Master data actions mix an icon, a text link and an icon. | Same icon buttons with tooltips, or one row menu (⋯). |
| T-5 | UPPERCASE, letter-spaced headers are hard to scan. | Sentence-case, 12.5 px, muted, semibold. |

### Page header (`P`)
| ID | Issue | Fix |
|---|---|---|
| P-1 | An UPPERCASE overline sits above every title (PROCUREMENT, ADMIN, DIRECTOR · GROUP VIEW (READ-ONLY)), and the title is Montserrat 800 at 36 px. | No overline (S-1 puts context in the top bar). Title 28 px / 700. Scope info ("Group, read-only") as a small chip next to the title. |

### Dashboard cards (`D`)
| ID | Issue | Fix |
|---|---|---|
| D-1 | **Bug:** chart card titles are drawn over by the info and recommendation icons ("Decisions"). "Sales and profit" wraps to 3 lines, with icons on top of the text. | The header must be one flex row (`min-width: 0`, the title truncates, icons don't shrink), as `.cursor/rules/dashboards-home.mdc` already says. |
| D-2 | Native "7 days" select inside the chart header. | Segmented control (7 d · 30 d · 90 d) or the styled select from F-3. |
| D-3 | The Sales and profit chart is flat at 0 (0–1 axis) while the KPI shows USD 45.5K. | Check the data/period: chart series vs KPI period. |
| D-4 | KPI cards have uneven content heights. Only the hero card has a sparkline. | Same card anatomy: label, value, delta, foot line. |

### Don't copy from the reference
- A blocking modal for an API error (their Approvals page shows "Couldn't complete that / API 500" over everything). Keep our in-page error states.
- A floating assistant bubble that covers table rows.
- Keep what we do better: tables with density and columns, selection states (doc 13), the company switcher, dark theme, status chips.

## 3. Workstreams (run in parallel after UI-0)

```
UI-0 Foundation ──┬── UI-1 Shell
 (merge first)    ├── UI-2 Login
                  ├── UI-3 Forms
                  └── UI-4 Lists + page header
UI-5 Dashboard cards ─ can start now (D-1 is a bug fix)
UI-6 Review + QA ───── after each merge
```

| ID | Stream | Issues | Owns (only this stream edits these) |
|---|---|---|---|
| UI-0 | Foundation | tokens (radius, shadow, border, focus ring, type scale), `.select` chevron (F-3), new `Field`, `IconButton`, `Menu` in `@btw/ui`; P-1 type scale | `docs/design-system/tokens.json`, `packages/tokens/**`, `packages/ui/src/**`, `scripts/build-tokens.mjs` |
| UI-1 | Shell | S-1…S-7 | `apps/web/src/App.svelte`, `apps/web/src/components/CompanySwitcher.svelte`, `apps/web/src/components/CompanyMark.svelte`, the `nav` part of `apps/web/src/routes.ts` |
| UI-2 | Login | L-1…L-3 | `apps/web/src/screens/Login.svelte`, `apps/field/src/screens/Login.svelte` |
| UI-3 | Forms | F-1, F-2, F-4…F-7 | `screens/PoEdit.svelte`, `PeriodPlanNew.svelte`, `PeriodCheck.svelte`, `SellingPrices.svelte`, `components/ProductPicker.svelte`, `ReplaceDialog.svelte`, `StaticDialog.svelte`, `*Tab.svelte` forms |
| UI-4 | Lists + page header | T-1…T-5, P-1 | `apps/web/src/components/page/**`, list cells in `POs.svelte`, `Shipments.svelte`, `MasterData.svelte`, `Stock.svelte`, `Sales.svelte` |
| UI-5 | Dashboard cards | D-1…D-4 | `apps/web/src/components/dashboard/**`, `components/charts/**`, `screens/dash/**` |
| UI-6 | Review + QA | mockup flows, review board, `check:text` | `tools/mockups/**`, `tests/**` |

A file that isn't listed belongs to nobody. Claim it on the board before you change it.

## 4. Done when (every stream)
- Every issue ID in the stream is fixed or moved, with a reason, to a later row.
- `pnpm check:text && pnpm check && pnpm test && pnpm build && pnpm size` pass.
- Before/after screenshots of each changed screen are attached to the stream's plan file.
- Light and dark theme are both checked, plus 390 px wide for the shell and login.

## 5. Decisions needed from you
1. **Fonts:** keep Montserrat for titles (brand) but smaller, or move to one face for everything like the reference (Inter, or Plus Jakarta Sans)? *Proposal: keep Montserrat for page titles only, 28 px / 700, and use Inter everywhere else.*
2. **Accent:** orange only on the active nav item and the main buttons? *Proposal: yes.*
3. **Sidebar collapse to an icon rail:** in this round? *Proposal: yes (UI-1).*
4. **Demo users on login:** show them only in demo builds (`VITE_DEMO=1`)? *Proposal: yes, as one select.*
