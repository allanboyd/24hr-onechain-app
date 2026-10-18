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


# ---------- slides ----------
# Cover
s = dark('BTW Supply Chain Platform', 'How it works, what we have built, and what we still need from you',
         'BTW Global Distributors · Nihna Unique Distributors · Kivu (Volcanic Distributors)   |   18 October 2026')
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
         ('Orders', 'POs typed and sent by hand', 'Planner issues the PO letter on letterhead in one click'),
         ('Deliveries', 'Paper delivery notes, shortages found late', 'Receiver signs on the phone; shortages recorded per leg'),
         ('Three companies', 'Separate spreadsheets for each company', 'One system, each company kept apart, group view for directors'),
         ('Reports', 'Directors wait for month-end figures', 'Planned versus actual and stock, any day')]
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
    ('BROWSER + PHONE', 'Office apps', 'Every office role', ['Period plans and purchase orders', 'Loading queues and the Truck desk', 'Stock, sales and reports', 'Team phone app: install from /app/'], NAVY),
    ('ANDROID PHONE', 'Field mobile app', 'Loader, driver, receiver', ['One job per screen, like Bolt or Uber', 'Big buttons, works offline', 'Sends when signal returns', 'Drivers without the app use SMS'], ORANGE),
    ('SERVER', 'Server and API', 'Behind the scenes', ['One address serves web, app and data', 'Sign-in, roles and company access', 'SMS, email, push, PDF letters', 'Every change is logged'], NAVY),
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
steps = [('1', 'Plan', 'Planner suggests the period plan', 'Web'), ('2', 'Order', 'Planner issues the PO letter', 'Web'),
         ('3', 'Line up', 'Truck planner orders the queue', 'Web'),
         ('4', 'Load', 'Loader loads within ±10%, hands over', 'App'), ('5', 'Drive', 'Driver checks in on the road', 'App / SMS'),
         ('6', 'Receive', 'Receiver checks and signs', 'App'), ('7', 'Report', 'Stock, sales and reports', 'Web')]
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
    text(s, x + 6, 524, sw - 12, 80, who, 23, MUTED, align=C)
    pw = len(ch) * 13 + 40
    rect(s, x + (sw - pw) / 2, 618, pw, 40, WHITE, acc, 2, 0.5)
    text(s, x + (sw - pw) / 2, 618, pw, 40, ch, 20, ORT if ch != 'Web' else NAVY, BODY, True, C, M)
rect(s, 120, 740, 1680, 110, WHITE, LINE, 2, 0.15)
dot(s, 160, 784, 22, ORANGE); text(s, 196, 772, 520, 50, 'Done on the phone, in the field', 26, anchor=M)
dot(s, 720, 784, 22, NAVY); text(s, 756, 772, 520, 50, 'Done on the web, in the office', 26, anchor=M)
text(s, 1260, 752, 520, 90, 'Director approval of POs is optional, a switch in the settings.', 24, MUTED, anchor=M, spacing=1.2)
text(s, 120, 880, 1680, 60, 'If the load differs from the PO, a PO revision (for example PO-001-rev001) is created and everyone is told.', 26, INK, anchor=M)

# Platform journey: swimlanes of actors and functions
s = frame('Platform journey', 'Who does what, step by step')
lanes = [('Planner', 'Web + phone', NAVY), ('Director', 'Web + phone', NAVY), ('Truck planner', 'Web + phone', NAVY),
         ('Loader', 'App', ORANGE), ('Driver', 'App / SMS', ORANGE), ('Receiver', 'App', ORANGE), ('Accounts', 'Web + phone', NAVY)]
LY, LH, LG = 285, 92, 5
LX, LW = 120, 250
GX = LX + LW + 14
ncol = 7
CW = (1800 - GX) / ncol
for i, (n, ch, acc) in enumerate(lanes):
    y = LY + i * (LH + LG)
    rect(s, GX, y, 1800 - GX, LH, WHITE if i % 2 == 0 else TINT)
    rect(s, LX, y, LW, LH, acc)
    text(s, LX + 22, y + 12, LW - 30, 40, n, 26, WHITE, HEAD, True)
    text(s, LX + 22, y + 54, LW - 30, 30, ch, 19, PALE if acc == NAVY else WHITE, BODY, True)
