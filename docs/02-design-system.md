# 02 — Design System (proposal)

**Source of truth for visuals:** `docs/inspiration/preffered-logo.jpeg`. The logo is used exactly as supplied: never redrawn, recoloured or cropped.
**Single token definition:** [`design-system/tokens.json`](design-system/tokens.json). Web (CSS variables / Tailwind theme) and mobile (React Native theme object) are **generated** from this one file. Screens use semantic tokens (`theme.primary`, `space.4`, `radius.md`) and never raw hex or pixel values.
**Contrast evidence:** [`design-system/contrast-report.md`](design-system/contrast-report.md), regenerated with `python3 docs/design-system/check_contrast.py`.
**Visual preview:** [`design-system/preview.html`](design-system/preview.html). Open it in a browser and use the toggle to switch light/dark.

Status: **Draft, waiting for your approval.**

---

## 1. What the logo tells us

| Logo trait | Observation | Design decision |
|---|---|---|
| Two-colour identity | Deep navy lettering and a vivid orange arrow/ribbon | Navy = **primary** (trust, structure). Orange = **accent** (movement, action, "growth"). |
| Letterforms | "BTW": very heavy, wide, geometric sans with slightly softened corners. "GLOBAL DISTRIBUTORS": bold geometric sans. Tagline: same family, wide letter-spacing | Geometric display face for headings; wide-tracked uppercase for small labels (echoes the tagline) |
| Corners | Blocky shapes with small radii; the ribbon folds are soft; the arrow tip is sharp | Small, tight radii (4–10 px). No pill-shaped buttons. Sharp, confident shapes. |
| Weight | Heavy strokes everywhere | 2 px icon strokes, 600–800 heading weights, 3 px active indicators |
| Gradient | Only on the orange ribbon (deep orange → orange → amber) | UI stays **flat**. The ribbon gradient is kept for one decorative 3 px brand strip only. |
| Tagline device | Orange hairlines either side of the tagline | Optional section-divider motif (thin orange rule with an overline label) |

---

## 2. Colour

### 2.1 Brand colours (sampled from the logo file)
| Token | Hex | Sampled from |
|---|---|---|
| `brand.navy` | **#062953** | "BTW" and "GLOBAL DISTRIBUTORS" lettering (median of ~172k pixels) |
| `brand.orange` | **#FE7514** | Arrow head and W ribbon (dominant tone) |
| `brand.orangeDeep` | **#DF4901** | Shadow fold of the W ribbon |
| `brand.amber` | **#FEA526** | Highlight on the swoosh |

> **Important accessibility finding:** the logo orange **#FE7514 on white is only 2.70:1**. That fails for text *and* for UI borders. So orange is never used for text or borders on light backgrounds. Instead:
> - Orange **fills** carry **navy text** (5.36:1 ✔), never white text.
> - Orange **text** on light backgrounds uses `orange.700` **#B83A00** (5.76:1 ✔).
> - The light-mode focus ring uses `orange.600` **#DF4901** (the logo's own deep tone, 4.12:1 ✔ for UI).

### 2.2 Scales
| Step | Navy | Orange | Neutral (navy-tinted) |
|---|---|---|---|
| 0 / 25 | | | #FFFFFF / #F6F8FB |
| 50 | #EEF3FA | #FFF4EC | #EEF1F6 |
| 100 | #D9E3F1 | #FFE3CC | #E2E7EF |
| 200 | #B3C6E2 | #FFC79A | #CBD3DF |
| 300 | #8FB2E8 | #FEA526 (logo amber) | #A3B1C6 |
| 400 | #5F80B3 | #FF8A3D | #8593A8 |
| 500 | #3A5F95 | **#FE7514 (logo)** | #66768C |
| 600 | #1F4578 | #DF4901 (logo deep) | #4A5A70 |
| 700 | #0F3A6E | #B83A00 | #33435A |
| 800 | #0A3160 | #8F2D00 | #172A45 |
| 900 | **#062953 (logo)** | #5C1D00 | #0B1B33 |
| 950 | #04152B | | #08121F |

