"""Derive every logo variant from the supplied source (docs/inspiration/preffered-logo.jpeg).

Nothing is redrawn: the white background is removed by un-mixing white (which keeps the anti-aliased
edges), then crops and colour maps are applied. Re-run whenever the client sends a better master
(an SVG or a larger PNG):

    python3 docs/brand/build_brand.py            # needs Pillow + numpy
    python3 docs/brand/build_brand.py --svg      # also vectorises with vtracer (pip install vtracer)

Output: packages/ui/src/assets/brand/  (see docs/brand/README.md for usage)
"""
import os, sys, json
import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(ROOT, 'docs/inspiration/preffered-logo.jpeg')
OUT = os.path.join(ROOT, 'packages/ui/src/assets/brand')
TOK = json.load(open(os.path.join(ROOT, 'docs/design-system/tokens.json')))
NAVY = (6, 41, 83)          # brand.navy
NAVY950 = (4, 21, 43)       # navy.950 (dark surfaces)
WHITE = (255, 255, 255)
os.makedirs(OUT, exist_ok=True)

# Row bands measured on the 1600x800 source: mark (BTW + arrow), wordmark, tagline.
MARK_ROWS, WORD_ROWS, TAG_ROWS = (68, 510), (542, 610), (649, 681)


def unmix_white(rgb):
    """RGB on white → straight-alpha RGBA. alpha = how far the darkest channel is from white."""
    f = rgb.astype(np.float64)
    a = (255.0 - f.min(axis=2)) / 255.0
    a = np.clip((a - 0.04) / 0.96, 0, 1)              # drop JPEG noise in the paper white
    safe = np.where(a > 1e-3, a, 1)[..., None]
    c = np.clip((f - (1 - a[..., None]) * 255.0) / safe, 0, 255)
    return np.dstack([c, a * 255]).round().astype(np.uint8)


def trim(rgba, pad=0):
    ys, xs = np.where(rgba[..., 3] > 8)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    out = rgba[y0:y1, x0:x1]
    if pad:
        h, w = out.shape[:2]
        canvas = np.zeros((h + 2 * pad, w + 2 * pad, 4), np.uint8)
        canvas[pad:pad + h, pad:pad + w] = out
        out = canvas
    return out


def is_navy(rgba):
    """Navy ink is blue-dominant; the ribbon/arrow is red-dominant orange."""
    r, b = rgba[..., 0].astype(int), rgba[..., 2].astype(int)
    return b > r


def recolor(rgba, navy_to=None, orange_to=None):
    out = rgba.copy()
    m = is_navy(rgba)
    if navy_to is not None: out[m, :3] = navy_to
    if orange_to is not None: out[~m, :3] = orange_to
    return out


def mono(rgba, color):
    """One colour: the gradient highlights in the ribbon have lower alpha after un-mixing; lift them so the
    shape reads solid (edges keep their anti-aliasing)."""
    out = rgba.copy(); out[..., :3] = color
    out[..., 3] = np.clip(out[..., 3].astype(float) / 0.82, 0, 255).astype(np.uint8)
    return out


def save(arr, name, scale=1.0):
    im = Image.fromarray(arr, 'RGBA')
    if scale != 1.0: im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
    im.save(os.path.join(OUT, name), optimize=True)
    return im


