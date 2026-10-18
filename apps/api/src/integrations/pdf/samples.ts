// Renders a PO letter and a delivery acknowledgement for each company into docs/brand/samples/ (letterhead check).
// Run from apps/api:  node -r @swc-node/register src/integrations/pdf/samples.ts [signature.png]
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { TypstPdf, repoRoot } from './pdf';

const root = repoRoot();
const sig = process.argv[2] ? `data:image/png;base64,${readFileSync(process.argv[2]).toString('base64')}` : undefined;
const files = { async put() { throw new Error('n/a'); }, async get() { return null; } } as any;
const pdf = new TypstPdf({ PDF_FONT_DIRS: '/usr/share/fonts/truetype' } as any, files);
const companies = [
  { code: 'BTW', name: 'BTW Global Distributors Ltd', supplier: { name: 'KBL', city: 'Nairobi', country: 'Kenya' }, brands: [['Brand A Lager', '24 x 300 ml', 11.5], ['Brand B Stout', '24 x 500 ml', 18.2]] },
  { code: 'NUD', name: 'Nihna Unique Distributors Ltd', supplier: { name: 'UBL', city: 'Kampala', country: 'Uganda' }, brands: [['Brand C Lager', '24 x 200 ml', 8.9], ['Brand D Special', '25 x 300 ml', 12.4]] },
  { code: 'KVD', name: 'Volcanic Distributors Limited', supplier: { name: 'SBL', city: 'Mwanza', country: 'Tanzania' }, brands: [['Brand E Premium', '24 x 330 ml', 13.1]] },
];
(async () => {
  for (const c of companies) {
    const lines = Array.from({ length: 6 }, (_, i) => { const b = c.brands[i % c.brands.length] as [string, string, number]; return { truckNo: Math.floor(i / 2) + 1, brand: b[0], pack: b[1], qty: 1000 + (i % 2) * 200, price: b[2] }; });
    const po = await pdf.render('po-letter', {
      entity: { code: c.code, name: c.name }, date: '2026-10-08T08:00:00Z', ref: `${c.code}-PO-2026-0014`, title: "October '26 Order",
      addressedTo: { section: 'The Export Section', name: c.supplier.name, city: c.supplier.city, country: c.supplier.country },
      currency: 'USD', lines, preparedBy: { name: 'Kabonge', title: 'Planner' },
      approvedBy: { name: 'Director (Group)', title: 'Director', at: '2026-10-08T10:00:00Z', signature: sig },
    } as any);
    writeFileSync(path.join(root, `docs/brand/samples/${c.code}-po-letter.pdf`), po);
    const ack = await pdf.render('acknowledgement', {
      entity: { code: c.code, name: c.name }, shipmentRef: 'SHP-2026-0041', legSeq: 1, legCount: 1, truckReg: 'KBV 894T', driverName: 'Mawazi K',
      from: `${c.supplier.name} ${c.supplier.city}`, to: 'Asie warehouse Gisenyi', warehouse: 'Asie Gisenyi', receivingCompany: 'Asie',
      receivedAt: '2026-10-09T14:30:00Z', receiverName: 'J. Uwase', finalDestination: true, signature: sig,
      lines: c.brands.map((b) => ({ brand: b[0], pack: b[1], expected: 1000, received: 994, damaged: 6, remarks: '6 cases crushed' })),
    } as any);
    writeFileSync(path.join(root, `docs/brand/samples/${c.code}-acknowledgement.pdf`), ack);
    console.log(c.code, 'po', po.length, 'ack', ack.length);
    if (c.code === 'BTW') { // long order: checks continuation pages (running head, footer on every page)
      const long = Array.from({ length: 34 }, (_, i) => ({ truckNo: Math.floor(i / 2) + 1, brand: i % 2 ? 'Brand B Stout' : 'Brand A Lager', pack: i % 2 ? '24 x 500 ml' : '24 x 300 ml', qty: 1100, price: i % 2 ? 18.2 : 11.5 }));
      writeFileSync(path.join(root, 'docs/brand/samples/BTW-po-letter-long.pdf'), await pdf.render('po-letter', {
        entity: { code: 'BTW', name: c.name }, date: '2026-10-08T08:00:00Z', ref: 'BTW-PO-2026-0015', title: 'Order No. 15', currency: 'USD',
        addressedTo: { section: 'The Export Section', name: 'KBL', city: 'Nairobi', country: 'Kenya' }, lines: long, preparedBy: { name: 'Kabonge', title: 'Planner' },
        approvedBy: { name: 'Director (Group)', title: 'Director', at: '2026-10-08T10:00:00Z', signature: sig } } as any));
    }
  }
})().catch((e) => { console.error(e); process.exit(1); });