### 2.3 Feedback colours
Chosen to sit with navy and orange. **Warning is deliberately yellow-amber, not orange**, so a warning is never confused with the brand accent. The velocity classes required by §9.2 map onto these: Fast = green, Normal = blue, Slow = amber, Stagnant = red.

| Role | Light: text / subtle bg / solid | Dark: text / subtle bg |
|---|---|---|
| Success | #15703A / #E6F4EC / #15703A | #5CCB8A / #0E2A1E |
| Info | #1D4FB8 / #E8EFFC / #1D4FB8 | #7AA7F5 / #12264A |
| Warning | #8A5300 / #FFF4D1 / #E0A800 | #F2C14E / #2E2410 |
| Error | #B4231B / #FDECEA / #B4231B | #FF8A80 / #3A1715 |

Colour is never the only signal. Every status badge has a **text label**, and the velocity, ETA and sync badges also have an icon (colour-blind safe).

### 2.4 Semantic theme (light / dark)
| Token | Light | Dark | Use |
|---|---|---|---|
| `bg` | #F6F8FB | #08121F | Page background |
| `surface` | #FFFFFF | #102037 | Cards, tables, sheets |
| `surfaceSunken` | #EEF1F6 | #0B1B33 | Table headers, input wells |
| `surfaceRaised` | #FFFFFF | #172A45 | Menus, modals |
| `border` / `borderStrong` | #CBD3DF / #8593A8 | #33435A / #5C6F8A | Dividers / input outlines (≥3:1) |
| `text` / `textMuted` / `textSubtle` | #0B1B33 / #4A5A70 / #66768C | #E8EDF5 / #A3B1C6 / #8494AB | |
| `primary` (+ `textOnPrimary`) | **Navy #062953** + white | **Orange #FE7514** + navy-950 | Main action button |
| `accent` (+ `textOnAccent`) | Orange #FE7514 + navy | Orange #FE7514 + navy-950 | Highlight CTA ("Approve", "Acknowledge"), active indicators |
| `accentText` | #B83A00 | #FF8A3D | Orange text |
| `link` | #0F3A6E | #8FB2E8 | Links |
| `focusRing` | #DF4901 | #FF8A3D | 2 px focus outline, 2 px offset |
| `nav` | #062953 | #04152B | Web sidebar / mobile header |
| `navIndicator` | #FE7514 | #FE7514 | Active nav item bar |

Why the primary colour changes in dark mode: navy buttons disappear on a navy-black background. In dark mode orange takes the primary role, so the navy + orange pairing is still the first thing people see in both themes.

### 2.5 Contrast results (WCAG 2.2 AA)
All 30 component pairs pass in **both** themes: **0 failures**. Full table in `design-system/contrast-report.md`. Highlights:

| Pair | Light | Dark |
|---|---|---|
| Body text on surface | 17.23:1 | 13.91:1 |
| Muted text on surface | 7.03:1 | 7.53:1 |
| Placeholder / caption | 4.63:1 | 5.30:1 |
| Primary button label | 14.48:1 | 6.77:1 |
| Accent button label (navy on orange) | 5.36:1 | 6.77:1 |
| Badges (success / info / warning / error) | 5.43 / 6.35 / 5.76 / 5.74 | 7.57 / 6.19 / 9.09 / 7.00 |
| Input border (UI ≥3:1) | 3.12:1 | 3.19:1 |
| Focus ring (UI ≥3:1) | 4.12:1 | 6.98:1 |

Banned pairs: white on #FE7514 and #FE7514 on white (2.70:1).

---

## 3. Typography

