#!/usr/bin/env python3
"""Builds the BTW platform architecture pack from one source:
  diagrams/*.drawio                 editable in draw.io / diagrams.net (animated "flow" arrows)
  BTW-Platform-Architecture.html    the document (embeds the same diagrams via the draw.io viewer)
Run:  python3 docs/architecture/build.py   (then `node docs/architecture/pdf.mjs` for the PDF + diagrams/*.png,
      then `python3 docs/architecture/build_docx.py` for the Word copy)
"""
import html, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
NAVY, ORANGE, GREEN, GREY = '#062953', '#FE7514', '#15703A', '#66768C'

# ---------------------------------------------------------------- tiny mxGraph DSL
class D:
    def __init__(self, name, title):
        self.name, self.title, self.cells, self.n = name, title, [], 0
    def _id(self, p): self.n += 1; return f'{p}{self.n}'
    def v(self, label, x, y, w, h, style, id=None, parent='1'):
        id = id or self._id('v')
        self.cells.append(f'<mxCell id="{id}" value="{html.escape(label)}" style="{html.escape(style)}" vertex="1" parent="{parent}"><mxGeometry x="{x}" y="{y}" width="{w}" height="{h}" as="geometry"/></mxCell>')
        return id
    def e(self, s, t, label='', style='', pts=None, exit=None, entry=None):
        id = self._id('e')
        st = style + (f'exitX={exit[0]};exitY={exit[1]};exitDx=0;exitDy=0;' if exit else '') + (f'entryX={entry[0]};entryY={entry[1]};entryDx=0;entryDy=0;' if entry else '')
        geo = '<mxGeometry relative="1" as="geometry">' + ('<Array as="points">' + ''.join(f'<mxPoint x="{x}" y="{y}"/>' for x, y in pts) + '</Array>' if pts else '') + '</mxGeometry>'
        self.cells.append(f'<mxCell id="{id}" value="{html.escape(label)}" style="{html.escape(st)}" edge="1" parent="1" source="{s}" target="{t}">{geo}</mxCell>')
        return id
    def xml(self):
        return '<mxGraphModel grid="0" page="0" fontFamily="Inter"><root><mxCell id="0"/><mxCell id="1" parent="0"/>' + ''.join(self.cells) + '</root></mxGraphModel>'
    def save(self):
        doc = f'<mxfile host="btw-build"><diagram name="{html.escape(self.title)}" id="{self.name}">{self.xml()}</diagram></mxfile>'
        os.makedirs(f'{HERE}/diagrams', exist_ok=True)
        open(f'{HERE}/diagrams/{self.name}.drawio', 'w').write(doc)

# Edge styles (flowAnimation = moving dashes in draw.io)
EDGE = 'html=1;rounded=1;fontSize=10;fontColor=#33435A;labelBackgroundColor=#FFFFFF;'
REQ = EDGE + f'endArrow=block;endFill=1;strokeWidth=2;strokeColor={NAVY};flowAnimation=1;'
RES = EDGE + f'endArrow=open;strokeWidth=2;strokeColor={ORANGE};dashed=1;flowAnimation=1;'
DOT = EDGE + f'endArrow=open;strokeWidth=1.5;strokeColor={GREY};dashed=1;dashPattern=1 4;flowAnimation=1;'
FLOW = EDGE + f'endArrow=block;endFill=1;strokeWidth=1.5;strokeColor={NAVY};flowAnimation=1;edgeStyle=orthogonalEdgeStyle;'
XLANE = EDGE + f'endArrow=open;strokeWidth=1.5;strokeColor={ORANGE};dashed=1;dashPattern=2 4;flowAnimation=1;edgeStyle=orthogonalEdgeStyle;'
PLAIN = EDGE + f'endArrow=none;strokeWidth=1;strokeColor={GREY};'

ICON = 'sketch=0;outlineConnect=0;fontColor=#0B1B33;strokeColor=none;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=11;aspect=fixed;pointerEvents=1;'
BOX = 'rounded=1;whiteSpace=wrap;html=1;arcSize=10;fontSize=11;'
SVC = BOX + f'fillColor=#EEF3FA;strokeColor={NAVY};fontColor={NAVY};'
ADP = BOX + 'fillColor=#FFF4EC;strokeColor=#DF4901;fontColor=#5C1D00;'
GROUP = 'rounded=1;whiteSpace=wrap;html=1;arcSize=3;verticalAlign=top;align=left;spacingLeft=10;spacingTop=4;fontStyle=1;fontSize=12;dashed=1;'
CYL = 'shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;size=10;fontSize=11;'