# (lane, column, label)
fn = [(0, 0, 'Period plan (a suggestion)'), (0, 1, 'Issue the PO, letter emailed'), (1, 1, 'Approve PO (only if switched on)'),
      (2, 2, 'Line up trucks in the queue'), (3, 3, 'Load ±10%; a change makes a PO revision'), (4, 4, 'Check in at each stop'),
      (2, 4, 'Follow trucks & costs'), (5, 5, 'Check, note shortages, sign'), (6, 6, 'Sales, costs, payments'), (1, 6, 'Planned vs actual')]
BW, BH = CW - 20, LH - 18
pos = {}
for lane, col, t in fn:
    x = GX + col * CW + 10
    y = LY + lane * (LH + LG) + 9
    acc = lanes[lane][2]
    rect(s, x, y, BW, BH, WHITE, acc, 3, 0.15, dash=(lane, col) == (1, 1))
    text(s, x + 8, y, BW - 16, BH, t, 19, NAVY, BODY, True, C, M, spacing=1.0)
    pos[(lane, col)] = (x, y)
order = [(0, 0), (0, 1), (2, 2), (3, 3), (4, 4), (5, 5), (6, 6)]
for (la, ca), (lb, cb) in zip(order, order[1:]):
    xa, ya = pos[(la, ca)]; xb, yb = pos[(lb, cb)]
    arrow(s, xa + BW, ya + BH / 2, xb, yb + BH / 2, ORANGE, 3, dash=True, elbow=True)
xa, ya = pos[(0, 1)]
arrow(s, xa + BW / 2, ya + BH, xa + BW / 2, ya + LH + LG, NAVY, 2, dash=True)
xa, ya = pos[(5, 5)]; xb, yb = pos[(1, 6)]
arrow(s, xa + BW, ya + BH / 2, xb, yb + BH / 2, ORANGE, 3, dash=True, elbow=True)

# Actors and functions
s = frame('Actors', 'Each person sees only their own work')
actors = [('Planner', 'Web + phone', NAVY, ['Period plans (a guide)', 'Issues POs to suppliers', 'Follows PO revisions']),
          ('Director', 'Web + phone', NAVY, ['Approves POs (optional)', 'One company or the group', 'Planned versus actual']),
          ('Truck planner', 'Web + phone', NAVY, ['Onboards providers and trucks', 'Orders the loading queues', 'Follows trucks and costs']),
          ('Accounts', 'Web + phone', NAVY, ['Records sales and payments', 'Trip and extra costs', 'Stock value, landing cost']),
          ('Loader (giver)', 'App', ORANGE, ['Sees the loading queue', 'Loads within ±10%', 'Hands over to the driver']),
          ('Driver', 'App or SMS', ORANGE, ['Sees one trip at a time', 'Checks in on the road', 'Reports a problem']),
          ('Receiver', 'App', ORANGE, ['Confirms the arrival', 'Notes shortages, signs', 'Sends goods onward'])]