| Role | Font | Why |
|---|---|---|
| Display / headings / overlines | **Montserrat** (600–800) | Geometric, wide, heavy sans. The closest open-licence match to the logo's "GLOBAL DISTRIBUTORS" lettering and wide-tracked tagline. |
| Body, forms, tables, numbers | **Inter** (400–600) | Very legible at small sizes on screen. Its **tabular figures** keep quantity and amount columns aligned like the paper order letters. |
| Codes (PO refs, SKU codes) — optional | JetBrains Mono | Clear 0/O and 1/l in references such as `BTW-PO-2026-0002` |

All are Google Fonts (OFL licence). They are bundled in the mobile app (`@expo-google-fonts/*`) so text renders the same offline.

| Style | Size / line height (px) | Weight | Notes |
|---|---|---|---|
| `display` | 36 / 44 | Montserrat 800 | Dashboard KPIs, login |
| `h1` | 30 / 38 | Montserrat 700 | Page title |
| `h2` | 24 / 32 | Montserrat 700 | Section |
| `h3` | 20 / 28 | Montserrat 600 | Card title |
| `h4` | 17 / 24 | Montserrat 600 | Sub-section |
| `bodyLg` | 16 / 24 | Inter 400 | **Default body on mobile**, forms on both |
| `body` | 14 / 20 | Inter 400 | **Default body on web**, tables |
| `bodySm` | 13 / 18 | Inter 400 | Dense tables, helper text |
| `label` | 13 / 16 | Inter 600 | Form labels, buttons (sm) |
| `caption` | 12 / 16 | Inter 400 | Timestamps, meta |
| `overline` | 11 / 16 | Montserrat 600, UPPERCASE, +0.12em | Table headers, section eyebrows (the tagline style) |

