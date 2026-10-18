#!/usr/bin/env python3
"""Builds BTW-Platform-Architecture.docx (editable Word copy) from the generated HTML.
Run after build.py and `node pdf.mjs` (which saves diagrams/*.png):  python3 docs/architecture/build_docx.py
Needs python-docx and lxml. Diagrams go in as pictures; the editable sources stay in diagrams/*.drawio.
"""
import os
import re
from docx import Document
from docx.enum.section import WD_ORIENT
from docx.enum.text import WD_BREAK
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor
from lxml import html as LH

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'BTW-Platform-Architecture.html')
OUT = os.path.join(HERE, 'BTW-Platform-Architecture.docx')
DIAGRAMS = ['01-architecture', '02-process', '03-data-flow', '04-use-cases']
NAVY, ORT, MUTED, CODE = RGBColor(0x06, 0x29, 0x53), RGBColor(0xB8, 0x3A, 0x00), RGBColor(0x4A, 0x5A, 0x70), RGBColor(0x0F, 0x3A, 0x6E)

doc = Document()
st = doc.styles['Normal']; st.font.name = 'Inter'; st.font.size = Pt(10)
st.element.rPr.rFonts.set(qn('w:eastAsia'), 'Inter')
for name, size in (('Title', 24), ('Heading 1', 15), ('Heading 2', 11.5)):
    s = doc.styles[name]; s.font.name = 'Montserrat'; s.font.size = Pt(size); s.font.bold = True; s.font.color.rgb = NAVY
props = doc.core_properties
props.title, props.author = 'BTW Platform Architecture & Processes', 'BTW platform team'
props.subject = 'Architecture, process, data flow, use cases and data structures'


def classes(el):
    return (el.get('class') or '').split()


def runs(par, el, bold=False, italic=False, mono=False, color=None):
    """Adds el's text and inline children to paragraph par."""
    def add(t, b, i, m):
        t = re.sub(r'\s+', ' ', t or '')
        start = not par.runs or par.runs[-1].text[-1:] in (' ', '\t')
        t = t.lstrip() if start else t
        if not t:
            return
        r = par.add_run(t)
        r.bold, r.italic = b or None, i or None
        if m:
            r.font.name = 'Consolas'; r.font.size = Pt(8.5); r.font.color.rgb = CODE
        elif color is not None:
            r.font.color.rgb = color
    add(el.text, bold, italic, mono)
    for c in el:
        if c.tag == 'br':
            par.add_run().add_break()
        elif c.tag in ('b', 'strong'):
            runs(par, c, True, italic, mono, color)
        elif c.tag in ('i', 'em'):
            runs(par, c, bold, True, mono, color)
        elif c.tag == 'code':
            runs(par, c, bold, italic, True, color)
        elif c.tag in ('svg', 'script'):
            pass
        else:
            runs(par, c, bold, italic, mono, color)
        add(c.tail, bold, italic, mono)


def shade(cell, hex_):
    tcPr = cell._tc.get_or_add_tcPr()
    sh = OxmlElement('w:shd'); sh.set(qn('w:val'), 'clear'); sh.set(qn('w:color'), 'auto'); sh.set(qn('w:fill'), hex_)
    tcPr.append(sh)


def table(el):
    rows = el.findall('.//tr')
    ncol = max(len(r.findall('th')) + len(r.findall('td')) for r in rows)
    t = doc.add_table(rows=0, cols=ncol)
    t.style = 'Table Grid'
    for r in rows:
        cells = r.findall('th') + r.findall('td')
        row = t.add_row().cells
        for i, c in enumerate(cells):
            p = row[i].paragraphs[0]
            if c.tag == 'th':
                runs(p, c, True, color=MUTED); shade(row[i], 'F6F8FB')
            else:
                runs(p, c)
            for rr in p.runs:
                if rr.font.size is None:
                    rr.font.size = Pt(8.5)
    doc.add_paragraph()


