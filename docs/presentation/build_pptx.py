# Builds BTW-Platform-Overview.pptx (editable PowerPoint) from the content below.
# Run: python3 docs/presentation/build_pptx.py   (needs python-pptx and Pillow)
# Layout is drawn on a 1920x1080 grid; px() converts to EMU, font sizes are px/2 in points.
import math
import os
from pptx import Presentation
from pptx.util import Emu, Pt
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE, MSO_CONNECTOR
from pptx.enum.dml import MSO_LINE
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.oxml.ns import qn
from lxml import etree
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
A = lambda n: os.path.join(HERE, 'assets', n)
OUT = os.path.join(HERE, 'BTW-Platform-Overview.pptx')

NAVY, NAVY2, ORANGE, ORT = '062953', '0B3A70', 'FE7514', 'B83A00'
LIGHT, INK, MUTED, PALE, WHITE = 'F6F8FB', '0B1B33', '4A5A70', 'C9D6E8', 'FFFFFF'
LINE, TINT, OTINT = 'E3E8F0', 'EAF0F8', 'FFF1E6'
HEAD, BODY, MONO = 'Montserrat', 'Inter', 'Consolas'
C, M, B = PP_ALIGN.CENTER, MSO_ANCHOR.MIDDLE, MSO_ANCHOR.BOTTOM

px = lambda v: Emu(int(v * 6350))
rgb = lambda h: RGBColor.from_string(h)

prs = Presentation()
prs.slide_width, prs.slide_height = px(1920), px(1080)
BLANK = prs.slide_layouts[6]


# ---------- drawing helpers ----------
def shape(s, kind, x, y, w, h, fill=None, line=None, lw=3, radius=None, dash=False):
    sh = s.shapes.add_shape(kind, px(x), px(y), px(w), px(h))
    if fill:
        sh.fill.solid(); sh.fill.fore_color.rgb = rgb(fill)
    else:
        sh.fill.background()
    if line:
        sh.line.color.rgb = rgb(line); sh.line.width = px(lw)
        if dash: sh.line.dash_style = MSO_LINE.DASH
    else:
        sh.line.fill.background()
    if radius is not None and kind == MSO_SHAPE.ROUNDED_RECTANGLE:
        sh.adjustments[0] = radius
    sh.shadow.inherit = False
    return sh


def rect(s, x, y, w, h, fill, line=None, lw=3, r=None, dash=False):
    return shape(s, MSO_SHAPE.ROUNDED_RECTANGLE if r is not None else MSO_SHAPE.RECTANGLE, x, y, w, h, fill, line, lw, r, dash)


def dot(s, x, y, d, color, line=None):
    return shape(s, MSO_SHAPE.OVAL, x, y, d, d, color, line)


def text(s, x, y, w, h, runs, size=28, color=INK, font=BODY, bold=False, align=PP_ALIGN.LEFT,
         anchor=MSO_ANCHOR.TOP, spacing=1.15, after=0):
    """runs: a string, or a list of paragraphs; each paragraph is a string or (string, overrides dict)."""
    tb = s.shapes.add_textbox(px(x), px(y), px(w), px(h))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = anchor
    paras = runs if isinstance(runs, list) else [runs]
    for i, p in enumerate(paras):
        t, o = (p, {}) if isinstance(p, str) else p
        para = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        para.alignment = o.get('align', align)
        para.line_spacing = o.get('spacing', spacing)
        para.space_after = Pt(o.get('after', after) / 2)
        r = para.add_run(); r.text = t
        f = r.font
        f.size = Pt(o.get('size', size) / 2); f.bold = o.get('bold', bold)
        f.name = o.get('font', font); f.color.rgb = rgb(o.get('color', color))
    return tb


def lines_for(t, w, size, k=0.55):
    return max(1, math.ceil(len(t) * size * k / max(w, 1)))


def image(s, path, x, y, w=None, h=None):
    iw, ih = Image.open(path).size
    if w and not h: h = w * ih / iw
    if h and not w: w = h * iw / ih
    return s.shapes.add_picture(path, px(x), px(y), px(w), px(h))


def fit_image(s, path, x, y, bw, bh):
    iw, ih = Image.open(path).size
    k = min(bw / iw, bh / ih)
    return image(s, path, x + (bw - iw * k) / 2, y + (bh - ih * k) / 2, iw * k, ih * k)


def arrow(s, x1, y1, x2, y2, color=ORANGE, w=4, dash=False, elbow=False):
    c = s.shapes.add_connector(MSO_CONNECTOR.ELBOW if elbow else MSO_CONNECTOR.STRAIGHT, px(x1), px(y1), px(x2), px(y2))
    c.line.color.rgb = rgb(color); c.line.width = px(w)
    if dash: c.line.dash_style = MSO_LINE.DASH
    ln = c.line._get_or_add_ln()
    tail = etree.SubElement(ln, qn('a:tailEnd')); tail.set('type', 'triangle'); tail.set('w', 'med'); tail.set('h', 'med')
    return c


def bullets(s, x, y, w, items, size=30, gap=20, color=INK, mark=None, h=None):
    """Native PowerPoint bullets: one text box, one paragraph per item, so wrapping and spacing stay even."""
    tb = s.shapes.add_textbox(px(x), px(y), px(w), px(h or 1000 - y))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    for i, t in enumerate(items):
        para = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        para.line_spacing = 1.1
        para.space_after = Pt(gap / 2)
        pPr = para._p.get_or_add_pPr()
        pPr.set('marL', str(px(40))); pPr.set('indent', str(-px(40)))
        clr = etree.SubElement(pPr, qn('a:buClr')); etree.SubElement(clr, qn('a:srgbClr')).set('val', ORANGE)
        if mark:
            etree.SubElement(pPr, qn('a:buFont')).set('typeface', HEAD)
            etree.SubElement(pPr, qn('a:buChar')).set('char', mark)
        else:
            etree.SubElement(pPr, qn('a:buFont')).set('typeface', 'Arial')
            etree.SubElement(pPr, qn('a:buChar')).set('char', '\u25cf')
        r = para.add_run(); r.text = t
        f = r.font; f.size = Pt(size / 2); f.name = BODY; f.color.rgb = rgb(color)
    return tb


def new(bg=LIGHT):
    s = prs.slides.add_slide(BLANK)
    s.background.fill.solid(); s.background.fill.fore_color.rgb = rgb(bg)
    return s


def frame(kicker, title):
    s = new()
    rect(s, 0, 0, 24, 1080, NAVY)
    text(s, 120, 80, 1680, 40, kicker.upper(), 26, ORT, BODY, True)
    text(s, 120, 128, 1680, 160, title, 68, NAVY, HEAD, True, spacing=1.05)
    image(s, A('btw-lockup.png'), 1670, 975, 130)
    text(s, 120, 1010, 900, 30, f'BTW Supply Chain Platform · {len(prs.slides)}', 22, MUTED)
    return s


def card(s, x, y, w, h, title, body, accent=NAVY, tsize=36, bsize=28, tl=None):
    rect(s, x, y, w, h, WHITE, LINE, 2, 0.06)
    rect(s, x, y, w, 10, accent)
    tl = tl or lines_for(title, w - 80, tsize, 0.6)
    text(s, x + 40, y + 44, w - 80, tl * tsize * 1.2, title, tsize, NAVY, HEAD, True, spacing=1.05)
    by = y + 44 + tl * tsize * 1.2 + 18
    text(s, x + 40, by, w - 80, y + h - by - 30, body, bsize, MUTED, spacing=1.3)


