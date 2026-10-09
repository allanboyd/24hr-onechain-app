// Demo data for the prototype. Names of organisations/people come from the requirements (§2, §17).
// Prices and quantities are invented — commercial figures from the sample orders are not reproduced.
import type {
  Checkpoint, Driver, Entity, Plan, Product, Provider, ReceivingCompany, Route, Supplier, Truck, User,
  Warehouse, WaitingEntry, PriceListItem, Sale,
} from '../types';

export const users: User[] = [
  { id: 'u-dir', name: 'Director (Group)', phone: '+254700000001', roles: ['director'], entityIds: ['e-btw', 'e-nud', 'e-kivu'], loadingPointIds: [], warehouseIds: [] },
  { id: 'u-kabonge', name: 'Kabonge', phone: '+254700000002', roles: ['planner', 'fleet'], entityIds: ['e-btw', 'e-nud', 'e-kivu'], loadingPointIds: ['s-kbl', 's-ubl', 's-sbl', 's-gbi'], warehouseIds: [] },
  { id: 'u-joel', name: 'Joel', phone: '+254700000003', roles: ['loader'], entityIds: ['e-btw'], loadingPointIds: ['s-kbl'], warehouseIds: [] },
  { id: 'u-eric', name: 'Eric', phone: '+254700000004', roles: ['loader'], entityIds: ['e-btw'], loadingPointIds: ['s-kbl'], warehouseIds: [] },
  { id: 'u-moses', name: 'Moses', phone: '+256700000005', roles: ['loader'], entityIds: ['e-nud'], loadingPointIds: ['s-ubl'], warehouseIds: [] },
  { id: 'u-tesfie', name: 'Tesfie', phone: '+254700000006', roles: ['loader', 'fleet', 'operations'], entityIds: ['e-nud', 'e-kivu'], loadingPointIds: ['s-gbi', 's-sbl'], warehouseIds: [] },
  { id: 'u-asie', name: 'Asie Receiving (Kigali)', phone: '+250700000007', roles: ['receiver', 'sales'], entityIds: [], loadingPointIds: [], warehouseIds: ['w-kgl', 'w-goma'] },
  { id: 'u-zonas', name: 'Zonas Receiving (Juba)', phone: '+211900000008', roles: ['receiver', 'sales'], entityIds: [], loadingPointIds: [], warehouseIds: ['w-juba'] },
  { id: 'u-acc', name: 'Accounts', phone: '+254700000009', roles: ['accounts'], entityIds: ['e-btw', 'e-nud', 'e-kivu'], loadingPointIds: [], warehouseIds: [] },
  { id: 'u-admin', name: 'System Admin', phone: '+254700000010', roles: ['admin'], entityIds: ['e-btw', 'e-nud', 'e-kivu'], loadingPointIds: [], warehouseIds: [] },
  { id: 'u-drv1', name: 'Peter Otieno', phone: '+254711000001', roles: ['driver'], entityIds: [], loadingPointIds: [], warehouseIds: [] },
  { id: 'u-drv2', name: 'Joseph Mugisha', phone: '+256711000002', roles: ['driver'], entityIds: [], loadingPointIds: [], warehouseIds: [] },
];

export const entities: Entity[] = [
  { id: 'e-btw', code: 'BTW', name: 'BTW Global Distributors Ltd', address: 'Nairobi, Kenya', poPrefix: 'BTW-PO' },
  { id: 'e-nud', code: 'NUD', name: 'Nihna Unique Distributors Ltd', address: 'Nairobi, Kenya', poPrefix: 'NUD-PO' },
  { id: 'e-kivu', code: 'KVD', name: 'Kivu Volcanic Distributors Ltd', address: 'Nairobi, Kenya', poPrefix: 'KVD-PO' },
];

export const receivingCompanies: ReceivingCompany[] = [
  { id: 'rc-asie', name: 'Asie', countries: ['Rwanda', 'DR Congo'] },
  { id: 'rc-zonas', name: 'Zonas', countries: ['South Sudan'] },
];