def tile(mark_rgba, size, bg, mark_width=0.78, radius=0.0, alpha_bg=True):
    """Square tile with the mark centred at `mark_width` of the tile width."""
    im = Image.new('RGBA', (size, size), bg + ((255,) if alpha_bg else ()))
    m = Image.fromarray(mark_rgba, 'RGBA')
    w = round(size * mark_width); h = round(m.height * w / m.width)
    m = m.resize((w, h), Image.LANCZOS)
    im.alpha_composite(m, ((size - w) // 2, (size - h) // 2))
    if radius:
        mask = Image.new('L', (size, size), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], round(size * radius), fill=255)
        im.putalpha(mask)
    return im


def main():
    src = np.asarray(Image.open(SRC).convert('RGB'))
    rgba = unmix_white(src)
    full = trim(rgba)
    no_tag = trim(rgba[:TAG_ROWS[0] - 10])
    mark = trim(rgba[MARK_ROWS[0] - 4:MARK_ROWS[1] + 4])
    # Monogram: the orange W + arrow only (navy letters masked out). Used where the full mark is unreadable (≤48 px).
    w_crop = rgba[MARK_ROWS[0] - 4:MARK_ROWS[1] + 4, 860:1410].copy()
    w_crop[is_navy(w_crop), 3] = 0
    monogram = trim(w_crop)
    word = trim(rgba[WORD_ROWS[0] - 4:WORD_ROWS[1] + 4])

    # Horizontal compact: mark + wordmark on the right, wordmark cap height ≈ 30% of mark height.
    mk = Image.fromarray(mark, 'RGBA'); wd = Image.fromarray(word, 'RGBA')
    wh = round(mk.height * 0.24); ww = round(wd.width * wh / wd.height)
    wd2 = wd.resize((ww, wh), Image.LANCZOS)
    gap = round(mk.height * 0.18)
    horiz_im = Image.new('RGBA', (mk.width + gap + ww, mk.height), (0, 0, 0, 0))
    horiz_im.alpha_composite(mk, (0, 0))
    horiz_im.alpha_composite(wd2, (mk.width + gap, round(mk.height * 0.62 - wh / 2)))
    horiz = np.asarray(horiz_im)

    variants = {'lockup': full, 'lockup-no-tagline': no_tag, 'mark': mark, 'horizontal': horiz}
    save(monogram, 'btw-monogram.png'); save(mono(monogram, WHITE), 'btw-monogram-mono-white.png')
    for name, arr in variants.items():
        save(arr, f'btw-{name}.png')                               # native resolution (from the 1600px source)
        save(arr, f'btw-{name}@0.5x.png', 0.5)
        for suffix, a in (('', arr), ('-reversed', recolor(arr, navy_to=WHITE))):   # UI size: 480 px wide (≈ 240 css px @2x)
            im = Image.fromarray(a, 'RGBA'); im = im.resize((480, round(im.height * 480 / im.width)), Image.LANCZOS)
            # 256-colour palette PNG: visually identical at this size, ~5x smaller.
            im.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).save(os.path.join(OUT, f'btw-{name}{suffix}-480w.png'), optimize=True)
        save(recolor(arr, navy_to=WHITE), f'btw-{name}-reversed.png')          # DERIVED: dark/navy surfaces
        save(mono(arr, NAVY), f'btw-{name}-mono-navy.png')                     # DERIVED: one-colour print
        save(mono(arr, WHITE), f'btw-{name}-mono-white.png')                   # DERIVED: one-colour on photos/dark

    rev_mark = recolor(mark, navy_to=WHITE)
    # App icons
    tile(rev_mark, 1024, NAVY, 0.80, alpha_bg=False).convert('RGB').save(os.path.join(OUT, 'app-icon-navy-1024.png'))
    tile(mark, 1024, WHITE, 0.80, alpha_bg=False).convert('RGB').save(os.path.join(OUT, 'app-icon-white-1024.png'))
    # Android adaptive: 432dp canvas, keep the mark inside the 264dp safe circle (61%).
    fg = Image.new('RGBA', (1080, 1080), (0, 0, 0, 0))
    m = Image.fromarray(rev_mark, 'RGBA'); w = round(1080 * 0.58); h = round(m.height * w / m.width)
    fg.alpha_composite(m.resize((w, h), Image.LANCZOS), ((1080 - w) // 2, (1080 - h) // 2))
    fg.save(os.path.join(OUT, 'android-adaptive-foreground.png'))
    Image.new('RGB', (1080, 1080), NAVY).save(os.path.join(OUT, 'android-adaptive-background.png'))
    # Favicons: rounded navy tile. ≥180 px shows the full mark; ≤48 px the monogram (the full mark is illegible that small).
    icon = tile(rev_mark, 512, NAVY, 0.84, radius=0.18)
    small = tile(monogram, 512, NAVY, 0.80, radius=0.18)
    for size in (180, 192, 512):
        icon.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, f'favicon-{size}.png'))
    for size in (16, 32, 48):
        small.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, f'favicon-{size}.png'))
    small.save(os.path.join(OUT, 'favicon.ico'), sizes=[(16, 16), (32, 32), (48, 48)])
    # Splash screens (2732² so every device crops from the centre)
    for name, bg, art in (('splash-light', WHITE, full), ('splash-dark', NAVY950, recolor(full, navy_to=WHITE))):
        sp = Image.new('RGB', (2732, 2732), bg)
        a = Image.fromarray(art, 'RGBA'); w = 1100; h = round(a.height * w / a.width)
        sp.paste(a.resize((w, h), Image.LANCZOS), ((2732 - w) // 2, (2732 - h) // 2), a.resize((w, h), Image.LANCZOS))
        sp.save(os.path.join(OUT, f'{name}.png'), optimize=True)

    if '--svg' in sys.argv:
        import vtracer, tempfile
        for name, arr in (('lockup', full), ('mark', mark)):
            # Flatten onto white for tracing, then drop the white background path.
            flat = Image.new('RGB', (arr.shape[1] + 40, arr.shape[0] + 40), WHITE)
            flat.paste(Image.fromarray(arr, 'RGBA'), (20, 20), Image.fromarray(arr, 'RGBA'))
            tmp = tempfile.mktemp(suffix='.png'); flat.save(tmp)
            out = os.path.join(OUT, f'btw-{name}.svg')
            vtracer.convert_image_to_svg_py(tmp, out, colormode='color', hierarchical='stacked', mode='spline',
                                            filter_speckle=6, color_precision=7, layer_difference=12,
                                            corner_threshold=60, length_threshold=4.0, splice_threshold=45, path_precision=3)
            svg = open(out).read()
            import re
            # vtracer's first path is the full-canvas (near-white) background: drop it; add a viewBox so it scales.
            svg = re.sub(r'<path [^>]*/>', '', svg, count=1)
            svg = re.sub(r'<svg ([^>]*)width="(\d+)" height="(\d+)"', r'<svg \1viewBox="0 0 \2 \3" width="\2" height="\3"', svg, count=1)
            open(out, 'w').write(svg)
    print('brand assets →', OUT)
    for f in sorted(os.listdir(OUT)): print(f'  {f:44s} {os.path.getsize(os.path.join(OUT, f)) / 1024:7.1f} KB')


if __name__ == '__main__':
    main()