def cards(s, items, y=300, h=600, gap=36, **kw):
    w = (1680 - gap * (len(items) - 1)) / len(items)
    tl = max(lines_for(it[0], w - 80, kw.get('tsize', 36), 0.6) for it in items)
    for i, it in enumerate(items):
        card(s, 120 + i * (w + gap), y, w, h, *it, tl=tl, **kw)


def pill(s, x, y, label, color, filled=True, size=20):
    w = len(label) * size * 0.62 + 36
    rect(s, x, y, w, size * 2, color if filled else WHITE, None if filled else color, 2, 0.5)
    text(s, x, y, w, size * 2, label, size, WHITE if filled else color, BODY, True, C, M)
    return w


def box(s, x, y, w, h, t, sub='', fill=WHITE, border=NAVY, fg=NAVY, size=26, subsize=20, dash=False):
    rect(s, x, y, w, h, fill, border, 3, 0.12, dash)
    paras = [(t, {'size': size, 'bold': True, 'font': HEAD, 'color': fg, 'align': C})]
    if sub:
        paras.append((sub, {'size': subsize, 'color': PALE if fill == NAVY else MUTED, 'align': C}))
    text(s, x + 12, y, w - 24, h, paras, anchor=M, spacing=1.1)


def label(s, x, y, t, w=600, color=MUTED):
    text(s, x, y, w, 30, t.upper(), 19, color, BODY, True)


def dark(title, sub, foot=None, logo=True):
    s = new(NAVY)
    dot(s, 1240, -220, 900, NAVY2)
    if logo:
        image(s, A('btw-lockup-rev.png'), 140, 120, 360)
    rect(s, 140, 400, 120, 10, ORANGE)
    tl = lines_for(title, 1250, 104, 0.6)
    text(s, 140, 450, 1250, tl * 110, title, 104, WHITE, HEAD, True, spacing=1.0)
    text(s, 140, 450 + tl * 110 + 30, 1250, 160, sub, 40, PALE, spacing=1.3)
    if foot:
        text(s, 140, 930, 1640, 40, foot, 28, PALE)
    return s


def phone(s, img, x, y, w, cap=None, capsize=20):
    """A phone screenshot in a dark bezel, with an optional caption underneath."""
    iw, ih = Image.open(A(img)).size
    h = w * ih / iw
    rect(s, x - 8, y - 8, w + 16, h + 16, INK, r=0.07)
    image(s, A(img), x, y, w)
    if cap:
        text(s, x - 30, y + h + 20, w + 60, capsize * 1.3 * 2, cap, capsize, MUTED, BODY, True, C, spacing=1.05)
    return h


def shot(s, img, x, y, w=None, h=None, cap=None):
    """A web screenshot with a thin border; give w or h (or both to fit inside the box)."""
    if w and h:
        pic = fit_image(s, A(img), x, y, w, h)
    else:
        pic = image(s, A(img), x, y, w, h)
    X, Y, W, H = (v / 6350 for v in (pic.left, pic.top, pic.width, pic.height))
    rect(s, X, Y, W, H, None, 'D5DCE6', 2)
    if cap:
        text(s, X, Y + H + 12, W, 30, cap, 20, MUTED, BODY, True)
    return X, Y, W, H


# ---------- slides ----------
# Cover
s = dark('BTW Supply Chain Platform', 'How it works, what we have built, and what we still need from you',
         'BTW Global Distributors · Nihna Unique Distributors · Kivu (Volcanic Distributors)   |   25 October 2026')
shape(s, MSO_SHAPE.OVAL, 1400, 780, 640, 640, None, ORANGE, 4)

# Why
s = frame('Why we built it', 'One place for the whole supply chain')
cards(s, [
    ('See every truck', 'Drivers check in at border posts and towns from the app or a simple SMS. No GPS device needed.', ORANGE),
    ('Plan, then compare', 'Plan each period as a guide, issue POs, and see planned versus actual as the goods move.', NAVY),
    ('Less paper', 'PO letters and delivery acknowledgements come out as PDFs on each company’s own letterhead.', ORANGE),
    ('Three companies', 'Each company keeps its own stock, prices and staff. Directors can also see all three together.', NAVY),
], h=560)

# Before and after
s = frame('What changes', 'Before and after the platform')
pairs = [('Where is the truck?', 'Phone calls and WhatsApp to drivers', 'Every check-in on one live board'),
         ('Orders', 'POs typed and sent by hand', 'Kabonge issues the PO letter on letterhead in one click'),
         ('Deliveries', 'Paper delivery notes, shortages found late', 'Receiver signs on the phone; shortages recorded per leg'),
         ('Three companies', 'Separate spreadsheets for each company', 'One system, each company kept apart, group view for directors'),
         ('Reports', 'Directors wait for month-end figures', 'Each person’s own dashboards and the margins, any day')]
rect(s, 120, 300, 1680, 64, NAVY, r=0.15)
text(s, 160, 300, 380, 64, 'Area', 24, WHITE, BODY, True, anchor=M)
text(s, 560, 300, 560, 64, 'Without the platform', 24, WHITE, BODY, True, anchor=M)
text(s, 1180, 300, 600, 64, 'With the platform', 24, ORANGE, BODY, True, anchor=M)
for i, (a, b, c) in enumerate(pairs):
    y = 380 + i * 112
    rect(s, 120, y, 1680, 100, WHITE, LINE, 2, 0.12)
    text(s, 160, y, 380, 100, a, 28, NAVY, HEAD, True, anchor=M)
    text(s, 560, y, 560, 100, b, 26, MUTED, anchor=M)
    dot(s, 1140, y + 40, 20, ORANGE)
    text(s, 1180, y, 600, 100, c, 26, INK, BODY, True, anchor=M)

# Three apps
s = frame('What we built', 'Three parts, served from one place')
cols = [
    ('BROWSER + PHONE', 'Office apps', 'Every office role', ['Each person’s home of dashboards', 'Plans, orders, Truck desk, fees', 'Warehouse stock, expenses, sales', 'Team phone app: install from /app/'], NAVY),
    ('ANDROID PHONE', 'Field mobile app', 'Loader, driver, receiver', ['One job per screen, like Bolt or Uber', 'Loaders and receivers see no prices', 'Works offline, shows “last synced”', 'Drivers without the app use SMS'], ORANGE),
    ('SERVER', 'Server and API', 'Behind the scenes', ['One address serves web, app and data', 'Who sees what: roles and own scopes', 'SMS, email, push, PDF letters', 'Every change logged, directors can search it'], NAVY),
]
w = (1680 - 72) / 3
for i, (tag, t, who, items, acc) in enumerate(cols):
    x = 120 + i * (w + 36)
    rect(s, x, 300, w, 640, WHITE, LINE, 2, 0.05)
    pill(s, x + 44, 340, tag, acc, size=20)
    text(s, x + 44, 410, w - 88, 60, t, 42, NAVY, HEAD, True)
    text(s, x + 44, 474, w - 88, 40, who, 26, ORT, BODY, True)
    bullets(s, x + 44, 540, w - 88, items, 27, 12)

# Companies
s = frame('Three sister companies', 'Separate books, one group view')
cos = [('logo-btw.png', 'BTW Global Distributors', 'Buys from KBL'), ('logo-nud.png', 'Nihna Unique Distributors', 'Buys from UBL and GBI'),
       ('logo-kvd.png', 'Kivu – Volcanic Distributors', 'Buys from SBL'), ('logo-group.png', 'Group view', 'Directors only · read-only')]
cw = (1680 - 90) / 4
for i, (img, n, sub) in enumerate(cos):
    x = 120 + i * (cw + 30)
    rect(s, x, 300, cw, 390, WHITE, LINE, 2, 0.06)
    fit_image(s, A(img), x + 40, 330, cw - 80, 180)
    text(s, x + 20, 540, cw - 40, 80, n, 28, NAVY, HEAD, True, C)
    text(s, x + 20, 630, cw - 40, 40, sub, 23, MUTED, align=C)