export const checkpoints: Checkpoint[] = [
  { id: 'cp-kbl', name: 'KBL Nairobi (loading)', kind: 'loading', country: 'KE', lat: -1.2420, lng: 36.8800, radiusM: 400 },
  { id: 'cp-gbi', name: 'GBI Mombasa (loading)', kind: 'loading', country: 'KE', lat: -4.0435, lng: 39.6682, radiusM: 400 },
  { id: 'cp-ubl', name: 'UBL Kampala (loading)', kind: 'loading', country: 'UG', lat: 0.3000, lng: 32.6500, radiusM: 400 },
  { id: 'cp-sbl', name: 'SBL Mwanza (loading)', kind: 'loading', country: 'TZ', lat: -2.5164, lng: 32.9175, radiusM: 400 },
  { id: 'cp-mariakani', name: 'Mariakani weighbridge', kind: 'weighbridge', country: 'KE', lat: -3.8640, lng: 39.4740, radiusM: 500 },
  { id: 'cp-voi', name: 'Voi', kind: 'town', country: 'KE', lat: -3.3961, lng: 38.5561, radiusM: 2000 },
  { id: 'cp-athi', name: 'Athi River weighbridge', kind: 'weighbridge', country: 'KE', lat: -1.4440, lng: 36.9780, radiusM: 500 },
  { id: 'cp-gilgil', name: 'Gilgil weighbridge', kind: 'weighbridge', country: 'KE', lat: -0.4950, lng: 36.3200, radiusM: 500 },
  { id: 'cp-eldoret', name: 'Eldoret', kind: 'town', country: 'KE', lat: 0.5143, lng: 35.2698, radiusM: 3000 },
  { id: 'cp-webuye', name: 'Webuye weighbridge', kind: 'weighbridge', country: 'KE', lat: 0.6080, lng: 34.7690, radiusM: 500 },
  { id: 'cp-malaba', name: 'Malaba border (KE/UG)', kind: 'border', country: 'KE', lat: 0.6346, lng: 34.2786, radiusM: 2500 },
  { id: 'cp-kampala', name: 'Kampala', kind: 'town', country: 'UG', lat: 0.3476, lng: 32.5825, radiusM: 5000 },
  { id: 'cp-mbarara', name: 'Mbarara', kind: 'town', country: 'UG', lat: -0.6072, lng: 30.6545, radiusM: 3000 },
  { id: 'cp-katuna', name: 'Katuna/Gatuna border (UG/RW)', kind: 'border', country: 'UG', lat: -1.4410, lng: 30.0170, radiusM: 2000 },
  { id: 'cp-kigali', name: 'Asie warehouse Kigali', kind: 'warehouse', country: 'RW', lat: -1.9441, lng: 30.0619, radiusM: 500 },
  { id: 'cp-gisenyi', name: 'Gisenyi/Goma border (RW/CD)', kind: 'border', country: 'RW', lat: -1.6900, lng: 29.2560, radiusM: 1500 },
  { id: 'cp-goma', name: 'Asie warehouse Goma', kind: 'warehouse', country: 'CD', lat: -1.6585, lng: 29.2205, radiusM: 500 },
  { id: 'cp-gulu', name: 'Gulu', kind: 'town', country: 'UG', lat: 2.7724, lng: 32.2881, radiusM: 3000 },
  { id: 'cp-nimule', name: 'Elegu/Nimule border (UG/SS)', kind: 'border', country: 'UG', lat: 3.5900, lng: 32.0600, radiusM: 2500 },
  { id: 'cp-juba', name: 'Zonas warehouse Juba', kind: 'warehouse', country: 'SS', lat: 4.8594, lng: 31.5713, radiusM: 500 },
  { id: 'cp-nyakanazi', name: 'Nyakanazi', kind: 'town', country: 'TZ', lat: -3.0300, lng: 31.2500, radiusM: 2000 },
  { id: 'cp-rusumo', name: 'Rusumo border (TZ/RW)', kind: 'border', country: 'TZ', lat: -2.3800, lng: 30.7830, radiusM: 1500 },
  { id: 'cp-kayonza', name: 'Kayonza', kind: 'town', country: 'RW', lat: -1.9000, lng: 30.5000, radiusM: 2000 },
];