Numbers: all quantity, price and amount cells use `font-variant-numeric: tabular-nums` and are right-aligned. The currency code always appears in the column header (§7.3 #1).

---

## 4. Shape, line, space, icons

| Token | Value | Use |
|---|---|---|
| `radius.sm` | 4 | Badges, checkboxes, table cells' highlight (echoes the blocky letterforms) |
| `radius.md` | 6 | Buttons, inputs, selects |
| `radius.lg` | 10 | Cards, panels |
| `radius.xl` | 16 | Mobile bottom sheets, modals |
| `radius.full` | — | Avatars and toggles only |
| Borders | 1 px hairline; 2 px strong/focus; 3 px active indicator | |
| Spacing | 4-px base: 0, 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64 | |
| Control height | sm 32 · md 40 (web default) · lg 48 (mobile default, min touch target) | |
| Icons | **Lucide** set, 2 px stroke, round caps, 16/20/24 px | Heavy-ish line that matches the logo weight; same set on web and RN (`lucide-react`, `lucide-react-native`) |
| Elevation | 3 levels, navy-tinted shadows | Cards are flat with a border; shadows only on menus, modals, sheets |
| Motion | 120 / 200 / 320 ms, `cubic-bezier(0.2,0,0,1)` | Honour reduced-motion |
| Gradient | `brandRibbon` (#DF4901 → #FE7514 → #FEA526) | **Decorative 3 px strip only** (login screen, top of app header). Never behind text. |
| Logo | Clear space = height of the "G" in GLOBAL on every side. Shown at its supplied colours on a white tile in dark mode until an official dark variant exists (Q-B3). | |

---

## 5. Core components

All components read tokens only. Web and mobile share names, variants and states.

### Buttons
| Variant | Light | Dark | Use |
|---|---|---|---|
| **Primary** | Navy fill, white label | Orange fill, navy-950 label | Main action per screen (Save, Submit) |
| **Accent** | Orange fill, navy label | Same | Key moment actions: *Approve*, *Acknowledge delivery*, *Confirm loading*. At most one per screen. |
| **Secondary** | Surface fill, 1 px `borderStrong`, text colour | Same tokens | Alternative actions |
| **Ghost** | Transparent, `link` colour | Same | Tertiary, table row actions |
| **Danger** | Red fill (#B4231B), white label | #FF8A80 fill, navy-950 label | Reject, Cancel shipment |

Sizes sm/md/lg = 32/40/48 px, radius 6, label 14–16 Inter 600. States: hover (step lighter), pressed (step darker), focus (2 px `focusRing` + 2 px offset), disabled (40% opacity, no pointer), loading (spinner replaces icon, width fixed).

### Inputs
40 px web / 48 px mobile; `surface` fill; 1 px `borderStrong`; radius 6; label above (`label` style); helper/error text below (`caption`). Focus = 2 px orange ring. Error = `danger` border + icon + message. Numeric inputs are right-aligned with tabular figures. Selects come from master data (brand, package, supplier), so there's less free typing (§12 Usability).

### Cards
`surface`, 1 px `border`, radius 10, padding 16 (mobile) / 20–24 (web), title `h3`. KPI cards: overline label, `display` value, delta line. An optional 3 px left bar in a status colour marks flagged items.

### Tables (follow the paper order layout, §7.2)
- Header row: `surfaceSunken`, `overline` style, currency in the Amount header ("Amount (USD)").
- Body: `body`/`bodySm`, 1 px row dividers, 44 px rows (web), zebra off, hover `primarySubtle`.
- Numbers: right-aligned, tabular figures.
- **Subtotal rows** (per truck, brand, package): `surfaceSunken`, Inter 600.
- **Grand total row**: `primarySubtle` fill, Inter 700, top border 2 px `primary`.
- On mobile, tables collapse to stacked cards (one per line/truck) with the same totals at the bottom.

### Navigation
- **Web:** left sidebar on `nav` (navy), white labels with muted section overlines; active item = `navActiveBg` + 3 px orange left indicator. Top bar on `surface` with entity switcher (UA-02 scope), search, notifications and the user menu. Logo in the sidebar on a white tile.
- **Mobile:** navy app header with the 3 px ribbon strip; bottom tab bar on `surface` (4–5 role-based tabs). Active tab = navy icon and label (light) / orange (dark) with a 3 px orange top indicator. A **sync status chip** is always visible in the header (MA-06).

### Status badges
Radius 4, `overline`-weight label 12 px, subtle background + strong text, optional leading icon.

| Group | Mapping |
|---|---|
| Approval | Draft (neutral) · Submitted (info) · Approved (success) · Returned (warning) · Rejected (danger) |
| Shipment / leg (DS-04) | Planned (neutral) · Loaded, Dispatched, In transit (info) · At border (warning) · Arrived, Acknowledged (success) · Delayed (danger) · Cancelled (neutral, strikethrough) |
| Payment | Paid (success) · Part-paid (warning) · Unpaid (danger) |
| Velocity (§9.2) | Fast ▲ (green) · Normal ● (blue) · Slow ▼ (amber) · Stagnant ■ (red) |
| ETA (TR-04) | Early (info) · On time (success) · Late +Xh (danger) |
| Sync (MA-06) | Synced (success) · Pending n (warning) · Failed (danger) |

### Charts (for §9/§10; detailed rules come with the dashboards)
Series order: navy-900, orange-500, navy-400, orange-300, neutral-500. The velocity heatmap uses the four class colours plus their labels. Only ranking and bar charts use the brand pair.

---

## 6. How the tokens get into code (after approval)
`docs/design-system/tokens.json` → moves to `packages/design-tokens/` → a build step (Style Dictionary) generates:
- `tokens.css` (CSS custom properties for `:root` and `[data-theme=dark]`) plus a Tailwind preset for web
- `tokens.ts` (typed light/dark theme objects) for React Native

A lint rule (`no-raw-colors` / Stylelint `color-no-hex` outside the tokens package) blocks hard-coded values in screens.

---

## 7. Decisions I need from you
1. Approve **navy primary / orange accent** (light) and **orange primary** (dark)?
2. Approve **Montserrat + Inter**?
3. Logo on dark backgrounds: wait for an official dark/reversed variant, or always place it on a white tile (Q-B3)?
4. Is the platform branded **BTW** as a whole (Q-B1)? This affects the app name and icon.
