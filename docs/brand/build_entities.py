#!/usr/bin/env python3
"""Per-company brand kits + letterhead stationery for the three sibling companies (docs/06-multi-company-plan.md).

Sources (never redrawn): docs/inspiration/{BTW GLOBAL LETTERHEAD.pdf, NIHNA.pdf, kivu.pdf}; the BTW kit reuses the
existing BTW assets (same logo, transparent). Needs poppler-utils (pdftocairo) and Pillow.

Outputs
  packages/ui/src/assets/brand/entities/<btw|nud|kvd|group>/
      logo.png  logo.svg (vector crop, NUD/KVD)  logo-480w.png  logo-on-dark-480w.png (derived)
      mark.png  mark-128.png  mark-on-dark-128.png (derived)  favicon-32.png  favicon.ico  brand.json
  packages/ui/src/assets/brand/entities/entities.json      index of all brand.json
  apps/api/templates/letterheads/<CODE>.svg                 full stationery page (vector, from the source PDF)
Run:  python3 docs/brand/build_entities.py
"""
import glob, json, os, shutil, subprocess, tempfile
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
SRC = os.path.join(ROOT, 'docs/inspiration')
BRAND = os.path.join(ROOT, 'packages/ui/src/assets/brand')
OUT = os.path.join(BRAND, 'entities')
LH = os.path.join(ROOT, 'apps/api/templates/letterheads')
NAVY = (6, 41, 83)
PDF = {'BTW': 'BTW GLOBAL LETTERHEAD.pdf', 'NUD': 'NIHNA.pdf', 'KVD': 'kivu.pdf'}
FONT = (glob.glob(os.path.join(ROOT, 'node_modules/.pnpm/@fontsource-variable+montserrat*/node_modules/@fontsource-variable/montserrat/files/montserrat-latin-wght-normal.woff2')) or ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'])[0]

# ---------------------------------------------------------------- colour helpers (WCAG)
def lum(hexc):
    c = [int(hexc[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    c = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
def contrast(a, b):
    la, lb = sorted([lum(a), lum(b)], reverse=True)
    return (la + 0.05) / (lb + 0.05)
DARK = '#102037'  # design-system dark surface
def lighten_to(hexc, bg=DARK, target=4.5):
    r, g, b = (int(hexc[i:i + 2], 16) for i in (1, 3, 5))
    for k in [x / 100 for x in range(0, 101)]:
        h = '#%02X%02X%02X' % (round(r + (255 - r) * k), round(g + (255 - g) * k), round(b + (255 - b) * k))
        if contrast(h, bg) >= target: return h
    return '#FFFFFF'
def darken_to(hexc, bg='#FFFFFF', target=4.5):
    """Same hue, darker until text on bg passes `target`."""
    r, g, b = (int(hexc[i:i + 2], 16) for i in (1, 3, 5))
    for k in [x / 100 for x in range(100, 0, -1)]:
        h = '#%02X%02X%02X' % (int(r * k), int(g * k), int(b * k))
        if contrast(h, bg) >= target: return h
    return '#000000'

# ---------------------------------------------------------------- company facts (from the letterheads)
COMMON = dict(address=['P.O Box 18051 - 00100 Nairobi, Kenya', 'Elgeyo Marakwet Road, Elgeyo Garden'], phones=['+254 707 617 460', '+254 701 570 356'])
FACTS = {
    'BTW': dict(name='BTW Global Distributors Ltd', shortName='BTW Global', tagline='Your global supply partner',
                footerLine='People · Products · Partnerships · Progress', email='info@btwglobal.co.ke',
                colors=dict(primary='#062953', accent='#FE7514', text='#0B1B33', onPrimary='#FFFFFF'), **COMMON),
    'NUD': dict(name='Nihna Unique Distributors Ltd', shortName='Nihna Unique', tagline='Distributors, Transporters & Manufacturers',
                footerLine='Distributors, Transporters & Manufacturers', email='info@NihnaUnique.co.ke',
                colors=dict(primary='#414142', accent='#C4982B', text='#1F1F20', onPrimary='#FFFFFF'),
                address=['P.O. Box 18051 - 00100 Nairobi, Kenya'], phones=COMMON['phones']),
    'KVD': dict(name='Volcanic Distributors Limited', shortName='Kivu', tagline='Manufacturers · Transporters · Distributors · Importers · Exporters',
                footerLine='Manufacturers · Transporters · Distributors · Importers · Exporters', email='info@NihnaUnique.co.ke',
                colors=dict(primary='#2E3092', accent='#ED1C24', text='#1B1C55', onPrimary='#FFFFFF'),
                notes=['Letterhead email is info@NihnaUnique.co.ke (same as NUD) — confirm with client.',
                       'Requirements call the company "Kivu Volcanic Distributors Ltd"; the letterhead says "Volcanic Distributors Limited" — confirm legal name.'],
                **COMMON),
    'GROUP': dict(name='BTW Group — all companies', shortName='Group', tagline='BTW Global · Nihna Unique · Kivu',
                  footerLine='Consolidated view of BTW Global Distributors, Nihna Unique Distributors and Volcanic Distributors (Kivu)',
                  email='', address=[], phones=[],
                  colors=dict(primary='#172A45', accent='#66768C', text='#0B1B33', onPrimary='#FFFFFF'),
                  notes=['Typographic group mark only (no invented logo). Ask the client whether a group logo exists.']),
}
LEGAL = {c: {'kraPin': None, 'registrationNo': None, 'registeredOffice': 'Elgeyo Marakwet Road, Elgeyo Garden, Nairobi' if c != 'GROUP' else None} for c in FACTS}
# Letterhead parts in PDF points (y0, y1) on the A4 source page (595 × 842 pt): header, footer, watermark (None = none).
PARTS = {'BTW': {'header': (0, 118), 'footer': (735, 842), 'watermark': (290, 525)},
         'NUD': {'header': (0, 110), 'footer': (760, 842), 'watermark': None},
         'KVD': {'header': (0, 92), 'footer': (776, 842), 'watermark': None}}
# Logo crops in PDF points (x0, y0, x1, y1) — measured on the source letterheads.
CROPS = {'NUD': {'logo': (22, 21, 556, 103), 'mark': (22, 21, 118, 103)}, 'KVD': {'logo': (40, 32, 147, 84), 'mark': (40, 32, 147, 84)}}

# ---------------------------------------------------------------- image helpers
def svg_crop(full_svg, box, out_svg):
    """pdftocairo -svg ignores -x/-y/-W/-H, so cut a region of the full-page SVG with its viewBox (outside is clipped)."""
    import re
    x0, y0, x1, y1 = box
    src = open(full_svg).read()
    tag = re.search(r'<svg[^>]*>', src).group(0)
    new = re.sub(r'width="[^"]*"', f'width="{x1 - x0:.2f}pt"', tag)
    new = re.sub(r'height="[^"]*"', f'height="{y1 - y0:.2f}pt"', new)
    new = re.sub(r'viewBox="[^"]*"', f'viewBox="{x0:.2f} {y0:.2f} {x1 - x0:.2f} {y1 - y0:.2f}"', new)
    open(out_svg, 'w').write(src.replace(tag, new, 1))

def full_svg(pdf, out_svg):
    subprocess.run(['pdftocairo', '-svg', pdf, out_svg], check=True)

def crop_pdf(pdf, box, dpi, out_png, out_svg=None, trim=True):
    x0, y0, x1, y1 = box; k = dpi / 72
    base = out_png[:-4]
    subprocess.run(['pdftocairo', '-png', '-transp', '-r', str(dpi), '-singlefile', '-x', str(int(x0 * k)), '-y', str(int(y0 * k)),
                    '-W', str(int((x1 - x0) * k)), '-H', str(int((y1 - y0) * k)), pdf, base], check=True)
    if out_svg:
        tmp_svg = out_svg + '.full.svg'; full_svg(pdf, tmp_svg); svg_crop(tmp_svg, box, out_svg); os.remove(tmp_svg)
    im = Image.open(out_png).convert('RGBA')
    if trim: im = im.crop(im.getbbox()); im.save(out_png)
    return im

def fit_w(im, w):
    im = im.copy(); h = round(im.height * w / im.width); return im.resize((w, h), Image.LANCZOS)

def square(im, size, pad=0.1, bg=None):
    s = Image.new('RGBA', (size, size), bg or (0, 0, 0, 0)); inner = int(size * (1 - 2 * pad))
    t = im.copy(); t.thumbnail((inner, inner), Image.LANCZOS)
    s.alpha_composite(t, ((size - t.width) // 2, (size - t.height) // 2)); return s

def recolor(im, test, to=(255, 255, 255)):
    """Derived artwork: pixels matching `test(r,g,b)` become `to` (alpha kept) — used for dark-surface variants only."""
    im = im.convert('RGBA'); px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a and test(r, g, b): px[x, y] = (*to, a)
    return im

def favicons(mark_on_tile, d):
    mark_on_tile.resize((32, 32), Image.LANCZOS).save(os.path.join(d, 'favicon-32.png'))
    mark_on_tile.save(os.path.join(d, 'favicon.ico'), sizes=[(16, 16), (32, 32), (48, 48)])

def tile(im, size, fill):
    """Mark centred on a rounded tile (favicons / app chips)."""
    t = Image.new('RGBA', (size, size), (0, 0, 0, 0)); ImageDraw.Draw(t).rounded_rectangle((0, 0, size - 1, size - 1), radius=size // 5, fill=fill)
    m = im.copy(); m.thumbnail((int(size * .8), int(size * .8)), Image.LANCZOS)
    t.alpha_composite(m, ((size - m.width) // 2, (size - m.height) // 2)); return t

# ---------------------------------------------------------------- build
def build():
    os.makedirs(OUT, exist_ok=True); os.makedirs(LH, exist_ok=True)
    tmp = tempfile.mkdtemp()
    index = []
    for code in ['BTW', 'NUD', 'KVD', 'GROUP']:
        d = os.path.join(OUT, code.lower()); os.makedirs(d, exist_ok=True)
        f = FACTS[code]
        if code == 'BTW':
            logo = Image.open(os.path.join(BRAND, 'btw-lockup.png')).convert('RGBA')
            dark = Image.open(os.path.join(BRAND, 'btw-lockup-reversed.png')).convert('RGBA')
            mark = Image.open(os.path.join(BRAND, 'btw-mark.png')).convert('RGBA')
            mark_dark = Image.open(os.path.join(BRAND, 'btw-mark-reversed.png')).convert('RGBA')
            shutil.copy(os.path.join(BRAND, 'btw-lockup.svg'), os.path.join(d, 'logo.svg'))
            fav = Image.open(os.path.join(BRAND, 'favicon-512.png')).convert('RGBA')
        elif code in CROPS:
            pdf = os.path.join(SRC, PDF[code])
            logo = crop_pdf(pdf, CROPS[code]['logo'], 600, os.path.join(tmp, f'{code}-logo.png'), os.path.join(d, 'logo.svg'))
            mark = crop_pdf(pdf, CROPS[code]['mark'], 600, os.path.join(tmp, f'{code}-mark.png'))
            if code == 'NUD':   # charcoal letters → white; gold and silver ring kept
                dk = lambda r, g, b: max(r, g, b) < 110 and max(r, g, b) - min(r, g, b) < 18
            else:               # KVD: indigo letters and caption → white; red kept
                dk = lambda r, g, b: b > 90 and r < 110 and b > r + 40
            dark, mark_dark = recolor(logo, dk), recolor(mark, dk)
            fav = tile(mark, 512, (255, 255, 255, 255))
        else:  # GROUP: the three real company marks side by side + a typographic caption (no invented logo)
            marks = [Image.open(os.path.join(OUT, c, 'mark.png')).convert('RGBA') for c in ('btw', 'nud', 'kvd')]
            marks_d = [Image.open(os.path.join(OUT, c, 'mark-on-dark.png')).convert('RGBA') for c in ('btw', 'nud', 'kvd')]
            def strip(ms, ink):
                H = 220; scaled = [m.resize((round(m.width * H / m.height), H), Image.LANCZOS) for m in ms]
                gap = 70; W = sum(s.width for s in scaled) + gap * 2
                font = ImageFont.truetype(FONT, 64); font.set_variation_by_axes([700]) if FONT.endswith('woff2') else None
                cap = 'GROUP · ALL COMPANIES'
                tw = ImageDraw.Draw(Image.new('RGBA', (1, 1))).textlength(cap, font=font)
                im = Image.new('RGBA', (max(W, int(tw) + 20), H + 110), (0, 0, 0, 0)); x = (im.width - W) // 2
                for i, s in enumerate(scaled):
                    im.alpha_composite(s, (x, 0)); x += s.width + gap
                ImageDraw.Draw(im).text(((im.width - tw) / 2, H + 26), cap, font=font, fill=ink)
                return im
            logo, dark = strip(marks, (23, 42, 69, 255)), strip(marks_d, (255, 255, 255, 255))
            font = ImageFont.truetype(FONT, 300)
            if FONT.endswith('woff2'): font.set_variation_by_axes([800])
            mark = Image.new('RGBA', (512, 512), (0, 0, 0, 0)); dr = ImageDraw.Draw(mark)
            dr.rounded_rectangle((0, 0, 511, 511), radius=100, fill=(23, 42, 69, 255))
            bb = dr.textbbox((0, 0), '3', font=font); dr.text(((512 - (bb[2] - bb[0])) / 2 - bb[0], (512 - (bb[3] - bb[1])) / 2 - bb[1]), '3', font=font, fill=(255, 255, 255, 255))
            mark_dark, fav = mark, mark
        logo.save(os.path.join(d, 'logo.png')); fit_w(logo, 480).save(os.path.join(d, 'logo-480w.png'), optimize=True)
        fit_w(dark, 480).save(os.path.join(d, 'logo-on-dark-480w.png'), optimize=True)
        mark.save(os.path.join(d, 'mark.png')); mark_dark.save(os.path.join(d, 'mark-on-dark.png'))
        square(mark, 128).save(os.path.join(d, 'mark-128.png')); square(mark_dark, 128).save(os.path.join(d, 'mark-on-dark-128.png'))
        favicons(fav, d)
        c = dict(f['colors'])
        # ink = accent darkened until text passes 4.5:1 on white; inkOnDark = accent lightened until it passes on the dark surface
        c['ink'] = c['accent'] if contrast(c['accent'], '#FFFFFF') >= 4.5 else darken_to(c['accent'])
        c['inkOnDark'] = lighten_to(c['accent'], DARK)
        checks = {'primary on white': round(contrast(c['primary'], '#FFFFFF'), 2), 'onPrimary on primary': round(contrast(c['onPrimary'], c['primary']), 2),
                  'accent on white (graphics ≥3)': round(contrast(c['accent'], '#FFFFFF'), 2), 'ink on white (text ≥4.5)': round(contrast(c['ink'], '#FFFFFF'), 2),
                  f'inkOnDark on {DARK} (text ≥4.5)': round(contrast(c['inkOnDark'], DARK), 2), 'text on white': round(contrast(c['text'], '#FFFFFF'), 2)}
        rel = lambda n: f'entities/{code.lower()}/{n}'
        brand = {
            'code': code, 'name': f['name'], 'shortName': f['shortName'], 'colors': c, 'tagline': f['tagline'], 'footerLine': f['footerLine'],
            'address': f['address'], 'phones': f['phones'], 'email': f['email'],
            'assets': {'logo': rel('logo-480w.png'), 'logoFull': rel('logo.png'), 'logoSvg': rel('logo.svg') if os.path.exists(os.path.join(d, 'logo.svg')) else None,
                       'logoDark': rel('logo-on-dark-480w.png'), 'mark': rel('mark-128.png'), 'markDark': rel('mark-on-dark-128.png'),
                       'favicon': rel('favicon-32.png'), 'faviconIco': rel('favicon.ico'),
                       'letterhead': ({'page': f'apps/api/templates/letterheads/{code}.svg',
                                       **{p: ({'svg': f'apps/api/templates/letterheads/{code}-{p}.svg', 'png': rel(f'letterhead-{p}.png'), 'yPt': PARTS[code][p]} if PARTS[code][p] else None) for p in ('header', 'footer', 'watermark')}}
                                      if code in PDF else None)},
            'legal': LEGAL[code],
            'derived': ['logo-on-dark-480w.png', 'mark-on-dark.png', 'mark-on-dark-128.png'] + (['favicon (mark on tile)'] if code != 'GROUP' else ['all (typographic group kit)']),
            'contrast': checks, 'notes': f.get('notes', []),
        }
        json.dump(brand, open(os.path.join(d, 'brand.json'), 'w'), indent=2)
        index.append(brand)
        if code in PDF:  # stationery straight from the source PDF (vector): full page + header / footer / watermark bands
            src = os.path.join(SRC, PDF[code])
            page_svg = os.path.join(LH, f'{code}.svg'); full_svg(src, page_svg)
            import re
            pw = float(re.search(r'viewBox="0 0 ([0-9.]+)', open(page_svg).read()).group(1))
            for part, band in PARTS[code].items():
                if not band: continue
                y0, y1 = band
                svg_crop(page_svg, (0, y0, pw, y1), os.path.join(LH, f'{code}-{part}.svg'))
                crop_pdf(src, (0, y0, 595.3, y1), 200, os.path.join(d, f'letterhead-{part}.png'), trim=False)
        print(code, 'ok', checks)
    json.dump({'companies': [b['code'] for b in index if b['code'] != 'GROUP'], 'group': 'GROUP', 'brands': index}, open(os.path.join(OUT, 'entities.json'), 'w'), indent=2)
    shutil.rmtree(tmp)

def contact_sheet():
    """docs/brand/companies.html — every company kit on white, light grey, navy and dark, plus letterhead parts and sample PDFs."""
    idx = json.load(open(os.path.join(OUT, 'entities.json')))
    A = lambda p: '../../packages/ui/src/assets/brand/' + p
    surf = [('White', '#FFFFFF', 'logo'), ('Light grey', '#EEF1F6', 'logo'), ('Navy sidebar', '#062953', 'logoDark'), ('Dark mode', '#08121F', 'logoDark')]
    rows = []
    for b in idx['brands']:
        a = b['assets']; c = b['colors']
        cells = ''.join(f'<figure style="background:{bg}"><img src="{A(a[k])}" alt="{b["shortName"]} logo on {n}"><figcaption>{n}{" · derived" if k == "logoDark" and b["code"] != "BTW" else ""}</figcaption></figure>' for n, bg, k in surf)
        marks = f'<img class="mk" src="{A(a["mark"])}" alt=""><img class="mk dk" src="{A(a["markDark"])}" alt=""><img class="fv" src="{A(a["favicon"])}" alt="">'
        sw = ''.join(f'<span class="sw"><i style="background:{v}"></i>{k} {v}</span>' for k, v in c.items())
        lh = a.get('letterhead') or {}
        parts = ''.join(f'<img class="lh" src="{A(p["png"])}" alt="{b["shortName"]} letterhead {n}">' for n, p in ((n, lh.get(n)) for n in ('header', 'footer', 'watermark')) if p)
        samples = f'<p class="small">Samples: <a href="samples/{b["code"]}-po-letter.pdf">PO letter</a> · <a href="samples/{b["code"]}-acknowledgement.pdf">delivery acknowledgement</a></p>' if lh else ''
        notes = ''.join(f'<li>{n}</li>' for n in b.get('notes', []))
        legal = b.get('legal', {})
        rows.append(f"""<section><h2>{b['name']} <small>{b['code']}</small></h2>
<p class="small">{b['tagline']}{(' · ' + ', '.join(b['address']) + ' · ' + ' · '.join(b['phones']) + ' · ' + b['email'] + '<br>KRA PIN: ' + (legal.get('kraPin') or '<b class="tc">to confirm</b>') + ' · Reg. No.: ' + (legal.get('registrationNo') or '<b class="tc">to confirm</b>')) if b['address'] else ''}</p>
<div class="grid">{cells}</div><div class="row">{marks}<div class="sws">{sw}</div></div>{parts and '<div class="lhs">' + parts + '</div>'}{samples}{notes and '<ul class="small">' + notes + '</ul>'}</section>""")
    html = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Company Brand Kits</title>
<style>body{{margin:0;padding:24px;font:14px/1.45 Inter,system-ui,sans-serif;color:#0B1B33;background:#F6F8FB}}h1{{font:800 26px Montserrat,Inter,sans-serif;color:#062953;margin:0 0 4px}}h2{{font:700 18px Montserrat,Inter,sans-serif;margin:28px 0 4px}}h2 small{{font:600 12px Inter;color:#66768C}}
.small{{font-size:12.5px;color:#4A5A70}}.tc{{color:#B4231B}}.grid{{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}}figure{{margin:0;border:1px solid #CBD3DF;border-radius:8px;padding:18px 12px 8px;display:flex;flex-direction:column;align-items:center;gap:8px;min-height:120px;justify-content:space-between}}
figure img{{max-width:100%;max-height:80px}}figcaption{{font-size:11px;color:#8593A8}}.row{{display:flex;align-items:center;gap:12px;margin:10px 0;flex-wrap:wrap}}.mk{{width:64px;height:64px;border:1px solid #CBD3DF;border-radius:8px;background:#fff}}.mk.dk{{background:#062953}}.fv{{width:32px;height:32px}}
.sws{{display:flex;flex-wrap:wrap;gap:6px 14px;font:12px ui-monospace,monospace;color:#33435A}}.sw i{{display:inline-block;width:14px;height:14px;border-radius:3px;vertical-align:-2px;margin-right:4px;border:1px solid #CBD3DF}}.lhs{{display:grid;gap:6px;max-width:640px}}.lh{{width:100%;border:1px solid #CBD3DF;background:#fff}}
@media(max-width:800px){{.grid{{grid-template-columns:repeat(2,minmax(0,1fr))}}}}</style></head><body>
<h1>Company brand kits</h1><p class="small">BTW Global Distributors, Nihna Unique Distributors and Volcanic Distributors (Kivu), plus the group view. Built by <code>docs/brand/build_entities.py</code> from the letterheads in <code>docs/inspiration/</code>; nothing redrawn. Variants marked <b>derived</b> change colours for dark surfaces and need client approval.</p>
{''.join(rows)}</body></html>"""
    open(os.path.join(os.path.dirname(__file__), 'companies.html'), 'w').write(html)

if __name__ == '__main__':
    build()
    contact_sheet()
