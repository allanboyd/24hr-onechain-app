# BTW logo variants

All files are in `packages/ui/src/assets/brand/`. Open `docs/brand/index.html` in a browser to see every variant on white, light grey, navy and dark.

**Source:** `docs/inspiration/preffered-logo.jpeg` (1600×800 JPEG).
- Every file is derived from it by `python3 docs/brand/build_brand.py [--svg]`. The script removes the white background (keeping the soft edges), crops, and remaps colours.
- No letterforms were redrawn.
- When the client supplies a vector or larger master, replace the source and re-run the script.

## Approval status (Q-B3)
| Status | Files | Change made |
|---|---|---|
| **As supplied** | `btw-lockup*`, `btw-lockup-no-tagline*`, `btw-mark*`, `btw-horizontal*` (full colour), `btw-monogram.png` | Background removed and cropped. The horizontal version re-arranges the supplied mark and wordmark side by side. The monogram crops out the orange W and arrow. |
| **Derived — needs client approval** | `*-reversed*`, `splash-dark.png`, `app-icon-navy-1024.png`, `android-adaptive-foreground.png`, all favicons | Navy lettering turned **white** for navy or dark backgrounds; orange is unchanged |
| **Derived — needs client approval** | `*-mono-navy*`, `*-mono-white*` | Single colour, for print, embossing and stamps, or photos |

## Which file to use
| Where | File |
|---|---|
| Web sidebar (navy) | `btw-lockup-no-tagline-reversed-480w.png`, or `btw-horizontal-reversed-480w.png` when collapsed |
| Login and splash on white | `btw-lockup-480w.png` |
| Mobile header (navy, ≤ 40 px tall) | `btw-mark-reversed-480w.png` |
| PO letter and acknowledgement PDF letterhead | `btw-lockup.png` (full resolution) or `btw-lockup.svg` |
| Email header | `btw-lockup-no-tagline-480w.png` |
| Stamp, embossing, one-colour print | `btw-lockup-mono-navy.png` |
| Over photos or dark imagery | `btw-lockup-mono-white.png` |
| App launcher (Android/iOS) | `app-icon-navy-1024.png`; Android adaptive uses `android-adaptive-foreground.png` + `android-adaptive-background.png` |
| Browser tab | `favicon.ico`, `favicon-32.png`. The 16/32/48 sizes use the monogram, because the full mark is illegible that small. |
| Splash | `splash-light.png` / `splash-dark.png` |

- **Sizes:** `*-480w.png` files are 256-colour PNGs of 5–15 KB, for in-app use. Full-resolution PNGs (`btw-*.png`, 100–330 KB) and `@0.5x` are for print and PDFs. Don't ship them in app bundles.
- **SVGs:** `btw-lockup.svg` and `btw-mark.svg` are machine-traced. At normal sizes they match the PNG, but their edges are slightly softer up close and they are around 200–330 KB. Use them only where scaling matters (large print, signage). For anything critical, ask the client for the original vector.

## Rules
- **Clear space:** keep a margin equal to the height of the "G" in GLOBAL on every side.
- **Minimum size:** the full lockup is at least 120 px (or 30 mm) wide, so the tagline stays legible. Below that, use the no-tagline version. Below 60 px wide, use the mark. At 48 px and below, use the monogram.
- **Backgrounds:**
  - Full colour goes on white or light surfaces only.
  - On navy or dark surfaces use the reversed versions. Never place the full-colour version on navy: the navy letters disappear.
  - Never put any version on an orange background.
- **Colours** come from `docs/design-system/tokens.json`: navy `#062953`, orange `#FE7514`, deep orange `#DF4901`, amber `#FEA526`. Don't tint, outline, add shadows, rotate or stretch the logo, and don't re-typeset "Global Distributors".
- **Contrast:** the orange arrow on white is 2.70:1. That is acceptable for a logo, but orange is never used for text on white (see `02-design-system.md`).

## The three companies (multi-company, docs/06-multi-company-plan.md)

Each sibling company has its own kit in `packages/ui/src/assets/brand/entities/<btw|nud|kvd>/`, plus `group/` for the directors' consolidated view. Index: `entities/entities.json`. Contact sheet: [`companies.html`](companies.html). Regenerate everything with `python3 docs/brand/build_entities.py` (needs `pdftocairo` and Pillow).

| File | Use |
|---|---|
| `logo-480w.png` / `logo.png` / `logo.svg` | Light surfaces (sign-in, documents). `logo.svg` is the vector crop from the letterhead (NUD, KVD) |
| `logo-on-dark-480w.png` | Navy sidebar and dark mode (**derived**: NUD charcoal and Kivu indigo letters recoloured white; gold and red kept) |
| `mark-128.png` / `mark-on-dark-128.png` | Company chips, switcher, small spaces |
| `favicon-32.png` / `favicon.ico` | Browser tab while that company is active |
| `letterhead-{header,footer,watermark}.png` | Previews of the stationery bands; documents use the vector `apps/api/templates/letterheads/<CODE>-*.svg` |
| `brand.json` | Name, short name, colours (`primary`, `accent`, `text`, `onPrimary`, `ink` = accent text ≥ 4.5:1 on white, `inkOnDark` ≥ 4.5:1 on `#102037`), tagline, footer line, contacts, legal (KRA PIN, registration no., registered office), asset paths, contrast results |

Rules:
- Logos come straight from the client's letterheads; nothing is redrawn. Dark-surface variants are **derived** and need client approval.
- Documents (PO letter, delivery acknowledgement) are printed on the **issuing company's** letterhead: header on page 1, footer (and BTW's watermark) on every page, a slim running head on continuation pages. Samples: `samples/<CODE>-po-letter.pdf`, `samples/<CODE>-acknowledgement.pdf`, `samples/BTW-po-letter-long.pdf` (2 pages). Re-render: `cd apps/api && node -r @swc-node/register src/integrations/pdf/samples.ts [signature.png]`.
- Status colours stay shared across companies; only logo, accent and letterhead change.
- The group kit is typographic plus the three real marks — no invented group logo.

To confirm with the client: Kivu's letterhead email is `info@NihnaUnique.co.ke` (same as NUD); Kivu's legal name ("Volcanic Distributors Limited" on the letterhead vs "Kivu Volcanic Distributors Ltd" in the requirements); KRA PIN and registration numbers for all three (documents show "to confirm" until set); whether a group logo exists.