// plannedHours = hours after departure; plannedDwellHours = expected stop (borders dominate). Seed values — replace with historical medians.
const s = (checkpointId: string, plannedHours: number, plannedDwellHours = 0) => ({ checkpointId, plannedHours, plannedDwellHours });
const westKE = [s('cp-gilgil', 3, 0.5), s('cp-eldoret', 8), s('cp-webuye', 10, 0.5), s('cp-malaba', 12, 14), s('cp-kampala', 31, 2)];
export const routes: Route[] = [
  { id: 'r-nbo-kgl', code: 'NBO-KGL', name: 'Nairobi → Kigali', distanceKm: 1180, stops: [s('cp-kbl', 0), ...westKE, s('cp-mbarara', 38), s('cp-katuna', 43, 8), s('cp-kigali', 55)] },
  { id: 'r-nbo-goma', code: 'NBO-GOM', name: 'Nairobi → Goma', distanceKm: 1340, stops: [s('cp-kbl', 0), ...westKE, s('cp-mbarara', 38), s('cp-katuna', 43, 8), s('cp-kigali', 55, 2), s('cp-gisenyi', 61, 10), s('cp-goma', 72)] },
  { id: 'r-nbo-juba', code: 'NBO-JUB', name: 'Nairobi → Juba', distanceKm: 1520, stops: [s('cp-kbl', 0), ...westKE, s('cp-gulu', 39), s('cp-nimule', 44, 16), s('cp-juba', 66)] },
  { id: 'r-kla-kgl', code: 'KLA-KGL', name: 'Kampala → Kigali', distanceKm: 520, stops: [s('cp-ubl', 0), s('cp-mbarara', 6), s('cp-katuna', 11, 8), s('cp-kigali', 23)] },
  { id: 'r-msa-kgl', code: 'MSA-KGL', name: 'Mombasa → Kigali', distanceKm: 1660, stops: [s('cp-gbi', 0), s('cp-mariakani', 1, 1), s('cp-voi', 5), s('cp-athi', 11, 0.5), s('cp-gilgil', 15, 0.5), s('cp-eldoret', 20), s('cp-malaba', 24, 14), s('cp-kampala', 43, 2), s('cp-katuna', 55, 8), s('cp-kigali', 67)] },
  { id: 'r-msa-juba', code: 'MSA-JUB', name: 'Mombasa → Juba', distanceKm: 2000, stops: [s('cp-gbi', 0), s('cp-mariakani', 1, 1), s('cp-voi', 5), s('cp-athi', 11, 0.5), s('cp-eldoret', 20), s('cp-malaba', 24, 14), s('cp-gulu', 51), s('cp-nimule', 56, 16), s('cp-juba', 78)] },
  { id: 'r-mwz-kgl', code: 'MWZ-KGL', name: 'Mwanza → Kigali', distanceKm: 640, stops: [s('cp-sbl', 0), s('cp-nyakanazi', 6), s('cp-rusumo', 10, 10), s('cp-kayonza', 22), s('cp-kigali', 24)] },
  { id: 'r-kgl-juba', code: 'KGL-JUB', name: 'Kigali → Juba (Asie re-export)', distanceKm: 1250, stops: [s('cp-kigali', 0), s('cp-katuna', 3, 8), s('cp-mbarara', 15), s('cp-kampala', 21, 2), s('cp-gulu', 29), s('cp-nimule', 34, 16), s('cp-juba', 56)] },
];

export const suppliers: Supplier[] = [
  { id: 's-kbl', code: 'KBL', name: 'KBL Export Section', city: 'Nairobi', country: 'Kenya', checkpointId: 'cp-kbl', email: 'export@kbl.example' },
  { id: 's-ubl', code: 'UBL', name: 'UBL Export Section', city: 'Kampala', country: 'Uganda', checkpointId: 'cp-ubl', email: 'export@ubl.example' },
  { id: 's-sbl', code: 'SBL', name: 'SBL Export Section', city: 'Mwanza', country: 'Tanzania', checkpointId: 'cp-sbl', email: 'export@sbl.example' },
  { id: 's-gbi', code: 'GBI', name: 'GBI Export Section', city: 'Mombasa', country: 'Kenya', checkpointId: 'cp-gbi', email: 'export@gbi.example' },
];

