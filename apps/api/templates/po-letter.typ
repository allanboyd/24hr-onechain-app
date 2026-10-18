// Purchase order letter (§7.1 header, §7.2 lines) on the ISSUING company's letterhead (d.lh; see letterhead.typ).
// Data: /data.json (pre-formatted by the PDF adapter). Images: /logo.*, /signature.*, /stamp.*
#import "/letterhead.typ": stationery, legal-line
#let d = json("/data.json")
#let lh = d.at("lh", default: none)
#let primary = if lh != none { rgb(lh.colors.primary) } else { rgb("#062953") }
#let ink = if lh != none { rgb(lh.colors.ink) } else { rgb("#B83A00") }
#let sunken = rgb("#EEF1F6")
#let info = [#d.ref #if d.version != none [· version #d.version] · BTW Supply Chain]
#set text(font: ("Inter", "DejaVu Sans", "Libertinus Serif"), size: 10pt, fill: rgb("#0B1B33"))
#set par(leading: 0.6em)
#show: stationery.with(lh, info)

#if lh == none {
  // Fallback (no brand kit for this company): plain header with the company's details.
  grid(columns: (1fr, auto), align: (left + horizon, right + horizon),
    if d.logo != none { image(d.logo, height: 2.1cm) } else { text(20pt, weight: "bold", fill: primary, d.entity.name) },
    [#set text(8.5pt, fill: rgb("#4A5A70"))
     #text(10pt, weight: "bold", fill: primary, d.entity.name) \
     #if d.entity.address != none [#d.entity.address \ ]
     #if d.entity.phone != none [#d.entity.phone \ ]
     #if d.entity.email != none [#d.entity.email]])
  v(0.25cm); line(length: 100%, stroke: 2pt + rgb("#FE7514")); v(0.6cm)
}

#grid(columns: (1fr, auto), align: (left + bottom, right + bottom),
  if lh != none { legal-line(lh) } else [],
  d.date)
#v(0.35cm)
#if d.addressedTo.section != none [#d.addressedTo.section \ ]
*#d.addressedTo.name* \
#d.addressedTo.city, #d.addressedTo.country
#v(0.45cm)
#text(weight: "bold")[Re: #d.title — #d.ref]
#let rev = d.at("revision", default: none)
#if rev != none [
  #v(0.1cm)
  #box(fill: sunken, inset: 6pt, radius: 2pt, width: 100%)[
    #text(9pt, weight: "bold", fill: ink)[Revision #rev.n of #rev.of] #text(8.5pt, fill: rgb("#4A5A70"))[— revised at loading; replaces the earlier version] \
    #set text(8.5pt)
    #for c in rev.changes [• #c \ ]
  ]
]
#v(0.2cm)
#d.instruction
#v(0.35cm)

// Lines
#let hdr(t) = text(7.5pt, weight: "bold", fill: rgb("#4A5A70"), upper(t))
#table(
  columns: (auto, 1fr, auto, auto, auto, auto),
  align: (center, left, left, right, right, right),
  stroke: (x, y) => (bottom: 0.5pt + rgb("#CBD3DF")),
  inset: (x: 6pt, y: 5pt),
  fill: (x, y) => if y == 0 { sunken },
  table.header(hdr("Truck No."), hdr("Brand"), hdr("Package"), hdr("Quantity (cases)"), hdr("Price (" + d.currency + ")"), hdr("Amount (" + d.currency + ")")),
  ..d.rows.map(r => (r.truckNo, r.brand, r.pack, r.qty, r.price, r.amount)).flatten(),
  ..d.subtotals.map(s => (table.cell(colspan: 3, fill: sunken)[*Subtotal · #s.label*], table.cell(fill: sunken)[*#s.qty*], table.cell(fill: sunken)[], table.cell(fill: sunken)[*#s.amount*])).flatten(),
  table.cell(colspan: 3, fill: rgb("#EEF3FA"), stroke: (top: 1.5pt + primary))[*Grand total · #d.truckCount trucks*],
  table.cell(fill: rgb("#EEF3FA"), stroke: (top: 1.5pt + primary))[*#d.totalQty*],
  table.cell(fill: rgb("#EEF3FA"), stroke: (top: 1.5pt + primary))[],
  table.cell(fill: rgb("#EEF3FA"), stroke: (top: 1.5pt + primary))[*#d.totalAmount*],
)
#v(0.7cm)
Yours faithfully,
#v(0.3cm)
#grid(columns: (1fr, 1fr), gutter: 1cm,
  [#text(8pt, fill: rgb("#66768C"), upper("Prepared by")) \ *#d.preparedBy.name* \ #if d.preparedBy.title != none [#d.preparedBy.title]],
  if d.approvedBy != none and d.at("mode", default: "approved") == "issued" [
    #text(8pt, fill: rgb("#66768C"), upper("Issued by")) \
    *#d.approvedBy.name* #if d.approvedBy.title != none [· #d.approvedBy.title] \
    #box(stroke: 1pt + primary, inset: 4pt, radius: 2pt, text(8pt, fill: primary, weight: "bold")[ISSUED #d.approvedBy.at by #d.approvedBy.name])
  ] else if d.approvedBy != none [
    #text(8pt, fill: rgb("#66768C"), upper("Approved by")) \
    #if d.signature != none { image(d.signature, height: 1.4cm) } \
    *#d.approvedBy.name* #if d.approvedBy.title != none [· #d.approvedBy.title] \
    #box(stroke: 1pt + ink, inset: 4pt, radius: 2pt, text(8pt, fill: ink, weight: "bold")[APPROVED #d.approvedBy.at])
  ])
#if d.stamp != none { place(bottom + right, dy: -0.4cm, image(d.stamp, height: 2.6cm)) }
