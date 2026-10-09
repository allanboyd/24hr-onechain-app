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