aw, ah = (1680 - 90) / 4, 320
for i, (n, ch, acc, items) in enumerate(actors):
    x = 120 + (i % 4) * (aw + 30)
    y = 290 + (i // 4) * (ah + 26)
    rect(s, x, y, aw, ah, WHITE, LINE, 2, 0.06)
    rect(s, x, y, 10, ah, acc)
    text(s, x + 36, y + 24, aw - 60, 46, n, 32, NAVY, HEAD, True)
    pill(s, x + 36, y + 76, ch, acc, filled=False, size=18)
    bullets(s, x + 36, y + 136, aw - 60, items, 24, 10, h=ah - 146)
x = 120 + 3 * (aw + 30); y = 290 + ah + 26
rect(s, x, y, aw, ah, OTINT, ORANGE, 2, 0.06, dash=True)
text(s, x + 36, y + 28, aw - 72, ah - 56, [('Settings, not code', {'size': 28, 'font': HEAD, 'bold': True, 'color': NAVY, 'after': 12}),
     ('Director approval of POs, the loading allowance (±10%) and alternatives are switches in apps/api/config.toml.', {'size': 22, 'color': INK})], spacing=1.25)

# Field app
s = frame('Field mobile app', 'One clear job for each person')
phones = [('loader-handover.png', 'LOADER', 'Sees the truck that is due, counts cases per product, and hands over to the driver.'),
          ('driver-home.png', 'DRIVER', 'Sees one trip. Taps “I’m here” at each checkpoint, or reports a problem.'),
          ('receiver-sign.png', 'RECEIVER', 'Checks what arrived, notes any shortage, and signs. Stock updates at once.')]
pw_ = (1680 - 80) / 3
for i, (img, role, cap) in enumerate(phones):
    x = 120 + i * (pw_ + 40)
    ph_w = 280; ph_h = ph_w * 1688 / 780
    rect(s, x - 8, 292, ph_w + 16, ph_h + 16, INK, r=0.08)
    image(s, A(img), x, 300, ph_w)
    text(s, x + ph_w + 30, 320, pw_ - ph_w - 30, 30, role, 22, ORT, BODY, True)
    text(s, x + ph_w + 30, 364, pw_ - ph_w - 30, 400, cap, 27, INK, spacing=1.3)
rect(s, 120, 940, 1500, 2, LINE)
text(s, 120, 950, 1500, 40, 'Unchanged for field roles. Office staff who sign in at the same /app/ address get the team phone app instead (next slide).', 22, MUTED)

# Team phone app (PWA)
s = frame('New · team phone app', 'Phone app for the office team')
shots = [('pwa-planner-home.png', 'Planner · home'), ('pwa-director-home-dark.png', 'Director · group, dark mode'), ('pwa-accounts-drawer.png', 'Accounts · side drawer')]
ph_w = 270; ph_h = ph_w * 1688 / 780
for i, (img, cap) in enumerate(shots):
    x = 128 + i * (ph_w + 46)
    rect(s, x - 8, 282, ph_w + 16, ph_h + 16, INK, r=0.08)
    image(s, A(img), x, 290, ph_w)
    text(s, x - 20, 290 + ph_h + 22, ph_w + 40, 34, cap, 20, MUTED, BODY, True, C)
x2 = 1100
bullets(s, x2, 290, 700, ['Installs from the browser at /app/, no app store', 'Same sign-in: phone + PIN', 'Home: main menu, figures at a glance, “Needs attention”',
                          'Bottom tabs per role, side drawer for every screen', 'Light and dark mode; works for one company or the group'], 25, 12, h=380)
label(s, x2, 690, 'Bottom tabs by role')
tabs = [('Director', 'Home · Trucks · Orders · Money · More'), ('Planner', 'Home · Trucks · Orders · Stock · More'),
        ('Accounts', 'Home · Trucks · Orders · Money · More'), ('Truck planner', 'Home · Queue · Trucks · Money · More')]
for i, (r_, t_) in enumerate(tabs):
    y = 728 + i * 56
    rect(s, x2, y, 700, 48, WHITE if i % 2 == 0 else TINT, r=0.2)
    text(s, x2 + 20, y, 190, 48, r_, 21, NAVY, BODY, True, anchor=M)
    text(s, x2 + 215, y, 480, 48, t_, 21, INK, anchor=M)

# Office web
s = frame('Office web app', 'Plans, orders and reports in the browser')
image(s, A('web-dashboard.png'), 120, 300, 1000)
rect(s, 120, 300, 1000, 625, None, 'D5DCE6', 2)
bullets(s, 1170, 300, 630, ['Period plans as suggestions, no overlaps', 'Planners issue POs; revisions shown as a chain', 'Planned versus actual, with warnings',
                            'Live board of every shipment', 'Interactive charts you can filter and zoom', 'Product list and truck list from your data',
                            'Each role sees only its own screens'], 27, 14)

# Loading allowance and PO revisions
s = frame('New · loading', 'Loading with an allowance and PO revisions')
for i, (img, cap) in enumerate([('loader-allowance.png', 'Allowance meter'), ('loader-alternative.png', 'Load an alternative')]):
    x = 128 + i * 300
    ph_w = 260; ph_h = ph_w * 1688 / 780
    rect(s, x - 8, 282, ph_w + 16, ph_h + 16, INK, r=0.08)
    image(s, A(img), x, 290, ph_w)
    text(s, x - 20, 290 + ph_h + 22, ph_w + 40, 34, cap, 20, MUTED, BODY, True, C)
fx = 760
steps_ = [('PO-001', 'Issued by the planner', NAVY), ('Loader changes', 'a quantity, a missing item or an alternative, within ±10%', ORANGE),
          ('PO-001-rev001', 'Created and issued at once, in the same step', ORANGE), ('Everyone follows', 'Planners and directors told; shipments use the latest revision', NAVY)]
fw_ = (1800 - fx - 3 * 36) / 4
for i, (t_, sub_, acc_) in enumerate(steps_):
    x = fx + i * (fw_ + 36)
    rect(s, x, 290, fw_, 230, WHITE, acc_, 3, 0.08)
    text(s, x + 18, 312, fw_ - 36, 40, t_, 23, NAVY, HEAD, True)
    text(s, x + 18, 362, fw_ - 36, 150, sub_, 20, MUTED, spacing=1.25)
    if i < 3:
        arrow(s, x + fw_ + 3, 405, x + fw_ + 33, 405, ORANGE, 4)
bullets(s, fx, 570, 500, ['Beyond ±10%, or over the truck’s size, the app refuses: ask the planner to change the PO', 'A second change makes -rev002, always numbered from the original',
                          'Old versions stay viewable; nothing is counted twice'], 22, 12, h=360)
cx = 1300
rect(s, cx, 570, 500, 360, NAVY, r=0.06)
text(s, cx + 30, 592, 440, 30, 'SETTINGS · apps/api/config.toml', 18, ORANGE, BODY, True)
text(s, cx + 30, 640, 440, 280, ['[approvals]', 'purchase_orders = false', '', '[loading]', 'allowance_pct = 10', 'allow_alternatives = true', 'revision_suffix = "-rev"'],
     20, WHITE, MONO, spacing=1.2)

# Truck planner
s = frame('New · role', 'Truck planner')
fit_image(s, A('web-truck-desk.png'), 120, 290, 840, 600)
rect(s, 120, 290 + (600 - 840 * 1000 / 1440) / 2, 840, 840 * 1000 / 1440, None, 'D5DCE6', 2)
text(s, 120, 905, 840, 34, 'Truck desk on the web: every truck by state, queue waits, delays, costs', 20, MUTED, BODY, True)
ph_h = 600; ph_w = ph_h * 780 / 1300
x = 1000
rect(s, x - 8, 282, ph_w + 16, ph_h + 16, INK, r=0.06)
image(s, A('pwa-truck-planner-home.png'), x, 290, ph_w)
text(s, x - 20, 905, ph_w + 40, 34, 'Team phone app', 20, MUTED, BODY, True, C)
bx = x + ph_w + 50
bullets(s, bx, 290, 1800 - bx, ['Onboards providers, saccos, trucks and drivers', 'Orders the loading queues; loaders are told of every change',
                                'Sees where each truck is, delays and issues', 'Expenses per truck and per provider', 'No access to POs, plans or sales'], 23, 12, h=400)
rect(s, bx, 690, 1800 - bx, 200, OTINT, ORANGE, 2, 0.08, dash=True)
text(s, bx + 24, 708, 1800 - bx - 48, 170, [('DEMO SIGN-INS', {'size': 18, 'bold': True, 'color': ORT, 'after': 6}),
     ('btw-trucks (BTW only)', {'size': 20, 'bold': True}), ('+254700000017', {'size': 20, 'font': MONO, 'after': 8}),
     ('trucks (all three companies)', {'size': 20, 'bold': True}), ('+254700000018', {'size': 20, 'font': MONO})], 20, INK)

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
          ('Add warehouses', 'Today: Congo – Goma, Rwanda – Gisenyi, South Sudan – Juba. Owners can add more towns.', ORANGE)], y=510, h=400)

