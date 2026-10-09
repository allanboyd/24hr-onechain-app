"""Resolve tokens.json and check WCAG 2.2 AA contrast for every text/background pair the components use."""
import json, re, pathlib
T = json.loads(pathlib.Path(__file__).with_name('tokens.json').read_text())
def ref(v):
    m = re.fullmatch(r'\{(\w+)\.(\w+)\}', v)
    return T['color'][m[1]][m[2]] if m else v
def lum(h):
    c = [int(h[i:i+2], 16) / 255 for i in (1, 3, 5)]
    c = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
def ratio(a, b):
    a, b = lum(a), lum(b); return (max(a, b) + .05) / (min(a, b) + .05)
# (foreground, background, minimum, what)
PAIRS = [
 ('text','bg',4.5,'Body text on page'), ('text','surface',4.5,'Body text on card'),
 ('textMuted','surface',4.5,'Secondary text'), ('textSubtle','surface',4.5,'Placeholder / caption'),
 ('textMuted','surfaceSunken',4.5,'Table header text'),
 ('link','surface',4.5,'Links'), ('accentText','surface',4.5,'Orange text (accent links, overlines)'),
 ('textOnPrimary','primary',4.5,'Primary button label'), ('textOnPrimary','primaryHover',4.5,'Primary button hover'),
 ('textOnAccent','accent',4.5,'Accent button label'), ('textOnAccent','accentHover',4.5,'Accent button hover'),
 ('text','primarySubtle',4.5,'Totals row / selected row'),
 ('navText','nav',4.5,'Nav item'), ('navTextMuted','nav',4.5,'Nav section label'), ('navText','navActiveBg',4.5,'Nav active item'),
 ('navIndicator','nav',3.0,'Nav active indicator (UI)'),
 ('borderStrong','surface',3.0,'Input border (UI)'), ('focusRing','surface',3.0,'Focus ring (UI)'), ('focusRing','bg',3.0,'Focus ring on page (UI)'),
 ('success','successSubtle',4.5,'Badge: success'), ('info','infoSubtle',4.5,'Badge: info'),
 ('warning','warningSubtle',4.5,'Badge: warning'), ('danger','dangerSubtle',4.5,'Badge: danger'),
 ('textMuted','surfaceSunken',4.5,'Badge: neutral'),
 ('success','surface',4.5,'Success text'), ('danger','surface',4.5,'Error text'), ('warning','surface',4.5,'Warning text'),
 ('danger','surface',3.0,'Error input border (UI)'),
 ('textOnDanger','dangerSolid',4.5,'Danger button label'), ('tabActive','surface',4.5,'Mobile active tab label'),
]
out, fails = [], 0
for mode in ('light', 'dark'):
    th = {k: ref(v) for k, v in T['theme'][mode].items()}
    out.append(f'\n### {mode.title()} theme\n\n| Pair | Foreground | Background | Ratio | Needs | Result |\n|---|---|---|---|---|---|')
    for fg, bg, need, what in PAIRS:
        r = ratio(th[fg], th[bg]); ok = r >= need; fails += not ok
        out.append(f'| {what} | `{fg}` {th[fg]} | `{bg}` {th[bg]} | {r:.2f}:1 | {need}:1 | {"Pass" if ok else "**FAIL**"} |')
# Danger/solid fills used with white labels (light) — e.g. destructive button
extra = [('#FFFFFF', T['color']['red']['700'], 'White on danger button (light)'),
         (T['color']['navy']['950'], T['color']['red']['300'], 'Navy-950 on danger button (dark)'),
         (T['color']['navy']['900'], T['color']['yellow']['500'], 'Navy on warning solid (chart/legend chip)'),
         ('#FFFFFF', T['color']['brand']['orange']['value'], 'White on brand orange — NOT ALLOWED'),
         (T['color']['brand']['orange']['value'], '#FFFFFF', 'Brand orange on white — decorative only')]
out.append('\n### Other checked pairs\n\n| Pair | Ratio | Result |\n|---|---|---|')
for a, b, what in extra:
    r = ratio(a, b); out.append(f'| {what} ({a} on {b}) | {r:.2f}:1 | {"AA text" if r>=4.5 else "UI/large only" if r>=3 else "Fails — banned for text/UI"} |')
print('\n'.join(out)); print(f'\n<!-- failures: {fails} -->')