export const warehouses: Warehouse[] = [
  { id: 'w-kgl', name: 'Asie Kigali', receivingCompanyId: 'rc-asie', checkpointId: 'cp-kigali' },
  { id: 'w-goma', name: 'Asie Goma', receivingCompanyId: 'rc-asie', checkpointId: 'cp-goma' },
  { id: 'w-juba', name: 'Zonas Juba', receivingCompanyId: 'rc-zonas', checkpointId: 'cp-juba' },
];

const p = (id: string, sku: string, brand: string, pack: string, units: number, ml: number, supplierId: string): Product => ({ id, sku, brand, pack, unitsPerCase: units, sizeMl: ml, supplierId });
export const products: Product[] = [
  p('p-a300', 'KBL-A-24x300', 'Brand A Lager', '24 x 300 ml', 24, 300, 's-kbl'),
  p('p-b500', 'KBL-B-24x500', 'Brand B Stout', '24 x 500 ml', 24, 500, 's-kbl'),
  p('p-c200', 'UBL-C-24x200', 'Brand C Lager', '24 x 200 ml', 24, 200, 's-ubl'),
  p('p-d300', 'UBL-D-25x300', 'Brand D Special', '25 x 300 ml', 25, 300, 's-ubl'),
  p('p-e330', 'SBL-E-24x330', 'Brand E Premium', '24 x 330 ml', 24, 330, 's-sbl'),
  p('p-f330', 'GBI-F-24x330', 'Brand F Malt', '24 x 330 ml', 24, 330, 's-gbi'),
];

export const priceList: PriceListItem[] = [
  { productId: 'p-a300', supplierId: 's-kbl', price: 11.5, currency: 'USD', from: '2026-07-01' },
  { productId: 'p-b500', supplierId: 's-kbl', price: 18.2, currency: 'USD', from: '2026-07-01' },
  { productId: 'p-c200', supplierId: 's-ubl', price: 8.9, currency: 'USD', from: '2026-07-01' },
  { productId: 'p-d300', supplierId: 's-ubl', price: 12.4, currency: 'USD', from: '2026-07-01' },
  { productId: 'p-e330', supplierId: 's-sbl', price: 13.1, currency: 'USD', from: '2026-07-01' },
  { productId: 'p-f330', supplierId: 's-gbi', price: 10.75, currency: 'USD', from: '2026-07-01' },
];

export const providers: Provider[] = [
  { id: 'pr-ets', name: 'ETS Sabrina', regular: true, phone: '+254720000001' },
  { id: 'pr-joly', name: 'Joly', regular: true, phone: '+254720000002' },
  { id: 'pr-x', name: 'Company X', regular: true, phone: '+254720000003' },
  { id: 'pr-y', name: 'Company Y (market)', regular: false, phone: '+254720000004' },
];

export const drivers: Driver[] = [
  { id: 'd1', name: 'Peter Otieno', phone: '+254711000001', licence: 'DL-KE-55120', providerId: 'pr-ets', hasApp: true },
  { id: 'd2', name: 'Joseph Mugisha', phone: '+256711000002', licence: 'DL-UG-88231', providerId: 'pr-joly', hasApp: true },
  { id: 'd3', name: 'Hassan Ali', phone: '+254711000003', licence: 'DL-KE-71002', providerId: 'pr-ets', hasApp: true },
  { id: 'd4', name: 'John Kamau', phone: '+254711000004', licence: 'DL-KE-62291', providerId: 'pr-joly', hasApp: false },
  { id: 'd5', name: 'Emmanuel Nkurunziza', phone: '+250711000005', licence: 'DL-RW-12004', providerId: 'pr-x', hasApp: true },
  { id: 'd6', name: 'Said Juma', phone: '+255711000006', licence: 'DL-TZ-90110', providerId: 'pr-y', hasApp: false },
  { id: 'd7', name: 'Moses Lado', phone: '+211911000007', licence: 'DL-SS-30012', providerId: 'pr-x', hasApp: true },
];