bullets(s, 120, 740, 820, ['Each company has its own logo, letterhead, stock, prices and staff', 'Staff only see the company they work for'], 28, 14)
bullets(s, 980, 740, 820, ['Directors pick a company or the whole group from one menu', 'Group reports convert currencies and remove sales between the companies'], 28, 14)

# Simple journey
s = frame('The journey', 'From plan to sale in seven steps')
steps = [('1', 'Plan', 'Kabonge suggests the period plan', 'Web'), ('2', 'Order', 'Kabonge issues the PO letter', 'Web'),
         ('3', 'Load', 'Joel, Eric or Moses load within ±10%, no prices', 'App'),
         ('4', 'Agree price', 'Testfie records the transport price after loading', 'Web'), ('5', 'Drive', 'Driver checks in; Testfie follows up', 'App / SMS'),
         ('6', 'Receive', 'Asie or Yonas check, sign, give reasons', 'App'), ('7', 'Report', 'Directors see margins and dashboards', 'Web')]
sw = (1680 - 16 * 6) / 7
for i in range(6):
    x = 120 + i * (sw + 16) + sw / 2 + 62
    arrow(s, x, 385, x + sw + 16 - 124, 385, NAVY, 4, dash=True)
for i, (n, t, who, ch) in enumerate(steps):
    x = 120 + i * (sw + 16)
    acc = ORANGE if ch != 'Web' else NAVY
    dot(s, x + sw / 2 - 55, 330, 110, acc)
    text(s, x + sw / 2 - 55, 330, 110, 110, n, 52, WHITE, HEAD, True, C, M)
    text(s, x, 470, sw, 50, t, 32, NAVY, HEAD, True, C)
    text(s, x + 6, 524, sw - 12, 110, who, 23, MUTED, align=C)
    pw = len(ch) * 13 + 40
    rect(s, x + (sw - pw) / 2, 648, pw, 40, WHITE, acc, 2, 0.5)
    text(s, x + (sw - pw) / 2, 648, pw, 40, ch, 20, ORT if ch != 'Web' else NAVY, BODY, True, C, M)
rect(s, 120, 740, 1680, 110, WHITE, LINE, 2, 0.15)
dot(s, 160, 784, 22, ORANGE); text(s, 196, 772, 520, 50, 'Done on the phone, in the field', 26, anchor=M)
dot(s, 720, 784, 22, NAVY); text(s, 756, 772, 520, 50, 'Done in the office, web or phone', 26, anchor=M)
text(s, 1260, 752, 520, 90, 'No PO approval step: Kabonge issues POs directly. Approval stays a switch, off.', 24, MUTED, anchor=M, spacing=1.2)
text(s, 120, 880, 1680, 60, 'A load that differs from the PO makes a revision (PO-001-rev001). From Gisenyi, Asie can re-export goods to Yonas in Juba.', 26, INK, anchor=M)

# Platform journey: swimlanes of actors and functions
s = frame('Platform journey', 'Who does what, step by step')
lanes = [('Kabonge', 'Planner · web + phone', NAVY), ('Daniel, Michael', 'Directors · web + phone', NAVY), ('Testfie', 'Truck follow-up', NAVY),
         ('Joel, Eric, Moses', 'Loaders · app', ORANGE), ('Drivers', 'App / SMS', ORANGE), ('Asie', 'Receiver · Gisenyi, Goma', ORANGE), ('Yonas', 'Receiver · Juba', ORANGE)]
LY, LH, LG = 285, 92, 5
LX, LW = 120, 270
GX = LX + LW + 12
ncol = 8
CW = (1800 - GX) / ncol
for i, (n, ch, acc) in enumerate(lanes):
    y = LY + i * (LH + LG)
    rect(s, GX, y, 1800 - GX, LH, WHITE if i % 2 == 0 else TINT)
    rect(s, LX, y, LW, LH, acc)
    text(s, LX + 20, y + 12, LW - 28, 40, n, 25, WHITE, HEAD, True)
    text(s, LX + 20, y + 54, LW - 28, 30, ch, 17, PALE if acc == NAVY else WHITE, BODY, True)
# (lane, column, label)
fn = [(0, 0, 'Period plan for his pairs'), (0, 1, 'Issue the PO, letter emailed'), (2, 2, 'Line up trucks in the queue'),
      (3, 3, 'Load ±10%, no prices'), (2, 4, 'Record the agreed price'), (1, 4, 'Pay transport fees'), (4, 5, 'Check in at each stop'),
      (2, 5, 'Follow trucks, expenses'), (5, 6, 'Check, give reasons, sign'), (5, 7, 'Re-export to Juba'), (6, 7, 'Receive the re-export'),
      (1, 7, 'Dashboards, margins, prices')]
BW, BH = CW - 16, LH - 18
pos = {}
for lane, col, t in fn:
    x = GX + col * CW + 8
    y = LY + lane * (LH + LG) + 9
    acc = lanes[lane][2]
    rect(s, x, y, BW, BH, WHITE, acc, 3, 0.15)
    text(s, x + 6, y, BW - 12, BH, t, 18, NAVY, BODY, True, C, M, spacing=1.0)
    pos[(lane, col)] = (x, y)
order = [(0, 0), (0, 1), (2, 2), (3, 3), (2, 4), (4, 5), (5, 6), (5, 7)]
for (la, ca), (lb, cb) in zip(order, order[1:]):
    xa, ya = pos[(la, ca)]; xb, yb = pos[(lb, cb)]
    if ca == cb - 1 or la != lb:
        arrow(s, xa + BW, ya + BH / 2, xb, yb + BH / 2, ORANGE, 3, dash=True, elbow=True)
    else:
        arrow(s, xa + BW, ya + BH / 2, xb, yb + BH / 2, ORANGE, 3, dash=True)
xa, ya = pos[(5, 7)]
arrow(s, xa + BW / 2, ya + BH, xa + BW / 2, ya + LH + LG, ORANGE, 3, dash=True)
xa, ya = pos[(2, 4)]
arrow(s, xa + BW / 2, ya, xa + BW / 2, ya - LG - 18, NAVY, 2, dash=True)

# Actors and functions
s = frame('Actors', 'Each person sees only their own work')
actors = [('Daniel, Michael', 'Directors · web + phone', NAVY, ['Everything, every company', 'Selling prices, payments, sales', 'Margins, dashboards, audit log']),
          ('Kabonge', 'Planner · web + phone', NAVY, ['Plans and POs for his pairs', 'BTW–KBL, Nihna–UBL, Kivu–SBL', 'Keeps the static data']),
          ('Testfie', 'Truck follow-up · web + phone', NAVY, ['Follows every truck and queue', 'Agreed price after loading', 'Truck expenses, fees; loads at GBI']),
          ('Joel, Eric, Moses', 'Loaders · app', ORANGE, ['KBL Nairobi (Joel, Eric)', 'UBL Kampala (Moses)', 'Load and hand over, no prices']),
          ('Drivers', 'App or SMS', ORANGE, ['One trip at a time', 'Check in on the road', 'Report a problem']),
          ('Asie', 'Receiver · app + web', ORANGE, ['Gisenyi and Goma deliveries', 'Warehouse stock and expenses', 'Re-exports to Yonas in Juba']),
          ('Yonas', 'Receiver · app + web', ORANGE, ['Juba deliveries, re-exports in', 'Warehouse stock and expenses', 'Quantities only, no values'])]