# ---------- technical ----------
# T1 Technical architecture
s = frame('Technical · 1 of 3', 'Architecture')
L = 1200
label(s, 120, 290, 'Clients')
cl = [('Office web app', 'Svelte 5 · about 113 KB', NAVY), ('Team phone app (PWA)', 'Office roles · /app/', NAVY), ('Field app', 'Capacitor 7 · Android', ORANGE), ('SMS / USSD', 'Africa’s Talking', ORANGE)]
bw = (L - 60) / 4
for i, (t, sub, b) in enumerate(cl):
    box(s, 120 + i * (bw + 20), 324, bw, 92, t, sub, border=b, size=22, subsize=18)
for i in range(4):
    cx = 120 + i * (bw + 20) + bw / 2
    arrow(s, cx, 418, cx, 452, ORANGE, 4)
box(s, 120, 456, L, 112, 'One server · NestJS 11 on Fastify', 'Serves web, apps and /v1 API · sign-in (JWT) · roles · company scope · audit log · sync · settings from config.toml', NAVY, NAVY, WHITE, 28, 21)
arrow(s, 120 + L / 2, 570, 120 + L / 2, 604, ORANGE, 4)
label(s, 120, 606, 'Business modules')
mods = ['Plans', 'POs', 'Trucks', 'Stock', 'Sales', 'Finance', 'Reports']
mw = (L - 12 * 6) / 7
for i, m in enumerate(mods):
    box(s, 120 + i * (mw + 12), 640, mw, 70, m, size=22)