export const trucks: Truck[] = [
  { id: 't1', providerId: 'pr-ets', reg: 'KDA 123A', trailer: 'ZF 4521', capacityCases: 2200, defaultDriverId: 'd1' },
  { id: 't2', providerId: 'pr-ets', reg: 'KDB 456B', trailer: 'ZF 4522', capacityCases: 2200, defaultDriverId: 'd3' },
  { id: 't3', providerId: 'pr-joly', reg: 'UBA 789C', trailer: 'UZ 1100', capacityCases: 2000, defaultDriverId: 'd2' },
  { id: 't4', providerId: 'pr-joly', reg: 'KCX 220D', trailer: 'ZE 9013', capacityCases: 2000, defaultDriverId: 'd4' },
  { id: 't5', providerId: 'pr-x', reg: 'RAD 310E', trailer: 'RL 0077', capacityCases: 2400, defaultDriverId: 'd5' },
  { id: 't6', providerId: 'pr-y', reg: 'T 512 DFG', trailer: 'T 991 ZZT', capacityCases: 1800, defaultDriverId: 'd6' },
  { id: 't7', providerId: 'pr-x', reg: 'SSD 410K', trailer: 'SS 220', capacityCases: 2200, defaultDriverId: 'd7' },
];

export const waitingList: WaitingEntry[] = [
  { id: 'wl1', loadingPointId: 's-kbl', truckId: 't2', driverId: 'd3', arrivedAt: '2026-10-06T06:10:00Z', position: 1, status: 'Waiting' },
  { id: 'wl2', loadingPointId: 's-kbl', truckId: 't4', driverId: 'd4', arrivedAt: '2026-10-06T08:40:00Z', position: 2, status: 'Waiting' },
  { id: 'wl3', loadingPointId: 's-kbl', truckId: 't7', driverId: 'd7', arrivedAt: '2026-10-06T13:05:00Z', position: 3, status: 'Waiting' },
  { id: 'wl4', loadingPointId: 's-ubl', truckId: 't5', driverId: 'd5', arrivedAt: '2026-10-05T09:00:00Z', position: 1, status: 'Waiting' },
  { id: 'wl5', loadingPointId: 's-sbl', truckId: 't6', driverId: 'd6', arrivedAt: '2026-10-06T05:30:00Z', position: 1, status: 'Waiting' },
];

let n = 0;
const line = (truckNo: number, productId: string, qty: number, price: number, deliveredToId: string, routeId: string) =>
  ({ id: `pl-${++n}`, truckNo, productId, qty, price, deliveredToId, routeId });