def note(el):
    t = doc.add_table(rows=1, cols=1); t.style = 'Table Grid'
    c = t.rows[0].cells[0]; shade(c, 'F6F8FB')
    runs(c.paragraphs[0], el)
    for r in c.paragraphs[0].runs:
        if r.font.size is None:
            r.font.size = Pt(9)
    doc.add_paragraph()


dg_i = 0


def walk(el, wide):
    global dg_i
    for c in el:
        cl = classes(c)
        if not isinstance(c.tag, str) or 'pno' in cl or 'tag' in cl or 'ribbon' in cl or 'noprint' in cl:
            continue
        if c.tag == 'img':
            doc.add_picture(os.path.normpath(os.path.join(HERE, c.get('src'))), width=Cm(5.2))
        elif 'eyebrow' in cl:
            p = doc.add_paragraph(); r = p.add_run((c.text_content() or '').strip().upper())
            r.bold = True; r.font.size = Pt(8); r.font.color.rgb = ORT
            p.paragraph_format.space_after = Pt(0)
        elif c.tag == 'h1':
            runs(doc.add_paragraph(style='Title'), c)
        elif c.tag == 'h2':
            runs(doc.add_paragraph(style='Heading 1'), c)
        elif c.tag == 'h3':
            runs(doc.add_paragraph(style='Heading 2'), c)
        elif 'dg' in cl:
            png = os.path.join(HERE, 'diagrams', DIAGRAMS[dg_i] + '.png'); dg_i += 1
            doc.add_picture(png, width=Cm(21 if wide else 17))
        elif 'kpis' in cl:
            ks = [k for k in c if 'kpi' in classes(k)]
            t = doc.add_table(rows=1, cols=len(ks)); t.style = 'Table Grid'
            for i, k in enumerate(ks):
                p = t.rows[0].cells[i].paragraphs[0]
                r = p.add_run(k.find('b').text_content()); r.bold = True; r.font.size = Pt(18); r.font.color.rgb = NAVY
                p2 = t.rows[0].cells[i].add_paragraph(); r2 = p2.add_run(k.find('span').text_content()); r2.font.size = Pt(8.5); r2.font.color.rgb = MUTED
            doc.add_paragraph()
        elif 'legend' in cl:
            for sp in c.findall('span'):
                runs(doc.add_paragraph(style='List Bullet'), sp)
        elif c.tag == 'p' and 'note' in cl:
            note(c)
        elif c.tag == 'p':
            runs(doc.add_paragraph(), c)
        elif c.tag == 'table':
            table(c)
        elif c.tag in ('ol', 'ul'):
            for n, li in enumerate(c.findall('li'), 1):
                if c.tag == 'ol':
                    p = doc.add_paragraph(); p.paragraph_format.left_indent = Cm(0.6); p.paragraph_format.first_line_indent = Cm(-0.6)
                    p.add_run(f'{n}.\t'); runs(p, li)
                else:
                    runs(doc.add_paragraph(style='List Bullet'), li)
        else:
            walk(c, wide)


root = LH.parse(SRC).getroot()
pages = root.xpath('//section[contains(concat(" ", @class, " "), " page ")]')
for i, sec in enumerate(pages):
    wide = 'wide' in classes(sec)
    s = doc.sections[0] if i == 0 else doc.add_section()
    if wide:
        s.orientation, s.page_width, s.page_height = WD_ORIENT.LANDSCAPE, Cm(29.7), Cm(21)
        s.left_margin = s.right_margin = Cm(1.2); s.top_margin = s.bottom_margin = Cm(1.0)
    else:
        s.orientation, s.page_width, s.page_height = WD_ORIENT.PORTRAIT, Cm(21), Cm(29.7)
        s.left_margin = s.right_margin = Cm(1.8); s.top_margin = s.bottom_margin = Cm(1.6)
    walk(sec, wide)

doc.save(OUT)
print('wrote', OUT)