arrow(s, 120 + L / 2, 712, 120 + L / 2, 746, ORANGE, 4)
box(s, 120, 750, L, 96, 'PostgreSQL 17 + PostGIS', 'Drizzle migrations · every record tagged by company · checkpoints as map areas', size=28, subsize=21)
rect(s, 120, 866, L, 70, OTINT, ORANGE, 2, 0.2, dash=True)
text(s, 150, 866, L - 60, 70, 'Shared package: one typed client and one set of business rules used by the web app, the field app and the server.', 22, INK, anchor=M)
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
text(s, 160, 830, 1600, 110, 'Each leg is its own shipment, linked to the one before. Shortages show on the leg where they happen, and costs carry forward into the final landing cost.', 24, INK, anchor=M, spacing=1.3)

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
                              'Switches in apps/api/config.toml: PO approval on or off, loading allowance, alternatives, revision suffix.'], 22, MUTED, spacing=1.2)
x2 = 1430
rect(s, x2, 290, 370, 640, WHITE, LINE, 2, 0.05)
rect(s, x2, 290, 370, 10, ORANGE)
text(s, x2 + 28, 316, 320, 40, 'Security', 30, NAVY, HEAD, True)
bullets(s, x2 + 28, 372, 320, ['Password (web) or phone + PIN (phone apps)', 'Short-lived sign-in tokens; lock-out after wrong tries', 'Each role sees only its screens', 'Staff see only their company', 'Every change logged: who and when', 'Database company rules ready as a second net'], 21, 10)

# Why trust it
s = frame('Why it fits you', 'Built for the roads you use')
cards(s, [('Works on weak signal', 'The app saves work offline and sends it later. Drivers without a smartphone use SMS.', ORANGE),
          ('Light and fast', 'Web app about 113 KB, phone app about 74 KB, so it loads quickly even on slow connections.', NAVY),
          ('No licence fees', 'Built on proven open-source tools. Your data stays in your own database.', ORANGE),
          ('Ready to grow', 'Add warehouses, routes, trucks and providers yourself. GPS can be added later.', NAVY)], h=420)
rect(s, 120, 760, 1680, 150, NAVY, r=0.1)
text(s, 170, 760, 1580, 150, [('Tested before you see it', {'size': 30, 'font': HEAD, 'bold': True, 'color': ORANGE, 'after': 8}),
                              ('638 automated checks run against the platform, covering rules, security, each company’s data and load. All pass today.', {'size': 25, 'color': WHITE})], anchor=M)

# Done
s = frame('Progress', 'What is done today')
stats = [('131', 'products loaded from your price list'), ('30', 'ETS Sabrina trucks and drivers'), ('638', 'automated quality checks, all passing'), ('3', 'companies with their own letterheads')]
sw = (1680 - 90) / 4
for i, (n, t) in enumerate(stats):
    x = 120 + i * (sw + 30)
    rect(s, x, 300, sw, 230, NAVY, r=0.08)
    text(s, x + 34, 330, sw - 68, 90, n, 72, ORANGE, HEAD, True)
    text(s, x + 34, 425, sw - 68, 90, t, 25, 'E3EAF4', spacing=1.25)
