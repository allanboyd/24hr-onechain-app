// Company stationery for documents (docs/06-multi-company-plan.md §5). The header, footer and watermark are the
// company's own letterhead artwork (vector, cut from docs/inspiration/*.pdf by docs/brand/build_entities.py).
// `lh` comes from the PDF adapter: { code, name, colors{primary, accent, ink, text}, header{path,y0,y1}, footer{path,y0,y1},
// watermark{path,y0,y1}|none, legal{kraPin, registrationNo, registeredOffice} } — or none (plain header fallback).

#let pt = 1pt
#let legal-line(lh) = {
  let l = lh.legal
  let v(x) = if x == none { text(fill: rgb("#B4231B"))[to confirm] } else { x }
  text(7.5pt, fill: rgb("#4A5A70"))[KRA PIN: #v(l.kraPin) #h(6pt)·#h(6pt) Reg. No.: #v(l.registrationNo) #if l.registeredOffice != none [#h(6pt)·#h(6pt) Registered office: #l.registeredOffice]]
}

/// Apply as `#show: stationery.with(lh, info)`. `info` is the small generated line (reference · page x of y).
#let stationery(lh, info, body) = {
  if lh == none {
    set page(paper: "a4", margin: (x: 2cm, top: 1.6cm, bottom: 2cm),
      footer: context text(7.5pt, fill: rgb("#66768C"))[#info #h(1fr) page #counter(page).display() of #counter(page).final().first()])
    return body
  }
  let m-top = (lh.header.y1 + 22) * pt
  let m-bottom = (842 - lh.footer.y0 + 16) * pt
  set page(
    paper: "a4",
    margin: (x: 2cm, top: m-top, bottom: m-bottom),
    background: context {
      if here().page() == 1 { place(top + left, image(lh.header.path, width: 100%)) }
      if lh.watermark != none { place(top + left, dy: lh.watermark.y0 * pt, image(lh.watermark.path, width: 100%)) }
      place(top + left, dy: lh.footer.y0 * pt, image(lh.footer.path, width: 100%))
    },
    // Continuation pages: a slim running head in the space the full letterhead header uses on page 1.
    header: context if here().page() > 1 {
      set text(8pt, fill: rgb(lh.colors.text))
      grid(columns: (1fr, auto), [*#lh.name*], info)
      v(2pt); line(length: 100%, stroke: 1pt + rgb(lh.colors.primary))
    },
    footer-descent: 5pt,
    footer: context text(7pt, fill: rgb("#66768C"))[#info #h(1fr) page #counter(page).display() of #counter(page).final().first()],
  )
  body
}