# ---------------------------------------------------------------- 1. Architecture
def architecture():
    d = D('01-architecture', 'Architecture')
    F9 = lambda t: f'<font style="font-size:10px">{t}</font>'
    d.v('Users &amp; devices', 0, 0, 200, 640, GROUP + 'fillColor=#F6F8FB;strokeColor=#8593A8;')
    d.v('BTW server · one address (http://host:3101)', 230, 0, 660, 500, GROUP + f'fillColor=#FFFFFF;strokeColor={NAVY};fontColor={NAVY};')
    d.v('Data', 230, 530, 660, 170, GROUP + 'fillColor=#F6F8FB;strokeColor=#8593A8;')
    d.v('External services', 930, 0, 290, 500, GROUP + 'fillColor=#FFF9F4;strokeColor=#DF4901;fontColor=#8F2D00;')
    # clients
    web = d.v('<b>Office web app</b><br>' + F9('Daniel · Michael · Kabonge · Testfie<br>Asie · Yonas (warehouse money)'), 60, 40, 80, 66, ICON + 'fontSize=12;fillColor=#062953;shape=mxgraph.aws4.client;')
    pwa = d.v('<b>Team phone app (PWA)</b><br>' + F9('per-person home screens · /app/<br>installed from the browser'), 76, 180, 48, 66, ICON + 'fontSize=12;fillColor=#062953;shape=mxgraph.aws4.mobile_client;')
    fld = d.v('<b>Field app (Android)</b><br>' + F9('loaders (no prices) · drivers · receivers<br>offline outbox · GPS · camera'), 72, 330, 56, 76, ICON + 'fontSize=12;fillColor=#062953;shape=mxgraph.aws4.mobile_client;')
    fph = d.v('<b>Feature phone</b><br>' + F9('driver SMS / USSD'), 78, 490, 44, 72, 'shape=mxgraph.android.phone2;strokeWidth=2;strokeColor=#062953;verticalLabelPosition=bottom;verticalAlign=top;html=1;fontSize=12;')
    # server: static, gateway bar, services, rules, adapters
    d.v('<b>Static hosting</b> · / web · /app/ field + team app · /brand/ logos', 300, 34, 570, 30, BOX + 'fontSize=12;fillColor=#F6F8FB;strokeColor=#8593A8;')
    gw = d.v('<b>API gateway /v1</b><br><br>NestJS 11 · Fastify<br><br>Auth: JWT, password or phone + PIN<br><br>Role, feature &amp; scope guard<br>(company · pair · point · warehouse)<br><br>Audit log<br>(before / after)<br><br>Idempotency keys<br><br>App-version check', 245, 80, 120, 400, BOX + f'fontSize=11;fillColor={NAVY};strokeColor={NAVY};fontColor=#FFFFFF;')
    svcs = ['Planning &amp; PO', 'Loading &amp; dispatch', 'Tracking · ETA', 'Receipt &amp; stock', 'Warehouse money', 'Re-exports', 'Sales · prices', 'Fees · landed cost v2', 'Dashboards', 'Offline sync', 'Notifications', 'Audit · static data']
    for i, s in enumerate(svcs):
        d.v(s, 385 + (i % 3) * 103, 80 + (i // 3) * 50, 97, 42, SVC + 'fontSize=11;')
    rules = d.v('<b>Shared business rules</b><br>' + F9('rules.ts · access.ts · performance.ts · dashboards.ts<br>same code in server, web &amp; field'), 385, 410, 303, 52, BOX + 'fontSize=12;fillColor=#E6F4EC;strokeColor=#15703A;fontColor=#0E2A1E;')
    d.v('Domain services', 385, 286, 303, 20, 'text;html=1;fontSize=11;fontColor=#4A5A70;align=center;')
    d.v('<b>Settings</b> · apps/api/config.toml<br>' + F9('PO approval (off) · allowance ±% · revision suffix<br>[fees] amber / red days · [costs] allocation'), 385, 330, 303, 52, BOX + 'fontSize=11;fillColor=#FFF9E6;strokeColor=#8A5300;fontColor=#3D2600;')
    adp = {}
    for i, a in enumerate(['SMS / USSD', 'Email (SMTP)', 'Push (FCM)', 'Routing (OSRM)', 'PDF letters (Typst)', 'Files']):
        adp[a] = d.v(a, 712, 80 + i * 66, 158, 48, ADP + 'fontSize=12;')
    d.v('Adapters · real or local stand-in', 712, 470, 158, 24, 'text;html=1;fontSize=11;fontColor=#8F2D00;align=center;')
    # data
    db = d.v('<b>PostgreSQL 17 + PostGIS</b><br>' + F9('39 tables · checkpoints &amp; GPS as geography · audit'), 420, 570, 230, 110, CYL + 'fontSize=12;fillColor=#D9E3F1;strokeColor=#062953;')
    fs = d.v('<b>File store</b><br>' + F9('photos · signatures · PDFs'), 720, 570, 140, 110, CYL + 'fontSize=12;fillColor=#FFE3CC;strokeColor=#DF4901;')
    # external services aligned with their adapters
    CL = 'ellipse;shape=cloud;whiteSpace=wrap;html=1;fontSize=12;fillColor=#FFF4EC;strokeColor=#DF4901;'
    at = d.v("Africa's Talking<br>" + F9('SMS · USSD'), 965, 64, 140, 80, CL)
    em = d.v('Email server<br>' + F9('Mailpit locally'), 965, 134, 140, 76, CL)
    fcm = d.v('Firebase FCM<br>' + F9('push'), 965, 200, 140, 76, CL)
    osr = d.v('OSRM<br>' + F9('road routing'), 965, 266, 140, 76, CL)
    sup = d.v('<b>Supplier</b><br>' + F9('export section'), 1150, 150, 50, 50, ICON + 'fontSize=11;fillColor=#062953;shape=mxgraph.aws4.users;')
    # requests (navy solid, moving) · responses (orange dashed, moving) · notifications (grey dotted, moving)
    d.e(web, gw, 'HTTPS request', REQ, exit=(1, 0.35), entry=(0, 0.06))
    d.e(gw, web, 'JSON response', RES, exit=(0, 0.16), entry=(1, 0.8))
    d.e(pwa, gw, 'HTTPS · same API', REQ, exit=(1, 0.4), entry=(0, 0.3))
    d.e(fld, gw, '/sync/batch · GPS pings', REQ, exit=(1, 0.3), entry=(0, 0.62))
    d.e(gw, fld, 'result per item', RES, exit=(0, 0.72), entry=(1, 0.72))
    d.e(rules, db, 'SQL', REQ, exit=(0.3, 1), entry=(0.35, 0))
    d.e(db, rules, 'rows', RES, exit=(0.62, 0), entry=(0.6, 1))
    d.e(adp['Files'], fs, 'put / get', REQ, exit=(0.5, 1), entry=(0.5, 0))
    d.e(at, adp['SMS / USSD'], 'webhook', REQ, exit=(0.07, 0.4), entry=(1, 0.3))
    d.e(adp['SMS / USSD'], at, 'reply SMS', RES, exit=(1, 0.75), entry=(0.1, 0.7))
    d.e(adp['Email (SMTP)'], em, 'PO letter', REQ, exit=(1, 0.5), entry=(0.08, 0.5))
    d.e(em, sup, 'email', DOT, exit=(0.95, 0.5), entry=(0, 0.5))
    d.e(adp['Push (FCM)'], fcm, 'trip assigned', REQ, exit=(1, 0.5), entry=(0.08, 0.5))
    d.e(adp['Routing (OSRM)'], osr, 'route', REQ, exit=(1, 0.3), entry=(0.08, 0.4))
    d.e(osr, adp['Routing (OSRM)'], 'hours · km', RES, exit=(0.1, 0.7), entry=(1, 0.75))
    d.e(fcm, fld, 'push notification', DOT, exit=(0.85, 0.85), entry=(0.5, 1), pts=[(1180, 262), (1180, 506), (208, 506), (208, 420), (100, 420)])
    d.e(fph, at, 'SMS "ARR MALABA KDA123A"', DOT, exit=(1, 0.5), entry=(0.55, 0.12), pts=[(222, 526), (222, 522), (1200, 522), (1200, 40), (1042, 40)])
    d.save(); return d

# ---------------------------------------------------------------- 2. Process (swimlanes)
def process():
    d = D('02-process', 'Process — planning to reconciliation')
    lanes = ['Planner (Kabonge)', 'Directors (Daniel · Michael)', 'Truck follow-up (Testfie)', 'Loaders (Joel · Eric · Moses)', 'Driver', 'BTW platform (system)', 'Receivers (Asie · Yonas)', 'Directors · money']
    PX = [130, 300, 455, 650, 880, 1070, 1240, 1410]
    phases = ['1 · Plan (suggestion)', '2 · Purchase order', '3 · Load &amp; dispatch', '4 · Route &amp; monitor', '5 · Receive', '6 · Inventory &amp; sales', '7 · Reconcile']
    LH, TOP = 90, 30
    for i, p in enumerate(phases):
        d.v(p, PX[i], 0, PX[i + 1] - PX[i], TOP, f'rounded=0;html=1;fontSize=12;fontStyle=1;fillColor={NAVY};fontColor=#FFFFFF;strokeColor=#FFFFFF;')
    for i, l in enumerate(lanes):
        y = TOP + i * LH
        d.v('', 0, y, PX[-1], LH, f'rounded=0;html=1;fillColor={"#FFFFFF" if i % 2 else "#F6F8FB"};strokeColor=#CBD3DF;')
        d.v(l, 0, y, 130, LH, f'rounded=0;whiteSpace=wrap;html=1;fontSize=12;fontStyle=1;fillColor=#EEF1F6;strokeColor=#CBD3DF;fontColor={NAVY};')
    Y = lambda lane: TOP + lane * LH + 18
    S9 = lambda t: f'<br><font style="font-size:10px;color:#4A5A70">{t}</font>'
    T = BOX + 'fontSize=12;fillColor=#FFFFFF;strokeColor=#062953;'
    SYS = BOX + 'fontSize=12;fillColor=#EEF3FA;strokeColor=#062953;'
    DEC = 'rhombus;whiteSpace=wrap;html=1;fontSize=11;fillColor=#FFF4D1;strokeColor=#8A5300;'
    H = 54
    b = lambda lane, x, w, t, st=T: d.v(t, x, Y(lane), w, H, st)
    plan = b(0, 140, 150, 'Period plan' + S9('his pairs · a suggestion'))
    iss = b(0, 305, 140, 'Issue PO' + S9('no approval step'))
    po = b(5, 305, 140, 'PO letter (PDF)' + S9('emailed to supplier'), SYS)
    que = b(2, 465, 175, 'Line up trucks' + S9('queue order · reasons'))
    load = b(3, 465, 175, 'Load ±10% → hand over' + S9('alternatives · photo · no prices'))
    shp = b(5, 465, 175, 'Shipment &amp; leg' + S9('PO revision if load differs'), SYS)
    drv = b(4, 660, 125, 'Drive &amp; check in' + S9('slide · geofence · SMS'))
    prob = b(4, 795, 78, 'Problem<br>→ fixed')
    eta = b(5, 680, 150, 'ETA · overdue ·<br>border-wait alerts', SYS)
    mon = b(2, 680, 160, 'Agreed price · trucks' + S9('after loading · issues · expenses'))
    cnt = b(6, 885, 116, 'Count &amp; sign' + S9('OK · damaged · short'))
    q3 = d.v('Final?', 1004, Y(6) - 6, 62, 66, DEC)
    trn = b(3, 925, 115, 'Send on / re-export' + S9('Asie → Yonas (Juba)'))
    stk = b(5, 1080, 150, 'Post stock at final warehouse', SYS)
    cnt2 = b(6, 1080, 150, 'Stock counts · expenses' + S9('quantities only'))
    sal = b(7, 1080, 150, 'Sales · selling prices' + S9('cash · credit · batch'))
    rec = d.v('<b>Reconcile</b>' + S9('loaded vs received per leg · stock ledger · fees vs agreed price'), 1250, Y(5) - 8, 150, H + 16, BOX + 'fontSize=12;fillColor=#E6F4EC;strokeColor=#15703A;')
    pay = b(7, 1250, 150, 'Pay transport fees' + S9('age: amber 14 · red 30 days'))
    dsh = b(1, 1250, 150, 'Dashboards · margins' + S9('landed cost v2 · alerts'))
    d.e(plan, iss, '', FLOW)
    d.e(iss, po, 'issued', XLANE, exit=(0.2, 1), entry=(0.2, 0))
    d.e(po, load, 'truck lines', XLANE, exit=(1, 0.3), entry=(0, 0.5))
    d.e(que, load, 'next truck', FLOW)
    d.e(load, shp, 'loading confirmed', XLANE, exit=(0.3, 1), entry=(0.3, 0))
    d.e(shp, drv, 'trip assigned', XLANE, exit=(1, 0.5), entry=(0, 0.5))
    d.e(drv, prob, '', FLOW)
    d.e(drv, eta, 'passes · pings', XLANE, exit=(0.5, 1), entry=(0.3, 0))
    d.e(eta, mon, 'late / no check-in', XLANE, exit=(0, 0.3), entry=(0, 0.5), pts=[(651, Y(5) + 16), (651, Y(2) + 27)])
    d.e(prob, cnt, 'arrived', XLANE, exit=(1, 0.5), entry=(0.5, 0), pts=[(945, Y(4) + 27)])
    d.e(cnt, q3, '', FLOW)
    d.e(q3, trn, 'no', XLANE, exit=(0.5, 0), entry=(0.95, 1), pts=[(1035, Y(3) + 66)])
    d.e(trn, load, 'next leg · same hand-over', XLANE, exit=(0, 0.5), entry=(1, 0.5))
    d.e(q3, stk, 'yes', XLANE, exit=(1, 0.5), entry=(0, 0.5), pts=[(1073, Y(6) + 27), (1073, Y(5) + 27)])
    d.e(stk, cnt2, 'stock', XLANE, exit=(0.25, 1), entry=(0.25, 0))
    d.e(cnt2, sal, 'stock', XLANE, exit=(0.25, 1), entry=(0.25, 0))
    d.e(stk, rec, '', FLOW)
    d.e(cnt2, rec, 'expenses', XLANE, exit=(1, 0.5), entry=(0.3, 1), pts=[(1295, Y(6) + 27)])
    d.e(sal, pay, '', FLOW)
    d.e(pay, rec, 'payments', XLANE, exit=(0.7, 0), entry=(0.7, 1))
    d.e(rec, dsh, 'profit · losses', XLANE, exit=(0.5, 0), entry=(0.5, 1))
    d.save(); return d

# ---------------------------------------------------------------- 3. Data flow (Gane–Sarson style)
def dataflow():
    d = D('03-data-flow', 'Data flow')
    EXT = 'rounded=0;whiteSpace=wrap;html=1;fontSize=12;fontStyle=1;fillColor=#D9E3F1;strokeColor=#062953;shadow=1;'
    PROC = 'rounded=1;whiteSpace=wrap;html=1;arcSize=20;fontSize=12;fillColor=#FFFFFF;strokeColor=#062953;strokeWidth=2;'
    STORE = 'shape=partialRectangle;whiteSpace=wrap;html=1;right=0;top=1;bottom=1;left=1;fillColor=#FFF4EC;strokeColor=#DF4901;fontSize=11;align=left;spacingLeft=8;'
    F = EDGE + 'fontSize=10;endArrow=block;endFill=1;strokeWidth=1.5;strokeColor=#062953;dashed=1;flowAnimation=1;'
    RY, PH = 118, 56                       # row pitch, process height
    py = lambda r: r * RY + 20
    P = lambda r, n, t: d.v(f'<b>{n}</b><br>{t}', 300, py(r), 170, PH, PROC)
    E = lambda t, x, y, w=140: d.v(t, x, y, w, 44, EXT)
    S = lambda t, y: d.v(t, 600, y, 210, 30, STORE)
    p = [P(0, '1.0', 'Period plan'), P(1, '2.0', 'Issue PO'), P(2, '3.0', 'Load &amp; dispatch'), P(3, '4.0', 'Track &amp; monitor'),
         P(4, '5.0', 'Receive'), P(5, '6.0', 'Inventory &amp; sales'), P(6, '7.0', 'Fees · landed cost v2'), P(7, '8.0', 'Dashboards &amp; alerts')]
    pl, di = E('Kabonge (planner)', 0, py(0) + 6), E('Directors', 0, py(1) + 6)
    tp, lp = E('Testfie (follow-up)', 0, py(2) - 40), E('Loaders (no prices)', 0, py(2) + 14)
    dv, sg = E('Driver · phone GPS', 0, py(3) - 18), E('SMS / USSD gateway', 0, py(3) + 38)
    rc = E('Asie · Yonas', 0, py(4) + 60)
    ac = E('Directors (money)', 0, py(6) + 6)
    su = E('Supplier', 900, py(1) + 6, 120)
    ow = E('Office users<br>(dashboards)', 0, py(7) + 6)
    d1, d2 = S('<b>D1</b> | Master data', py(0) - 14), S('<b>D2</b> | Plans &amp; POs', py(0) + 40)
    d2b, d8 = S('<b>D2</b> | Plans &amp; POs', py(1) - 18), S('<b>D8</b> | Files (photos · PDFs)', py(1) + 44)
    d2c, d3, d6 = S('<b>D2</b> | Plans &amp; POs', py(2) - 24), S('<b>D3</b> | Shipments · legs', py(2) + 13), S('<b>D6</b> | Trip costs &amp; payments', py(2) + 50)
    d1b, d3b = S('<b>D1</b> | Checkpoints (master)', py(3) - 14), S('<b>D3</b> | Shipments · legs · positions', py(3) + 40)
    d3c, d4, d8b = S('<b>D3</b> | Shipments · legs', py(4) - 24), S('<b>D4</b> | Stock ledger', py(4) + 13), S('<b>D8</b> | Files', py(4) + 50)
    d5, d4b, d10 = S('<b>D5</b> | Sales', py(5) - 24), S('<b>D4</b> | Stock ledger', py(5) + 13), S('<b>D10</b> | Warehouse money', py(5) + 50)
    d6b, d3d = S('<b>D6</b> | Trip costs &amp; payments', py(6) - 14), S('<b>D3</b> | Shipments · legs', py(6) + 40)
    d45, d9 = S('<b>D4 · D5</b> | Stock &amp; sales', py(7) - 14), S('<b>D9</b> | Notifications', py(7) + 40)
    d7 = d.v('<b>D7</b> | Audit log · idempotency keys — every process writes here', 300, py(8) + 4, 510, 30, STORE)
    fl = [
        (pl, p[0], 'plan lines (suggestion)'), (d1, p[0], 'products · prices · lanes'), (p[0], d2, 'Active / Replaced versions'),
        (pl, p[1], 'truck lines · issue'), (di, p[1], 'Nihna–GBI orders'), (d2b, p[1], 'plan context'), (p[1], d8, 'PO PDF'), (p[1], su, 'PO letter by email'),
        (tp, p[2], 'queue · agreed price after loading'), (lp, p[2], 'cases ±10% · alternatives'), (d2c, p[2], 'truck lines'), (p[2], d2c, 'PO revision -rev001'), (p[2], d3, 'shipment · leg'), (p[2], d6, 'agreed transport'),
        (dv, p[3], 'check-ins · pings · issues'), (sg, p[3], 'ARR / DEP codes'), (d1b, p[3], 'geofences'), (p[3], d3b, 'passes · ETA'),
        (rc, p[4], 'counts · loss reasons · signature'), (d3c, p[4], 'expected cases'), (p[4], d4, 'received · damaged'), (p[4], d8b, 'photos · signature'),
        (rc, p[5], 'stock counts · expenses · re-exports'), (p[5], d10, 'expenses · counts'), (p[5], d5, 'sales (directors)'), (d4b, p[5], 'available stock'),
        (ac, p[6], 'payments · selling prices'), (d10, p[6], 'warehouse share · prices'), (tp, p[6], 'trip expenses'), (p[6], d6b, 'payments'), (d3d, p[6], 'loaded vs received'), (p[6], ow, 'landed cost · margins · fee age'),
        (d45, p[7], 'stock · sales history'), (p[7], d9, 'alerts'), (p[7], ow, 'GET /v1/dashboards (scoped)'),
    ]
    for s, t, l in fl: d.e(s, t, l, F)
    d.save(); return d

# ---------------------------------------------------------------- 4. Use cases
def usecases():
    d = D('04-use-cases', 'Use cases')
    ACT = 'shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;html=1;fontSize=12;fontStyle=1;strokeColor=#062953;fillColor=#FFFFFF;'
    UC = 'ellipse;whiteSpace=wrap;html=1;fontSize=12;fillColor=#EEF3FA;strokeColor=#062953;'
    UCF = 'ellipse;whiteSpace=wrap;html=1;fontSize=12;fillColor=#FFF4EC;strokeColor=#DF4901;'
    L = EDGE + f'endArrow=none;strokeWidth=1;strokeColor={GREY};flowAnimation=1;dashed=1;dashPattern=1 3;'
    d.v('BTW Supply Chain Platform', 170, 0, 760, 720, 'rounded=0;whiteSpace=wrap;html=1;verticalAlign=top;fontStyle=1;fontSize=13;fillColor=none;strokeColor=#062953;strokeWidth=2;')
    d.v('Web app · team phone app (PWA)', 190, 30, 330, 680, 'rounded=1;arcSize=2;html=1;verticalAlign=top;align=left;spacingLeft=8;fontSize=10;fontColor=#4A5A70;dashed=1;fillColor=none;strokeColor=#A3B1C6;')
    d.v('Field app · SMS', 580, 30, 330, 680, 'rounded=1;arcSize=2;html=1;verticalAlign=top;align=left;spacingLeft=8;fontSize=10;fontColor=#8F2D00;dashed=1;fillColor=none;strokeColor=#FFC79A;')
    A = lambda n, x, y: d.v(n, x, y, 30, 56, ACT)
    planner, tplan, director = A('Kabonge', 60, 90), A('Testfie', 60, 320), A('Daniel · Michael', 60, 540)
    giver, driver, receiver = A('Joel · Eric · Moses', 1010, 70), A('Driver', 1010, 300), A('Asie · Yonas', 1010, 520)
    supplier = A('Supplier', 470, 760)
    U = lambda t, x, y, s=UC: d.v(t, x + (-10 if x == 210 else 0), y, 150, 48, s)
    w = [U('Save period plan (his pairs)', 210, 50), U('Edit static data (companies, goods)', 210, 120), U('Issue &amp; email PO', 360, 160),
         U('Fleet board · delays · issues', 210, 260), U('Agreed price after loading', 360, 320), U('Dashboards · combined performance', 210, 200),
         U('Record payments · selling prices', 210, 470), U('Landed cost v2 · margins', 360, 520), U('Users · pairs · audit log', 210, 620),
         U('Routes · warehouses', 360, 640), U('Sales (directors)', 360, 410),
         U('Onboard providers · trucks · drivers', 360, 240), U('Order loading queues', 210, 330), U('Trip expenses · fee ageing', 210, 400)]
    f = [U('Manage waiting list', 600, 60, UCF), U('Load ±10% · hand over, no prices', 750, 110, UCF), U('Check in at checkpoint', 600, 250, UCF),
         U('Report problem · fixed', 750, 300, UCF), U('Check in by SMS / USSD', 600, 360, UCF), U('Receive &amp; sign · loss reasons', 600, 520, UCF),
         U('Re-export Rwanda → Juba (Asie)', 750, 580, UCF), U('Work offline · sync', 750, 430, UCF), U('Warehouse expenses · stock counts', 600, 640, UCF)]
    links = [(planner, w[0]), (planner, w[1]), (planner, w[2]), (planner, w[11]), (planner, w[12]), (w[2], supplier),
             (tplan, w[3]), (tplan, w[4]), (tplan, w[12]), (tplan, w[13]), (tplan, f[1]),
             (director, w[5]), (director, w[6]), (director, w[7]), (director, w[8]), (director, w[9]), (director, w[10]), (director, w[3]), (director, w[1]),
             (giver, f[0]), (giver, f[1]), (giver, f[7]), (driver, f[2]), (driver, f[3]), (driver, f[4]), (driver, f[7]),
             (receiver, f[5]), (receiver, f[6]), (receiver, f[7]), (receiver, f[8])]
    for a, b in links: d.e(a, b, '', L)
    d.save(); return d

DIAGRAMS = [architecture(), process(), dataflow(), usecases()]

# ---------------------------------------------------------------- document
def embed(dg, maxh):
    cfg = {'highlight': '#FE7514', 'nav': False, 'resize': True, 'lightbox': True, 'edit': None, 'xml': dg.xml(), 'border': 6}
    return f'<div class="dg" style="max-height:{maxh}"><div class="mxgraph" data-mxgraph="{html.escape(json.dumps(cfg))}"></div></div>'

src = open(f'{HERE}/document.template.html').read()
for i, dg in enumerate(DIAGRAMS, 1):
    src = src.replace(f'<!--DIAGRAM{i}-->', embed(dg, '150mm' if i in (1, 2) else '232mm'))
open(f'{HERE}/BTW-Platform-Architecture.html', 'w').write(src)
print('wrote', len(DIAGRAMS), 'diagrams + document')