text(s, 120, 548, 1680, 30, 'Web app 112.7 KB · phone app 73.5 KB', 22, MUTED, BODY, True)
bullets(s, 120, 600, 820, ['Office web app, field app and server all working together', 'Android app built and installed on a phone', 'Three months of sample data, end to end',
                           'Period plans, POs and planned versus actual', 'Legs as new shipments, warehouses you can add', 'Architecture document in PDF and Word'], 26, 12, h=360)
label(s, 980, 600, 'New', color=ORT)
bullets(s, 980, 640, 820, ['Plans are suggestions; planners issue POs (director approval is a switch)', 'Loading within ±10% with automatic PO revisions',
                           'Truck planner role and the office team phone app'], 26, 12, h=320)

# Demo
s = frame('Try it', 'Demo link and sign-ins')
rect(s, 120, 300, 760, 330, NAVY, r=0.08)
text(s, 156, 334, 690, 30, 'OFFICE WEB APP', 22, ORANGE, BODY, True)
text(s, 156, 374, 690, 80, 'Demo link: shared on the day', 30, WHITE, HEAD, True)
text(s, 156, 490, 690, 30, 'ON A PHONE (FIELD AND OFFICE TEAM)', 22, ORANGE, BODY, True)
text(s, 156, 530, 690, 50, '<demo link>/app/', 28, WHITE, MONO)
text(s, 120, 660, 760, 200, 'The link is temporary. On the web, tap a demo account to sign in: password demo1234. On a phone, sign in with the phone number and PIN 1234, including office staff.', 24, MUTED, spacing=1.35)
logins = [('Director', '+254700000001', 'all companies'), ('Planner', 'btw-plan', 'also nud-plan, kvd-plan'), ('Accounts', 'btw-acc', 'also nud-acc, kvd-acc'),
          ('Truck planner', 'btw-trucks', '+254700000017 · also trucks'), ('Receiver', 'asie', 'Gisenyi and Goma'), ('Driver', '+254702750019', 'Mawazi K, KBV 894T'), ('Driver', '+254701811686', 'Kanyike E, SSD 879T')]
tbl = s.shapes.add_table(len(logins), 3, px(930), px(300), px(870), px(70 * len(logins))).table
for c, wv in enumerate([210, 280, 380]):
    tbl.columns[c].width = px(wv)
for r, row in enumerate(logins):
    for c, v in enumerate(row):
        cell = tbl.cell(r, c)
        cell.fill.solid(); cell.fill.fore_color.rgb = rgb(WHITE if r % 2 == 0 else 'EEF2F7')
        cell.vertical_anchor = M
        tf = cell.text_frame; tf.text = v
        f = tf.paragraphs[0].runs[0].font
        f.size = Pt(12.5); f.bold = c == 0; f.name = MONO if c == 1 else BODY
        f.color.rgb = rgb(MUTED if c == 2 else INK)

# Next
s = frame('Next phase', 'What comes after this demo')
cards(s, [('Truck planning', 'Fill one truck from several POs, with subtotals per truck.', ORANGE),
          ('KBL receipt', 'Match the columns and totals on the KBL receipt.', NAVY),
          ('Go live', 'Real SMS and email accounts, hosting, then GPS trackers later.', ORANGE)], h=400)

# Questions divider
s = new(NAVY)
dot(s, 1320, -200, 800, NAVY2)
rect(s, 140, 300, 120, 10, ORANGE)
text(s, 140, 350, 1300, 130, 'Questions for you', 96, WHITE, HEAD, True)
text(s, 140, 500, 1300, 220, 'Everything we asked since the project started and still need answered. Where we had to guess, the platform uses a safe default marked “to confirm”.', 36, PALE, spacing=1.35)
text(s, 140, 930, 1640, 40, 'Branding · Roles · Process · Timeline and services · Data', 28, PALE)


def qslide(kicker, title, left, right):
    s = frame(kicker, title)
    bullets(s, 120, 300, 805, left, 30, 24, mark='?')
    bullets(s, 995, 300, 805, right, 30, 24, mark='?')