aw, ah = (1680 - 90) / 4, 320
for i, (n, ch, acc, items) in enumerate(actors):
    x = 120 + (i % 4) * (aw + 30)
    y = 290 + (i // 4) * (ah + 26)
    rect(s, x, y, aw, ah, WHITE, LINE, 2, 0.06)
    rect(s, x, y, 10, ah, acc)
    text(s, x + 36, y + 24, aw - 60, 46, n, 32, NAVY, HEAD, True)
    pill(s, x + 36, y + 76, ch, acc, filled=False, size=18)
    bullets(s, x + 36, y + 136, aw - 60, items, 23, 10, h=ah - 146)
x = 120 + 3 * (aw + 30); y = 290 + ah + 26
rect(s, x, y, aw, ah, OTINT, ORANGE, 2, 0.06, dash=True)
text(s, x + 36, y + 28, aw - 72, ah - 56, [('Prices stay hidden', {'size': 28, 'font': HEAD, 'bold': True, 'color': NAVY, 'after': 12}),
     ('Loaders, receivers and drivers never see prices or payments. Receivers see quantities, not stock values.', {'size': 22, 'color': INK})], spacing=1.25)

# Access matrix summary
s = frame('Who sees what', 'Access matrix, as built')
F_, O_, V_, N_ = 'F', 'O', 'V', '—'
heads = ['Feature', 'Directors', 'Kabonge', 'Testfie', 'Loaders', 'Asie', 'Yonas', 'Drivers']
rows = [('Users, roles, audit log', F_, N_, N_, N_, N_, N_, N_),
        ('Companies, suppliers, goods', F_, F_, N_, N_, N_, N_, N_),
        ('Providers, trucks, drivers', F_, F_, V_, V_, V_, N_, N_),
        ('Plans and purchase orders', F_, 'O pairs', 'V GBI', 'V', 'V', 'V', N_),
        ('Loading', V_, 'V pairs', 'O GBI', 'O point', 'O re-export', N_, N_),
        ('Agreed price, truck expenses, fees', F_, N_, F_, N_, N_, N_, N_),
        ('Fleet follow-up and issues', V_, V_, F_, N_, V_, V_, 'O trip'),
        ('Delivery acknowledgement', V_, V_, N_, N_, O_, O_, N_),
        ('Warehouse stock and expenses', F_, N_, N_, N_, O_, O_, N_),
        ('Re-exports Gisenyi → Juba', F_, N_, 'V follow-up', N_, O_, 'O receive', N_),
        ('Sales, selling prices, margins', F_, N_, N_, N_, N_, N_, N_)]
cw_ = [470] + [172] * 7
tb = s.shapes.add_table(len(rows) + 1, 8, px(120), px(285), px(sum(cw_)), px(50 * (len(rows) + 1))).table
for c, wv in enumerate(cw_):
    tb.columns[c].width = px(wv)
tone = {'F': ('DDF0E3', '14532D'), 'O': ('FFF1E6', ORT), 'V': ('EAF0F8', NAVY), '—': (WHITE, '8A97A8')}
for r in range(len(rows) + 1):
    tb.rows[r].height = px(50)
    for c in range(8):
        v = heads[c] if r == 0 else rows[r - 1][c]
        cell = tb.cell(r, c)
        cell.margin_left = cell.margin_right = px(12); cell.margin_top = cell.margin_bottom = px(2)
        cell.vertical_anchor = M
        fill, fg = (NAVY, WHITE) if r == 0 else ((WHITE if r % 2 else 'F3F6FA'), INK) if c == 0 else tone[v[0]]
        cell.fill.solid(); cell.fill.fore_color.rgb = rgb(fill)
        tf = cell.text_frame; tf.text = v
        para = tf.paragraphs[0]; para.alignment = PP_ALIGN.LEFT if c == 0 else C
        f = para.runs[0].font
        f.size = Pt(10.5); f.bold = r == 0 or c > 0; f.name = BODY; f.color.rgb = rgb(fg)
ly = 285 + 50 * (len(rows) + 1) + 24
xx = 120
for k, (lab, key) in enumerate([('F  full', 'F'), ('O  own scope only', 'O'), ('V  view only', 'V'), ('—  no access', '—')]):
    fill, fg = tone[key]
    w_ = len(lab) * 12 + 40
    rect(s, xx, ly, w_, 40, fill, LINE, 1, 0.5)
    text(s, xx, ly, w_, 40, lab, 19, fg, BODY, True, C, M)
    xx += w_ + 16
text(s, xx + 20, ly - 4, 1800 - xx - 20, 50, 'Own scopes: Kabonge’s buyer–supplier pairs, each loader’s loading point, each receiver’s warehouses.', 20, MUTED, anchor=M, spacing=1.1)

# Field app
s = frame('Field mobile app', 'One clear job for each person')
phones_ = [('phone-joel-loader.png', 'LOADER · JOEL', 'Sees the truck that is due, counts cases per product and hands over. No prices or payments.'),
           ('phone-driver.png', 'DRIVER', 'Sees one trip. Taps “I’m here” at each checkpoint, or reports a problem.'),
           ('phone-asie-sign.png', 'RECEIVER · ASIE', 'Checks what arrived, notes any shortage with a reason, and signs. Stock updates at once.')]
pw_ = (1680 - 80) / 3
for i, (img, role, cap) in enumerate(phones_):
    x = 120 + i * (pw_ + 40)
    phone(s, img, x + 8, 300, 250)
    text(s, x + 290, 320, pw_ - 290, 30, role, 22, ORT, BODY, True)
    text(s, x + 290, 364, pw_ - 290, 400, cap, 24, INK, spacing=1.3)
rect(s, 120, 940, 1500, 2, LINE)
text(s, 120, 950, 1500, 40, 'Every offline screen shows “Online · Synced 4 min ago” or “Waiting to send 2”. Office staff at /app/ get the team phone app.', 22, MUTED)

# Phone home screens
s = frame('New · phone home screens', 'Each person opens on their own work')
homes = [('phone-daniel-home.png', 'Daniel, Michael', 'Scorecard, top exceptions'), ('phone-kabonge-home.png', 'Kabonge', 'Order pipeline, follow-up'),
         ('phone-testfie-home.png', 'Testfie', 'Load at GBI, live fleet'), ('phone-asie-receiver.png', 'Asie, Yonas', 'Next truck + warehouse strip'),
         ('phone-joel-today.png', 'Joel, Eric, Moses', 'Today’s list, no prices')]
ph_w = 250
gap = (1680 - 5 * ph_w) / 4
for i, (img, who, cap) in enumerate(homes):
    x = 120 + i * (ph_w + gap)
    h = phone(s, img, x, 290, ph_w)
    text(s, x - 20, 290 + h + 22, ph_w + 40, 34, who, 23, NAVY, HEAD, True, C)
    text(s, x - 20, 290 + h + 58, ph_w + 40, 30, cap, 19, MUTED, BODY, False, C)
text(s, 120, 945, 1500, 30, 'One list or chart per screen · status with an icon and a word · tap a number for its list · no new download, it lives at /app/', 19, MUTED)

# Web home screens
s = frame('New · web home screens', 'Your own dashboards when you sign in')
webs = [('web-home-daniel.png', 'Daniel, Michael · executive overview first'), ('web-home-kabonge.png', 'Kabonge · purchasing'),
        ('web-home-testfie.png', 'Testfie · trucks and fees'), ('web-home-joel.png', 'Joel, Eric, Moses · today’s loading'),
        ('web-home-asie.png', 'Asie · deliveries, warehouse, re-exports'), ('web-home-yonas.png', 'Yonas · deliveries, warehouse')]
ww, wg = 470, 135
for i, (img, cap) in enumerate(webs):
    x = 120 + (i % 3) * (ww + wg)
    y = 282 + (i // 3) * 350
    shot(s, img, x, y, ww, cap=cap)

# Loading allowance and PO revisions
s = frame('Loading', 'Loading with an allowance and PO revisions')
for i, (img, cap) in enumerate([('loader-allowance.png', 'Allowance meter'), ('loader-alternative.png', 'Load an alternative')]):
    x = 128 + i * 300
    phone(s, img, x, 290, 260, cap)
fx = 760
steps_ = [('PO-001', 'Issued by Kabonge, no approval step', NAVY), ('Loader changes', 'a quantity, a missing item or an alternative, within ±10%', ORANGE),
          ('PO-001-rev001', 'Created and issued at once, in the same step', ORANGE), ('Everyone follows', 'Kabonge and the directors told; shipments use the latest revision', NAVY)]
fw_ = (1800 - fx - 3 * 36) / 4
for i, (t_, sub_, acc_) in enumerate(steps_):
    x = fx + i * (fw_ + 36)
    rect(s, x, 290, fw_, 230, WHITE, acc_, 3, 0.08)
    text(s, x + 18, 312, fw_ - 36, 40, t_, 23, NAVY, HEAD, True)
    text(s, x + 18, 362, fw_ - 36, 150, sub_, 20, MUTED, spacing=1.25)
    if i < 3:
        arrow(s, x + fw_ + 3, 405, x + fw_ + 33, 405, ORANGE, 4)
bullets(s, fx, 570, 500, ['Beyond ±10%, or over the truck’s size, the app refuses: ask Kabonge to change the PO', 'A second change makes -rev002, always numbered from the original',
                          'Loaders count cases only: no prices or payments on their screens'], 22, 12, h=360)
cx = 1300
rect(s, cx, 570, 500, 360, NAVY, r=0.06)
text(s, cx + 30, 592, 440, 30, 'SETTINGS · apps/api/config.toml', 18, ORANGE, BODY, True)
text(s, cx + 30, 640, 440, 280, ['[approvals]', 'purchase_orders = false', '', '[loading]', 'allowance_pct = 10', 'allow_alternatives = true', 'revision_suffix = "-rev"'],
     20, WHITE, MONO, spacing=1.2)

# Truck follow-up officer
s = frame('Role · Testfie', 'Truck follow-up officer')
shot(s, 'dash-fleet.png', 120, 290, 700, 600, cap='Live fleet board: every truck by status, grouped by route')
x = 880
h = phone(s, 'phone-testfie-agreed.png', x, 290, 270, 'Agreed price, after loading')
bx = x + 270 + 50
bullets(s, bx, 290, 1800 - bx, ['Follows every truck and queue; delayed, silent and stopped trucks first', 'Records the agreed transport price after loading (no longer the loader)',
                                'Truck expenses; fees paid / part / unpaid against a reference', 'Unpaid fees turn amber at 14 days, red at 30', 'Loads at GBI Mombasa only; static data view only'], 22, 12, h=440)
rect(s, bx, 760, 1800 - bx, 130, OTINT, ORANGE, 2, 0.08, dash=True)
text(s, bx + 24, 774, 1800 - bx - 48, 110, [('DEMO SIGN-IN', {'size': 18, 'bold': True, 'color': ORT, 'after': 6}),
     ('testfie', {'size': 22, 'bold': True, 'font': MONO}), ('+254700000006 · PIN 1234', {'size': 20, 'font': MONO})], 20, INK)

# Legs
s = frame('Long trips', 'Each leg is its own shipment')
whs = [('Nairobi', 'loading point', NAVY), ('Gisenyi', 'Rwanda warehouse', ORANGE), ('Goma', 'Congo warehouse', ORANGE)]
for i, (t, sub, acc) in enumerate(whs):
    x = 120 + i * 670
    box(s, x, 310, 340, 130, t, sub, border=acc, size=34, subsize=22)
for i, lbl in enumerate(['Shipment 1', 'Shipment 2 · new truck']):
    x = 120 + 340 + 20 + i * 670
    text(s, x, 320, 290, 36, lbl, 22, ORT, BODY, True, C)
    arrow(s, x, 375, x + 290, 375, ORANGE, 6)
cards(s, [('Arrive, then store', 'When goods reach the first stop they are signed in as that warehouse’s stock.', ORANGE),
          ('Send on as new', 'The next leg is a new shipment with its own truck and driver, still linked to the first.', NAVY),
          ('Re-exports', 'Asie re-exports from Gisenyi to Yonas in Juba as a new shipment (ASIE-RX-…). Warehouses can be added.', ORANGE)], y=510, h=400)

# Warehouse money
s = frame('New · warehouse money', 'What the warehouses record')
mshots = [('money-asie-expense.png', 'Expenses', 'Offloading, storage, salary, rent, utilities, damaged goods; receipt photo'),
          ('money-asie-stock-count.png', 'Stock counts', 'Count, damaged write-off, moved out, found; quantities only'),
          ('money-asie-reexport-load.png', 'Re-exports', 'Asie raises and loads ASIE-RX-… for Yonas in Juba'),
          ('money-yonas-receive-reason.png', 'Reasons for losses', 'Every shortage or damage needs a reason (feeds the Pareto)'),
          ('money-testfie-money-ageing.png', 'Transport fees', 'Paid / part / unpaid by reference; amber 14, red 30 days')]
ph_w = 230
gap = (1680 - 5 * ph_w) / 4
for i, (img, t_, cap) in enumerate(mshots):
    x = 120 + i * (ph_w + gap)
    h = phone(s, img, x, 286, ph_w)
    text(s, x - 30, 286 + h + 20, ph_w + 60, 34, t_, 23, NAVY, HEAD, True, C)
    text(s, x - 40, 286 + h + 56, ph_w + 80, 70, cap, 18, MUTED, align=C, spacing=1.1)
text(s, 120, 935, 1500, 30, 'Directors also set selling prices per product (company default or per warehouse), with a target-margin helper.', 19, INK, BODY, True)

# Landed cost v2
s = frame('New · landed cost', 'What a case really costs us')
parts = [('Goods', 'cases loaded × PO price', NAVY), ('Truck', 'all trip costs of every leg, split by cases', ORANGE),
         ('Warehouse share', 'month’s warehouse expenses ÷ good cases received', ORANGE), ('Landed cost per case', '÷ good cases received (received − damaged)', NAVY)]
bw_ = 360
xs = [120, 120 + bw_ + 80, 120 + 2 * (bw_ + 80), 120 + 3 * (bw_ + 80)]
for i, ((t_, sub_, acc_), x) in enumerate(zip(parts, xs)):
    filled = i == 3
    rect(s, x, 290, bw_, 160, NAVY if filled else WHITE, acc_, 3, 0.1)
    text(s, x + 20, 306, bw_ - 40, 46, t_, 28, WHITE if filled else NAVY, HEAD, True, C)
    text(s, x + 20, 356, bw_ - 40, 84, sub_, 20, PALE if filled else MUTED, align=C, spacing=1.15)
    if i < 3:
        text(s, x + bw_, 330, 80, 80, '=' if i == 2 else '+', 54, ORANGE, HEAD, True, C, M)
rect(s, 120, 486, 760, 440, WHITE, LINE, 2, 0.05)
text(s, 156, 506, 700, 40, 'Worked example · product A', 26, NAVY, HEAD, True)
ex = [('Goods', '1,000 cases × $10', '$10,000'), ('Truck', '$2,700 split by cases', '$1,800'), ('Warehouse', '$1 per good case × 985', '$985'),
      ('Landed', '$12,785 ÷ 985 good cases', '$12.98 / case'), ('Sold', '600 at $15 → profit $1,212', 'margin 13.5 %'), ('Target 20 %', '$12.98 ÷ (1 − 0.20)', 'price $16.22')]
for k, (a_, b_, c_) in enumerate(ex):
    y = 560 + k * 58
    if k % 2 == 0: rect(s, 140, y - 4, 720, 54, TINT, r=0.2)
    text(s, 160, y, 170, 46, a_, 21, NAVY, BODY, True, anchor=M)
    text(s, 330, y, 330, 46, b_, 21, INK, anchor=M)
    text(s, 660, y, 190, 46, c_, 21, ORT if k >= 3 else INK, BODY, True, PP_ALIGN.RIGHT, M)
PX, PY, PW, PH = shot(s, 'web-performance.png', 930, 486, 870, 400, cap='Performance and margins, from product to whole business')
text(s, PX, 940, 1800 - PX, 30, 'Split by cases today; “by value” is one switch in config.toml ([costs] allocation).', 19, MUTED)

# Dashboards 1
s = frame('New · dashboards', '28 first-release dashboards + 3 showcase')
shot(s, 'dash-exec-overview.png', 120, 290, 960, cap='Directors · executive overview: scorecard and the exceptions to act on')
groups = [('Business', 'overview, profit bridge, landed cost, prices, fast / slow'), ('Purchasing', 'PO pipeline, ordered vs loaded vs delivered'),
          ('Loading', 'today’s list, loading status'), ('Fleet', 'live board, delays, issues, border heatmap'),
          ('Fees', 'agreed vs actual, payments, ageing, per truck'), ('Deliveries', 'incoming, damaged / short, loss Pareto'),
          ('Warehouse', 'stock cover, in transit, expenses, re-exports'), ('Sales · Admin', 'sales, balances, users, audit, alerts')]
gx = 1130
for k, (g, d) in enumerate(groups):
    y = 290 + k * 82
    rect(s, gx, y, 670, 72, WHITE if k % 2 == 0 else TINT, LINE, 1, 0.15)
    text(s, gx + 20, y + 6, 630, 30, g, 21, NAVY, HEAD, True)
    text(s, gx + 20, y + 36, 630, 30, d, 17, MUTED)
text(s, gx, 950, 670, 30, 'One endpoint: GET /v1/dashboards, cut to each person’s scope', 18, MUTED, BODY, True)

# Dashboards 2
s = frame('New · dashboards', 'Every chart: definition, period, freshness, export')
X1, Y1, W1, H1 = shot(s, 'dash-profit.png', 120, 285, None, 560)
shot(s, 'dash-stock.png', X1 + W1 + 36, 285, 1800 - (X1 + W1 + 36), 560)
text(s, 120, 862, 680, 30, 'Profit bridge, profit by month, landed cost per case', 19, MUTED, BODY, True)
text(s, X1 + W1 + 36, 862, 900, 30, 'Stock cover bands and days of stock against the minimum', 19, MUTED, BODY, True)
xx = 120
for lab in ['ⓘ definition', 'unit + period', 'freshness', 'View data', 'PDF · Excel · CSV', '“No data yet”', 'colour + icon + word']:
    xx += pill(s, xx, 912, lab, NAVY, filled=False, size=18) + 14

# ---------- technical ----------
# T1 Technical architecture
s = frame('Technical · 1 of 3', 'Architecture')
L = 1200
label(s, 120, 290, 'Clients')
cl = [('Office web app', 'Svelte 5 · about 100 KB', NAVY), ('Team phone app (PWA)', 'Office roles · /app/', NAVY), ('Field app', 'Capacitor 7 · about 79 KB', ORANGE), ('SMS / USSD', 'Africa’s Talking', ORANGE)]
bw = (L - 60) / 4
for i, (t, sub, b) in enumerate(cl):
    box(s, 120 + i * (bw + 20), 324, bw, 92, t, sub, border=b, size=22, subsize=18)
for i in range(4):
    cx = 120 + i * (bw + 20) + bw / 2
    arrow(s, cx, 418, cx, 452, ORANGE, 4)
box(s, 120, 456, L, 112, 'One server · NestJS 11 on Fastify', 'Web, apps and /v1 API · sign-in (JWT) · roles + own scopes (pairs, points, warehouses) · audit log · sync', NAVY, NAVY, WHITE, 28, 21)
arrow(s, 120 + L / 2, 570, 120 + L / 2, 604, ORANGE, 4)
label(s, 120, 606, 'Business modules')
mods = ['Access', 'Plans · POs', 'Trucks', 'Warehouse', 'Sales', 'Finance', 'Reports', 'Dashboards']
mw = (L - 12 * 7) / 8
for i, m in enumerate(mods):
    box(s, 120 + i * (mw + 12), 640, mw, 70, m, size=19)
arrow(s, 120 + L / 2, 712, 120 + L / 2, 746, ORANGE, 4)
box(s, 120, 750, L, 96, 'PostgreSQL 17 + PostGIS', 'Drizzle migrations · every record tagged by company · checkpoints as map areas', size=28, subsize=21)
rect(s, 120, 866, L, 70, OTINT, ORANGE, 2, 0.2, dash=True)
text(s, 150, 866, L - 60, 70, 'Shared package: one set of rules (access, landed cost, dashboards) for the web, phone apps and server.', 22, INK, anchor=M)
x2 = 120 + L + 50
rect(s, x2, 290, 1800 - x2, 646, WHITE, LINE, 2, 0.05)
rect(s, x2, 290, 10, 646, ORANGE)
text(s, x2 + 40, 318, 400, 50, 'Adapters', 34, NAVY, HEAD, True)
text(s, x2 + 40, 368, 1800 - x2 - 70, 90, 'Each outside service sits behind one adapter, with a local stand-in for testing.', 21, MUTED, spacing=1.25)
bullets(s, x2 + 40, 470, 1800 - x2 - 70, ['SMS and USSD: Africa’s Talking', 'Email: SMTP', 'Push: Firebase', 'PDF letters: Typst letterheads', 'Routes: OSRM', 'Files: local disk or cloud storage'], 24, 12)

# T2 Data flow
s = frame('Technical · 2 of 3', 'Data flow: one check-in, end to end')
flow = [('1', 'Driver taps', '“I’m here”, or sends an SMS', ORANGE), ('2', 'Kept offline', 'Outbox with a unique key; works with no signal', ORANGE),
        ('3', 'Sent', 'When signal returns, in one batch to /v1/sync', ORANGE), ('4', 'Checked', 'Sign-in, role, company; a repeat key is ignored', NAVY),
        ('5', 'Saved', 'Database, checkpoint map area, audit log', NAVY), ('6', 'Shown', 'Office board and reports update; alerts if late', NAVY)]
fw, fh = (1680 - 5 * 50) / 6, 330
for i, (n, t, sub, acc) in enumerate(flow):
    x = 120 + i * (fw + 50)
    rect(s, x, 300, fw, fh, WHITE, acc, 3, 0.08)
    dot(s, x + 24, 324, 64, acc)
    text(s, x + 24, 324, 64, 64, n, 30, WHITE, HEAD, True, C, M)
    text(s, x + 24, 412, fw - 48, 50, t, 25, NAVY, HEAD, True)
    text(s, x + 24, 470, fw - 48, 150, sub, 22, MUTED, spacing=1.25)
    if i < 5:
        arrow(s, x + fw + 4, 450, x + fw + 46, 450, ORANGE, 5)
label(s, 120, 680, 'How the main records link')
chain = ['Period plan', 'PO', 'Loading', 'Shipment (each leg)', 'Acknowledgement', 'Stock moves', 'Sales']
cw2 = [180, 120, 170, 290, 270, 220, 130]
x = 120
for i, (t, w_) in enumerate(zip(chain, cw2)):
    box(s, x, 720, w_, 80, t, size=22, border=NAVY if i in (0, 1, 6) else ORANGE)
    if i < len(chain) - 1:
        arrow(s, x + w_ + 3, 760, x + w_ + 37, 760, NAVY, 4)
    x += w_ + 40
rect(s, 120, 830, 1680, 110, TINT, r=0.15)
text(s, 160, 830, 1600, 110, 'Each leg is its own shipment, linked to the one before. Shortages show on the leg where they happen; landed cost = goods + truck + warehouse share, carried forward when goods move on.', 24, INK, anchor=M, spacing=1.3)

# T3 Setup
s = frame('Technical · 3 of 3', 'Set-up, hosting and security')
label(s, 120, 290, 'How it runs')
box(s, 120, 330, 360, 110, 'Office browsers', 'HTTPS', size=26)
box(s, 120, 460, 360, 110, 'Phones', 'Android app · team app (PWA)', border=ORANGE, size=26)
box(s, 120, 590, 360, 110, 'Basic phones', 'SMS / USSD', border=ORANGE, size=26)
rect(s, 560, 330, 520, 370, NAVY, r=0.06)
text(s, 590, 350, 460, 50, 'One server', 30, WHITE, HEAD, True, C)
for i, t in enumerate(['Web app files', 'Field and team app files', '/v1 API', 'Settings: apps/api/config.toml', 'Scheduled checks (late trucks)']):
    rect(s, 600, 408 + i * 57, 440, 48, NAVY2, r=0.2)
    text(s, 600, 408 + i * 57, 440, 48, t, 21, WHITE, BODY, True, C, M)
for y in (385, 515, 645):
    arrow(s, 484, y, 556, y if y == 515 else 515, ORANGE, 4)
box(s, 1130, 330, 260, 170, 'Database', 'PostgreSQL + PostGIS', size=26)
box(s, 1130, 530, 260, 170, 'Outside services', 'SMS · email · push', border=ORANGE, size=26, dash=True)
arrow(s, 1084, 420, 1126, 415, NAVY, 4)
arrow(s, 1084, 610, 1126, 615, ORANGE, 4)
rect(s, 120, 725, 1270, 220, WHITE, LINE, 2, 0.08)
text(s, 160, 740, 1190, 40, 'Today and at go-live', 26, NAVY, HEAD, True)
text(s, 160, 784, 1190, 160, [('Today: runs on one machine; shared through a secure tunnel for the demo.', {'after': 8}),
                              ('Go-live: the same set-up on a cloud server in a region you choose, with a fixed web address and daily backups.', {'after': 8}),
                              'Switches in config.toml: PO approval (off), loading allowance, fee ageing (14 / 30 days), cost split.'], 22, MUTED, spacing=1.2)
x2 = 1430
rect(s, x2, 290, 370, 640, WHITE, LINE, 2, 0.05)
rect(s, x2, 290, 370, 10, ORANGE)
text(s, x2 + 28, 316, 320, 40, 'Security', 30, NAVY, HEAD, True)
bullets(s, x2 + 28, 372, 320, ['Password (web) or phone + PIN (phone apps)', 'Short-lived sign-in tokens; lock-out after wrong tries', 'Each person sees only their features', 'Own scopes: pairs, points, warehouses', 'Every change logged: who and when', 'Database company rules ready as a second net'], 21, 10)

# Why trust it
s = frame('Why it fits you', 'Built for the roads you use')
cards(s, [('Works on weak signal', 'The app saves work offline and sends it later. Drivers without a smartphone use SMS.', ORANGE),
          ('Light and fast', 'Web app about 100 KB, phone app about 79 KB, so it loads quickly even on slow connections.', NAVY),
          ('No licence fees', 'Built on proven open-source tools. Your data stays in your own database.', ORANGE),
          ('Ready to grow', 'Add warehouses, routes, trucks and providers yourself. GPS can be added later.', NAVY)], h=420)
rect(s, 120, 760, 1680, 150, NAVY, r=0.1)
text(s, 170, 760, 1580, 150, [('Tested before you see it', {'size': 30, 'font': HEAD, 'bold': True, 'color': ORANGE, 'after': 8}),
                              ('1,108 automated checks run against the platform: access for each person, money, dashboards, security, load. All pass today.', {'size': 25, 'color': WHITE})], anchor=M)

# Done
s = frame('Progress', 'What is done today')
stats = [('9', 'named people, each with their own access'), ('31', 'dashboards: 28 first-release + 3 showcase'),
         ('1,108', 'automated quality checks, all passing'), ('131', 'products loaded from your price list')]
sw = (1680 - 90) / 4
for i, (n, t) in enumerate(stats):
    x = 120 + i * (sw + 30)
    rect(s, x, 300, sw, 230, NAVY, r=0.08)
    text(s, x + 34, 330, sw - 68, 90, n, 72, ORANGE, HEAD, True)
    text(s, x + 34, 425, sw - 68, 90, t, 25, 'E3EAF4', spacing=1.25)
text(s, 120, 548, 1680, 30, 'Web app 100.3 KB (budget 130 KB) · phone app 79.4 KB (budget 90 KB)', 22, MUTED, BODY, True)
bullets(s, 120, 600, 820, ['Office web app, field app, team phone app and server working together', 'Three companies, letterheads, group view', 'Plans, POs with ±10% revisions, legs as new shipments',
                           '30 ETS Sabrina trucks and drivers; three months of sample data', 'Architecture document v1.2 in PDF and Word'], 25, 12, h=360)
label(s, 980, 600, 'New since 18 October', color=ORT)
bullets(s, 980, 640, 820, ['Your roster and access matrix; no prices for loaders, receivers, drivers', 'Agreed price after loading (Testfie); fee ageing',
                           'Warehouse expenses, stock counts, re-exports Asie → Yonas', 'Selling prices, landed cost v2, combined performance',
                           'Dashboards and home screens on the web and the phone'], 25, 12, h=330)

# Demo
s = frame('Try it', 'Demo link and sign-ins')
rect(s, 120, 300, 700, 330, NAVY, r=0.08)
text(s, 156, 334, 630, 30, 'OFFICE WEB APP', 22, ORANGE, BODY, True)
text(s, 156, 374, 630, 80, 'Demo link: shared on the day', 30, WHITE, HEAD, True)
text(s, 156, 490, 630, 30, 'ON A PHONE (FIELD AND OFFICE TEAM)', 22, ORANGE, BODY, True)
text(s, 156, 530, 630, 50, '<demo link>/app/', 28, WHITE, MONO)
text(s, 120, 660, 700, 260, [('Web: username and password demo1234.', {'after': 10}), ('Phone: phone number and PIN 1234, office staff included.', {'after': 10}),
                             'The link is temporary and runs on demo data.'], 24, MUTED, spacing=1.3)
logins = [('Who', 'Web username', 'Phone'), ('Daniel · director', 'daniel', '+254700000001'), ('Michael · director', 'michael', '+254700000020'),
          ('Kabonge · planner', 'kabonge', '+254700000002'), ('Testfie · truck follow-up', 'testfie', '+254700000006'),
          ('Joel, Eric · loaders, KBL', 'joel, eric', '+254700000003 / 04'), ('Moses · loader, UBL', 'moses', '+256700000005'),
          ('Asie · receiver, re-export', 'asie', '+250700000007'), ('Yonas · receiver, Juba', 'yonas', '+211900000008'),
          ('Driver · Mawazi K', '—', '+254702750019')]
tbl = s.shapes.add_table(len(logins), 3, px(870), px(300), px(930), px(62 * len(logins))).table
for c, wv in enumerate([400, 230, 300]):
    tbl.columns[c].width = px(wv)
for r, row in enumerate(logins):
    tbl.rows[r].height = px(62)
    for c, v in enumerate(row):
        cell = tbl.cell(r, c)
        cell.fill.solid(); cell.fill.fore_color.rgb = rgb(NAVY if r == 0 else WHITE if r % 2 else 'EEF2F7')
        cell.vertical_anchor = M
        tf = cell.text_frame; tf.text = v
        f = tf.paragraphs[0].runs[0].font
        f.size = Pt(12); f.bold = r == 0 or c == 0; f.name = MONO if (c > 0 and r > 0) else BODY
        f.color.rgb = rgb(WHITE if r == 0 else MUTED if c == 2 else INK)

# Next
s = frame('Next phase', 'What comes after this demo')
cards(s, [('More dashboards', '20 second-release and 8 third-release dashboards, once a few weeks of real data exist.', NAVY),
          ('Company accounts', 'Receiving-company P&L, retained earnings, dividends (B-09), once the scope is agreed.', ORANGE),
          ('Truck planning', 'Fill one truck from several POs, with subtotals per truck. Needs your sheet.', NAVY),
          ('KBL receipt', 'Match the columns and totals on the KBL receipt. Needs a sample.', ORANGE),
          ('Go live', 'Real SMS and email accounts, hosting, backups; GPS later.', NAVY)], h=460, tsize=32, bsize=25)

# Questions divider
s = new(NAVY)
dot(s, 1320, -200, 800, NAVY2)
rect(s, 140, 300, 120, 10, ORANGE)
text(s, 140, 350, 1300, 130, 'Questions for you', 96, WHITE, HEAD, True)
text(s, 140, 500, 1300, 220, 'Everything still open, grouped. Where we had to guess, the platform uses a safe default marked “to confirm”; answered ones (PO and plan approval) are gone.', 36, PALE, spacing=1.35)
text(s, 140, 930, 1640, 40, 'People and access · Money and costs · Dashboards · Branding · How the work runs · Services · Data', 26, PALE)


def qslide(kicker, title, left, right, size=28):
    s = frame(kicker, title)
    bullets(s, 120, 290, 805, left, size, 18, mark='?', h=680)
    bullets(s, 995, 290, 805, right, size, 18, mark='?', h=680)


qslide('Questions · 1 of 8', 'People and access', [
    'Who raises Nihna–GBI POs? (today: a director)',
    'Who loads at SBL Tanzania? (today: a placeholder loader)',
    'Who follows up the Rwanda → Juba re-export trucks? (today: Testfie)',
    'Who approves truck payments, and who handles sales and trip money? (today: directors)',
    'Do other Asie and Yonas staff need logins?'], [
    'Spelling Testfie and Yonas? Do Daniel and Michael have the same access?',
    'Loading queue order: Testfie, Kabonge or both? (today: both)',
    'Does Kabonge keep companies, suppliers and goods?',
    'Should directors also operate trucks (load, check in, acknowledge)?',
    'Phone numbers for Michael and the SBL loader?'])
qslide('Questions · 2 of 8', 'Money and costs', [
    'Split truck and warehouse costs by cases or by value? (today: cases)',
    'Who sets selling prices when the directors are away?',
    'Receiving-company accounts (P&L, retained earnings, dividends): Asie and Yonas only, or every company? Who records it?',
    'Unpaid fee flag: amber 2 weeks, red 1 month. OK?',
    'Which charges count as “actual transport”? (today: no duties or clearing)'], [
    'Warehouse expenses spread over every company’s goods received that month. OK?',
    'A month with expenses and no goods: show as “Other” or carry to next month?',
    'Damaged goods: count as an expense as well as in the cost per case?',
    'Selling price per warehouse, per company, in local currency?',
    'Re-export orders from one company’s stock, or mixed?'])
qslide('Questions · 3 of 8', 'Dashboards and alerts', [
    'Showcase item 7 did not come through: please resend it',
    'Reasons for shortage and damage: is our list right?',
    'Hours before a quiet truck is flagged? (web 6 / 12 h, phone 12 / 24 h)',
    'Stock cover: minimum 14 days, slow above 60, for every product?'], [
    'Customer payment terms: 14 days for all, or per customer?',
    'Should alerts be assigned and closed by hand?',
    'Directors also see today’s loading lists. OK?',
    'Should Yonas see re-exports coming to Juba on his phone strip?',
    'Room for 5 companies and 7 suppliers: keep as a limit?'])
qslide('Questions · 4 of 8', 'Companies and branding', [
    'Some reference documents mentioned in the requirements are missing. Can you send them?',
    'What is the platform called: BTW brand or a neutral one?',
    'NUD and Kivu logos as vector files, plus dark versions? Are our dark versions OK?',
    'Is there a group logo for the directors’ view?'], [
    'What does “branches” mean: towns, warehouses or companies?',
    'Kivu’s letterhead shows NUD’s email. Which is right, and Kivu’s full legal name?',
    'KRA PINs and registration numbers for each company’s letters?',
    'Correct full names for GBI and SBL?'])
qslide('Questions · 5 of 8', 'How the work runs (part 1)', [
    'How is truck capacity measured: cases, weight or pallets?',
    'Which currencies, and where do exchange rates come from?',
    'If two people change the same record offline, whose change wins?',
    'How often must reports refresh?',
    'Loading allowance: one % for all, or per supplier?',
    'Should a PO revision need anyone’s acknowledgement?'], [
    'Whose name goes on a PO as “prepared by”?',
    'Are staff or trucks shared between the three companies?',
    'Do drivers of market (hired) trucks get the app, or SMS only?',
    'Who may remove a truck from the waiting list?',
    'Office phone app: Play Store, or install from the browser only?'])
qslide('Questions · 6 of 8', 'How the work runs (part 2)', [
    'How do sales between the three companies work, and at what price?',
    'Should prices be hidden between companies?',
    'Can customers be shared between companies?',
    'Is Kigali a stop on the way, or a destination?',
    'Planned versus actual warnings below 85% and above 105%. OK?'], [
    'A missed check-in alerts after 3 hours. OK?',
    'Are the transfer points fixed for each route?',
    'Can the sender change the truck after loading?',
    'What SMS short code and keywords?'])
qslide('Questions · 7 of 8', 'Timeline and outside services', [
    'What is the target go-live date?',
    'When should GPS tracking come in, and will trucks have trackers?',
    'Should we import past records? From when?',
    'Do signatures need a legal e-signature service?'], [
    'Which SMS or WhatsApp provider, and what budget?',
    'Where should the system be hosted? Any data-location rules?',
    'Which accounting software must it connect to?',
    'Which languages: English, French, Swahili?',
    'Can we have live Africa’s Talking and Firebase accounts?'])
qslide('Questions · 8 of 8', 'Data and next-phase files', [
    'Real prices for each product, and in which currency?',
    'Truck capacity for each truck? (we assumed 2,000 cases)',
    'Drivers’ phone country codes? (we assumed +254 Kenya)',
    'Pack sizes for the 61 products without one?',
    'Who drives truck 22 (UAY 563H)?'], [
    'Lists for other transport providers (Joly and others)?',
    'The truck planning sheet (one truck, several POs)',
    'A KBL receipt, so we can match its columns',
    'The newest requirements document',
    'Sacco details: contacts and payment terms?'])

# Thanks
s = new(NAVY)
dot(s, -200, 540, 800, NAVY2)
image(s, A('btw-lockup-rev.png'), 750, 200, 420)
text(s, 0, 560, 1920, 130, 'Thank you', 96, WHITE, HEAD, True, C)
text(s, 0, 700, 1920, 60, 'Your answers shape the next phase.', 36, PALE, align=C)

prs.save(OUT)
print('wrote', OUT, len(prs.slides), 'slides')