export const plans: Plan[] = [
  {
    id: 'plan-1', ref: 'BTW-PO-2026-0002', title: 'Order No. 2', entityId: 'e-btw', supplierId: 's-kbl', currency: 'USD',
    date: '2026-09-08', requiredBy: '2026-09-20', status: 'Approved', version: 1, createdById: 'u-kabonge', poId: 'po-1',
    lines: [
      line(1, 'p-a300', 2000, 11.5, 'rc-asie', 'r-nbo-kgl'),
      line(2, 'p-a300', 1200, 11.5, 'rc-zonas', 'r-nbo-juba'),
      line(2, 'p-b500', 800, 18.2, 'rc-zonas', 'r-nbo-juba'),
      line(3, 'p-b500', 2000, 18.2, 'rc-asie', 'r-nbo-goma'),
      line(4, 'p-a300', 2000, 11.5, 'rc-asie', 'r-nbo-goma'),
    ],
    history: [
      { at: '2026-09-08T07:20:00Z', byUserId: 'u-kabonge', action: 'submitted' },
      { at: '2026-09-08T10:02:00Z', byUserId: 'u-dir', action: 'approved', signature: 'sig:director' },
    ],
  },
  {
    id: 'plan-2', ref: 'NUD-PO-2026-0009', title: "October '26 Order", entityId: 'e-nud', supplierId: 's-ubl', currency: 'USD',
    date: '2026-10-06', requiredBy: '2026-10-15', status: 'Submitted', version: 1, createdById: 'u-kabonge',
    lines: [
      line(1, 'p-c200', 1500, 8.9, 'rc-asie', 'r-kla-kgl'),
      line(1, 'p-d300', 500, 12.4, 'rc-asie', 'r-kla-kgl'),
      line(2, 'p-d300', 2000, 12.4, 'rc-asie', 'r-kla-kgl'),
    ],
    history: [{ at: '2026-10-06T09:15:00Z', byUserId: 'u-kabonge', action: 'submitted' }],
  },
  {
    id: 'plan-3', ref: 'KVD-PO-2026-0011', title: "October '26 Order", entityId: 'e-kivu', supplierId: 's-sbl', currency: 'USD',
    date: '2026-10-07', requiredBy: '2026-10-20', status: 'Draft', version: 1, createdById: 'u-kabonge',
    lines: [line(1, 'p-e330', 1800, 13.1, 'rc-asie', 'r-mwz-kgl'), line(2, 'p-e330', 1800, 13.1, 'rc-asie', 'r-mwz-kgl')],
    history: [],
  },
];

// Historical sales seed for analytics (last ~45 days), deterministic.
export function seedSales(): Sale[] {
  const out: Sale[] = [];
  const pattern: Record<string, Record<string, number>> = {
    'w-kgl': { 'p-a300': 140, 'p-b500': 60, 'p-c200': 25, 'p-d300': 45, 'p-e330': 90 },
    'w-goma': { 'p-a300': 40, 'p-b500': 85, 'p-c200': 4, 'p-e330': 30 },
    'w-juba': { 'p-a300': 70, 'p-b500': 18, 'p-d300': 2, 'p-f330': 55 },
  };
  let k = 0;
  const today = new Date('2026-10-07T12:00:00Z').getTime();
  for (let d = 45; d >= 1; d--) {
    for (const [wh, prods] of Object.entries(pattern)) {
      for (const [pid, avg] of Object.entries(prods)) {
        if (pid === 'p-d300' && wh === 'w-juba' && d < 35) continue; // dead stock example
        const qty = Math.max(0, Math.round(avg * (0.7 + ((d * 7 + pid.length * 3 + wh.length) % 7) / 10)));
        if (!qty) continue;
        const price = (priceList.find((x) => x.productId === pid)?.price ?? 10) * 1.35;
        const paid = k % 5 === 0 ? 0 : qty * price;
        out.push({
          id: `sale-${++k}`, ref: `SAL-${String(k).padStart(5, '0')}`, at: new Date(today - d * 864e5).toISOString(),
          warehouseId: wh, customer: ['Walk-in', 'Kimironko Wholesale', 'Goma Depot', 'Konyo Konyo Traders'][k % 4],
          salespersonId: wh === 'w-juba' ? 'u-zonas' : 'u-asie', kind: k % 5 === 0 ? 'Credit' : k % 9 === 0 ? 'Batch' : 'Cash',
          lines: [{ productId: pid, qty, price: Math.round(price * 100) / 100 }], currency: 'USD',
          paid: Math.round(paid * 100) / 100, status: paid ? 'Paid' : 'Unpaid',
        });
      }
    }
  }
  return out;
}

export const opening: Record<string, Record<string, number>> = {
  'w-kgl': { 'p-a300': 9000, 'p-b500': 4200, 'p-c200': 3100, 'p-d300': 2500, 'p-e330': 5200 },
  'w-goma': { 'p-a300': 2500, 'p-b500': 4000, 'p-c200': 1900, 'p-e330': 2600 },
  'w-juba': { 'p-a300': 4200, 'p-b500': 2600, 'p-d300': 2100, 'p-f330': 2400 },
};