qslide('Questions · 1 of 6', 'Companies and branding', [
    'Some reference documents mentioned in the requirements are missing. Can you send them?',
    'What is the platform called, and does it carry the BTW brand or a neutral one?',
    'Can you send NUD and Kivu logos as vector files, plus dark versions?',
    'Do you approve the dark logo versions we made?',
    'Is there a group logo for the directors’ view?'], [
    'Are Asie and Zonas separate companies, or sites of one company?',
    'What does “branches” mean: towns, warehouses or companies?',
    'Kivu’s letterhead shows NUD’s email. Which is correct, and what is Kivu’s full legal name?',
    'KRA PINs and registration numbers for each company’s letters?',
    'Correct full names for GBI and SBL?'])
qslide('Questions · 2 of 6', 'People and access', [
    'Who besides the truck planner may add transport providers?',
    'Who may remove a truck from the waiting list?',
    'Does a loading point see only its own trucks, or all trucks?',
    'Do drivers of market (hired) trucks get the app, or SMS only?'], [
    'Whose name goes on a PO as “prepared by”?',
    'Can you confirm which role sees which screens (our role list)?',
    'Are staff or trucks shared between the three companies?',
    'Should loading points see trucks already on the road?',
    'Office phone app: Play Store, or install from the browser only?'])
qslide('Questions · 3 of 6', 'How the work runs (part 1)', [
    'How is truck capacity measured: cases, weight or pallets?',
    'How are landing costs shared across products on a truck?',
    'Which currencies, and where do exchange rates come from?',
    'Are sales recorded one by one or in batches?',
    'How detailed should management accounts be?'], [
    'What sales speed counts as slow-moving stock?',
    'If two people change the same record offline, whose change wins?',
    'How long after delivery is the transport fee followed up?',
    'How often must reports refresh?',
    'Loading allowance: one % for all, or per supplier?',
    'Should a PO revision need anyone’s acknowledgement?'])
qslide('Questions · 4 of 6', 'How the work runs (part 2)', [
    'How do sales between the three companies work, and at what price?',
    'Should prices be hidden between companies?',
    'Can customers be shared between companies?',
    'Is Kigali a stop on the way, or a destination?',
    'Planned versus actual warnings: we use below 85% and above 105%. OK?'], [
    'A missed check-in alerts after 3 hours. OK?',
    'Are the transfer points fixed for each route?',
    'On an onward leg, who records the transport price?',
    'Can the sender change the truck after loading?',
    'Do you want subtotals per truck on the PO? What SMS short code and keywords?'])
qslide('Questions · 5 of 6', 'Timeline and outside services', [
    'What is the target go-live date?',
    'When should GPS tracking come in, and will trucks have trackers?',
    'Should we import past records? From when?',
    'Do signatures need a legal e-signature service?'], [
    'Which SMS or WhatsApp provider, and what budget?',
    'Where should the system be hosted? Any data-location rules?',
    'Which accounting software must it connect to?',
    'Which languages: English, French, Swahili?',
    'Can we have live Africa’s Talking and Firebase accounts?'])
qslide('Questions · 6 of 6', 'Data and next-phase files', [
    'Real prices for each product, and in which currency?',
    'Truck capacity for each truck? (we assumed 2,000 cases)',
    'Drivers’ phone country codes? (we assumed +254 Kenya)',
    'Pack sizes for the 61 products without one?',
    'Who drives truck 22 (UAY 563H)?'], [
    'Lists for other transport providers (Joly and others)?',
    'Please send the truck planning sheet (image)',
    'Please send a KBL receipt so we can match its columns',
    'Please send the newest requirements document',
    'Sacco details: contacts and payment terms?'])

# Thanks
s = new(NAVY)
dot(s, -200, 540, 800, NAVY2)
image(s, A('btw-lockup-rev.png'), 750, 200, 420)
text(s, 0, 560, 1920, 130, 'Thank you', 96, WHITE, HEAD, True, C)
text(s, 0, 700, 1920, 60, 'Your answers shape the next phase.', 36, PALE, align=C)

prs.save(OUT)
print('wrote', OUT, len(prs.slides), 'slides')
