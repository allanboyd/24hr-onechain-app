// Demo data for the prototype. Names of organisations/people come from the requirements (§2, §17).
// Prices and quantities are invented — commercial figures from the sample orders are not reproduced.
import type {
  Checkpoint, Driver, Entity, FxRate, Plan, Product, Provider, ReceivingCompany, Route, Supplier, Truck, User,
  Warehouse, WaitingEntry, PriceListItem, Sale,
} from '../types';
import { entityAccess, featuresFor } from '../rules';
import { CATALOGUE } from './catalogue';
import { ETS_FLEET } from './ets';

const ALL = ['e-btw', 'e-nud', 'e-kivu'];
type RawUser = Omit<User, 'allowedEntityIds' | 'canGroup' | 'features'>;
const rawUsers: RawUser[] = [
  // Group-wide
  { id: 'u-dir', name: 'Director (Group)', phone: '+254700000001', roles: ['director'], entityIds: ALL, loadingPointIds: [], warehouseIds: [] },
  { id: 'u-kabonge', name: 'Kabonge', phone: '+254700000002', roles: ['planner', 'fleet'], entityIds: ALL, loadingPointIds: ['s-kbl', 's-ubl', 's-sbl', 's-gbi'], warehouseIds: [] },
  { id: 'u-acc', name: 'Accounts (all companies)', phone: '+254700000009', roles: ['accounts'], entityIds: ALL, loadingPointIds: [], warehouseIds: [] },
  { id: 'u-admin', name: 'System Admin', phone: '+254700000010', roles: ['admin'], entityIds: ALL, loadingPointIds: [], warehouseIds: [] },
  // BTW Global Distributors
  { id: 'u-joel', name: 'Joel', phone: '+254700000003', roles: ['loader'], entityIds: ['e-btw'], loadingPointIds: ['s-kbl'], warehouseIds: [] },
  { id: 'u-eric', name: 'Eric', phone: '+254700000004', roles: ['loader'], entityIds: ['e-btw'], loadingPointIds: ['s-kbl'], warehouseIds: [] },
  { id: 'u-btw-plan', name: 'Wanjiru Kamau (BTW planner)', phone: '+254700000011', roles: ['planner'], entityIds: ['e-btw'], loadingPointIds: ['s-kbl'], warehouseIds: [] },
  { id: 'u-btw-acc', name: 'Grace Achieng (BTW accounts)', phone: '+254700000012', roles: ['accounts'], entityIds: ['e-btw'], loadingPointIds: [], warehouseIds: [] },
  // Nihna Unique Distributors
  { id: 'u-moses', name: 'Moses', phone: '+256700000005', roles: ['loader'], entityIds: ['e-nud'], loadingPointIds: ['s-ubl'], warehouseIds: [] },
  { id: 'u-nud-plan', name: 'Brian Okello (NUD planner)', phone: '+254700000013', roles: ['planner'], entityIds: ['e-nud'], loadingPointIds: ['s-ubl', 's-gbi'], warehouseIds: [] },
  { id: 'u-nud-acc', name: 'Aisha Nalwoga (NUD accounts)', phone: '+254700000014', roles: ['accounts'], entityIds: ['e-nud'], loadingPointIds: [], warehouseIds: [] },
  // Kivu Volcanic Distributors
  { id: 'u-tesfie', name: 'Tesfie', phone: '+254700000006', roles: ['loader', 'fleet', 'operations'], entityIds: ['e-nud', 'e-kivu'], loadingPointIds: ['s-gbi', 's-sbl'], warehouseIds: [] },
  { id: 'u-kvd-plan', name: 'Neema Mushi (Kivu planner)', phone: '+254700000015', roles: ['planner'], entityIds: ['e-kivu'], loadingPointIds: ['s-sbl'], warehouseIds: [] },
  { id: 'u-kvd-acc', name: 'Daniel Mwakyusa (Kivu accounts)', phone: '+254700000016', roles: ['accounts'], entityIds: ['e-kivu'], loadingPointIds: [], warehouseIds: [] },
  // Truck planners (docs/10): onboard providers / trucks, run the loading queues, follow trucks and their costs
  { id: 'u-btw-trucks', name: 'Peter Njoroge (BTW truck planner)', phone: '+254700000017', roles: ['truck_planner'], entityIds: ['e-btw'], loadingPointIds: ['s-kbl'], warehouseIds: [] },
  { id: 'u-trucks', name: 'Halima Yusuf (truck planner, all companies)', phone: '+254700000018', roles: ['truck_planner'], entityIds: ALL, loadingPointIds: [], warehouseIds: [] },
  // Receiving companies handle goods for all three siblings (scoped by warehouse)
  { id: 'u-asie', name: 'Asie Receiving (Gisenyi)', phone: '+250700000007', roles: ['receiver', 'sales'], entityIds: ALL, loadingPointIds: [], warehouseIds: ['w-kgl', 'w-goma'] },
  { id: 'u-zonas', name: 'Zonas Receiving (Juba)', phone: '+211900000008', roles: ['receiver', 'sales'], entityIds: ALL, loadingPointIds: [], warehouseIds: ['w-juba'] },
  // Drivers work for whichever company's trip they are on
  { id: 'u-drv1', name: 'Mawazi K', phone: '+254702750019', roles: ['driver'], entityIds: [], loadingPointIds: [], warehouseIds: [] }, // ETS Sabrina truck 1
  { id: 'u-drv3', name: 'Kanyike E', phone: '+254701811686', roles: ['driver'], entityIds: [], loadingPointIds: [], warehouseIds: [] }, // ETS Sabrina truck 2
  { id: 'u-drv2', name: 'Joseph Mugisha', phone: '+256711000002', roles: ['driver'], entityIds: [], loadingPointIds: [], warehouseIds: [] },
];
export const users: User[] = rawUsers.map((u) => ({ ...u, ...entityAccess(u, ALL), features: featuresFor(u.roles) }));

/** Facts from the client's letterheads (docs/inspiration/*.pdf). Statutory numbers are placeholders until confirmed. */
const SHARED_PHONES = ['+254 707 617 460', '+254 701 570 356'];
export const entities: Entity[] = [
  {
    id: 'e-btw', code: 'BTW', name: 'BTW Global Distributors Ltd', shortName: 'BTW Global Distributors', poPrefix: 'BTW-PO',
    address: ['P.O Box 18051 - 00100 Nairobi, Kenya', 'Elgeyo Marakwet Road, Elgeyo Garden'], phones: SHARED_PHONES, email: 'info@btwglobal.co.ke',
    tagline: 'Your global supply partner', footerLine: 'People · Products · Partnerships · Progress',
    colors: { primary: '#062953', accent: '#FE7514', ink: '#0B1B33' }, logoKey: 'btw',
    kraPin: 'P05xxxxxxxx — to confirm', registrationNo: 'PVT-xxxxxxx — to confirm', registeredOffice: 'Elgeyo Marakwet Road, Elgeyo Garden, Nairobi — to confirm', reportingCurrency: 'USD',
    letterhead: { header: 'entities/btw/letterhead-header.png', footer: 'entities/btw/letterhead-footer.png', watermark: 'entities/btw/letterhead-watermark.png' },
  },
  {
    id: 'e-nud', code: 'NUD', name: 'Nihna Unique Distributors Ltd', shortName: 'Nihna Unique Distributors', poPrefix: 'NUD-PO',
    address: ['P.O. Box 18051 - 00100 Nairobi, Kenya'], phones: SHARED_PHONES, email: 'info@NihnaUnique.co.ke',
    tagline: 'Distributors, Transporters & Manufacturers', footerLine: 'Distributors, Transporters & Manufacturers',
    colors: { primary: '#414142', accent: '#C4982B', ink: '#1F1F20' }, logoKey: 'nud',
    kraPin: 'P05xxxxxxxx — to confirm', registrationNo: 'PVT-xxxxxxx — to confirm', registeredOffice: 'Elgeyo Marakwet Road, Elgeyo Garden, Nairobi — to confirm', reportingCurrency: 'USD',
    letterhead: { header: 'entities/nud/letterhead-header.png', footer: 'entities/nud/letterhead-footer.png' },
  },
  {
    // Legal name as on the letterhead ("Volcanic Distributors Limited", KIVU mark); requirements call it "Kivu Volcanic
    // Distributors Ltd" — TO CONFIRM. The letterhead email is NUD's — TO CONFIRM.
    id: 'e-kivu', code: 'KVD', name: 'Volcanic Distributors Limited', shortName: 'Kivu Volcanic Distributors', poPrefix: 'KVD-PO',
    address: ['P.O Box 18051 - 00100 Nairobi, Kenya', 'Elgeyo Marakwet Road, Elgeyo Garden'], phones: SHARED_PHONES, email: 'info@NihnaUnique.co.ke',
    tagline: 'Manufacturers · Transporters · Distributors · Importers · Exporters', footerLine: 'Manufacturers · Transporters · Distributors · Importers · Exporters',
    colors: { primary: '#2E3092', accent: '#ED1C24', ink: '#1B1C55' }, logoKey: 'kvd',
    kraPin: 'P05xxxxxxxx — to confirm', registrationNo: 'PVT-xxxxxxx — to confirm', registeredOffice: 'Elgeyo Marakwet Road, Elgeyo Garden, Nairobi — to confirm', reportingCurrency: 'USD',
    letterhead: { header: 'entities/kvd/letterhead-header.png', footer: 'entities/kvd/letterhead-footer.png' },
  },
];
/** §17.2: which company buys from which supplier export section (KBL → BTW; UBL, GBI → NUD; SBL → Kivu). */
export const ENTITY_OF_SUPPLIER: Record<string, string> = { 's-kbl': 'e-btw', 's-ubl': 'e-nud', 's-sbl': 'e-kivu', 's-gbi': 'e-nud' };

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
  // Kigali is a transit town; the Rwanda destination warehouse is in Gisenyi (docs/07 §D).
  { id: 'cp-kigali', name: 'Kigali (transit)', kind: 'town', country: 'RW', lat: -1.9441, lng: 30.0619, radiusM: 3000 },
  { id: 'cp-gisenyi-wh', name: 'Asie warehouse Gisenyi', kind: 'warehouse', country: 'RW', lat: -1.7022, lng: 29.2652, radiusM: 500 },
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
  { id: 'r-nbo-kgl', code: 'NBO-GIS', name: 'Nairobi → Gisenyi', distanceKm: 1340, stops: [s('cp-kbl', 0), ...westKE, s('cp-mbarara', 38), s('cp-katuna', 43, 8), s('cp-kigali', 55, 1), s('cp-gisenyi-wh', 60)] },
  { id: 'r-nbo-goma', code: 'NBO-GOM', name: 'Nairobi → Goma', distanceKm: 1340, stops: [s('cp-kbl', 0), ...westKE, s('cp-mbarara', 38), s('cp-katuna', 43, 8), s('cp-kigali', 55, 2), s('cp-gisenyi-wh', 60), s('cp-gisenyi', 61, 10), s('cp-goma', 72)] },
  { id: 'r-nbo-juba', code: 'NBO-JUB', name: 'Nairobi → Juba', distanceKm: 1520, stops: [s('cp-kbl', 0), ...westKE, s('cp-gulu', 39), s('cp-nimule', 44, 16), s('cp-juba', 66)] },
  { id: 'r-kla-kgl', code: 'KLA-GIS', name: 'Kampala → Gisenyi', distanceKm: 680, stops: [s('cp-ubl', 0), s('cp-mbarara', 6), s('cp-katuna', 11, 8), s('cp-kigali', 23, 1), s('cp-gisenyi-wh', 28)] },
  { id: 'r-msa-kgl', code: 'MSA-GIS', name: 'Mombasa → Gisenyi', distanceKm: 1820, stops: [s('cp-gbi', 0), s('cp-mariakani', 1, 1), s('cp-voi', 5), s('cp-athi', 11, 0.5), s('cp-gilgil', 15, 0.5), s('cp-eldoret', 20), s('cp-malaba', 24, 14), s('cp-kampala', 43, 2), s('cp-katuna', 55, 8), s('cp-kigali', 67, 1), s('cp-gisenyi-wh', 72)] },
  { id: 'r-msa-juba', code: 'MSA-JUB', name: 'Mombasa → Juba', distanceKm: 2000, stops: [s('cp-gbi', 0), s('cp-mariakani', 1, 1), s('cp-voi', 5), s('cp-athi', 11, 0.5), s('cp-eldoret', 20), s('cp-malaba', 24, 14), s('cp-gulu', 51), s('cp-nimule', 56, 16), s('cp-juba', 78)] },
  { id: 'r-mwz-kgl', code: 'MWZ-GIS', name: 'Mwanza → Gisenyi', distanceKm: 800, stops: [s('cp-sbl', 0), s('cp-nyakanazi', 6), s('cp-rusumo', 10, 10), s('cp-kayonza', 22), s('cp-kigali', 24, 1), s('cp-gisenyi-wh', 29)] },
  { id: 'r-kgl-juba', code: 'GIS-JUB', name: 'Gisenyi → Juba (Asie re-export)', distanceKm: 1410, stops: [s('cp-gisenyi-wh', 0), s('cp-kigali', 4, 1), s('cp-katuna', 7, 8), s('cp-mbarara', 19), s('cp-kampala', 25, 2), s('cp-gulu', 33), s('cp-nimule', 38, 16), s('cp-juba', 60)] },
];

export const suppliers: Supplier[] = [
  { id: 's-kbl', code: 'KBL', name: 'KBL Export Section', city: 'Nairobi', country: 'Kenya', checkpointId: 'cp-kbl', email: 'export@kbl.example' },
  { id: 's-ubl', code: 'UBL', name: 'UBL Export Section', city: 'Kampala', country: 'Uganda', checkpointId: 'cp-ubl', email: 'export@ubl.example' },
  { id: 's-sbl', code: 'SBL', name: 'SBL Export Section', city: 'Mwanza', country: 'Tanzania', checkpointId: 'cp-sbl', email: 'export@sbl.example' },
  { id: 's-gbi', code: 'GBI', name: 'GBI Export Section', city: 'Mombasa', country: 'Kenya', checkpointId: 'cp-gbi', email: 'export@gbi.example' },
];

export const warehouses: Warehouse[] = [
  // Destinations (docs/07 §D): Congo – Goma, Rwanda – Gisenyi, South Sudan – Juba. Ids are stable (w-kgl predates the move to Gisenyi).
  { id: 'w-kgl', name: 'Asie Gisenyi', receivingCompanyId: 'rc-asie', checkpointId: 'cp-gisenyi-wh', country: 'Rwanda', town: 'Gisenyi' },
  { id: 'w-goma', name: 'Asie Goma', receivingCompanyId: 'rc-asie', checkpointId: 'cp-goma', country: 'Congo', town: 'Goma' },
  { id: 'w-juba', name: 'Zonas Juba', receivingCompanyId: 'rc-zonas', checkpointId: 'cp-juba', country: 'South Sudan', town: 'Juba' },
];

// Products = the client's 131 SKUs (docs/inspiration/Source.xlsx → ./catalogue.ts, docs/08 §1).
// Six of them carry the demo trading history; their ids are the historic ones so every seeded flow stays intact.
const TRADED: Record<string, string> = {
  'KBL-42': 'p-a300', // Tusker Lager Cans 24 x 330 ml   (BTW, KBL)
  'KBL-43': 'p-b500', // Guinness cans 24 x 500 ml        (BTW, KBL)
  'UBL-16': 'p-c200', // Bell Lager Bottles               (NUD, UBL)
  'UBL-15': 'p-d300', // Guinness Bottles                 (NUD, UBL)
  'SBL-1': 'p-e330',  // Serengeti                        (Kivu, SBL)
  'GBI-1': 'p-f330',  // Heineken                         (NUD, GBI)
};
// Demo prices of the traded SKUs stay as before (the seeded plans, POs and history use them).
const TRADED_PRICE: Record<string, number> = { 'p-a300': 11.5, 'p-b500': 18.2, 'p-c200': 8.9, 'p-d300': 12.4, 'p-e330': 13.1, 'p-f330': 10.75 };
export const PRICE_NOTE = 'demo price — to confirm';
export const products: Product[] = CATALOGUE.map((r) => {
  const sku = `${r.source}-${r.no}`;
  return { id: TRADED[sku] ?? `p-${r.source.toLowerCase()}-${r.no}`, sku, brand: r.brand, pack: r.pack, unitsPerCase: r.units, sizeMl: r.sizeMl, supplierId: r.supplierId, category: r.category, packConfirmed: r.packConfirmed, sheetNo: r.no };
});

export const priceList: PriceListItem[] = products.map((p) => ({
  productId: p.id, supplierId: p.supplierId, price: TRADED_PRICE[p.id] ?? CATALOGUE.find((r) => `${r.source}-${r.no}` === p.sku)!.price,
  currency: 'USD', from: '2026-07-01', note: PRICE_NOTE,
}));

// Contact details are demo placeholders ("to confirm") until the client sends them.
export const providers: Provider[] = [
  { id: 'pr-ets', name: 'ETS Sabrina Ltd', kind: 'company', regular: true, phone: '+254720000001', contactName: 'Fleet office (contact to confirm)', email: 'fleet@ets-sabrina.example', notes: "The client's main regular transporter — 16 prime movers (fleet list from the client). Phone and email are demo placeholders — to confirm.", active: true },
  { id: 'pr-joly', name: 'Joly', kind: 'company', regular: true, phone: '+254720000002', contactName: '', email: '', notes: '', active: true },
  { id: 'pr-x', name: 'Company X', kind: 'company', regular: true, phone: '+254720000003', contactName: '', email: '', notes: '', active: true },
  { id: 'pr-y', name: 'Company Y (market)', kind: 'market', regular: false, phone: '+254720000004', contactName: '', email: '', notes: 'Hired from the market when regular trucks are not available.', active: true },
  // Sample sacco (demo) so onboarding of truck-owner cooperatives is visible
  { id: 'pr-umoja', name: 'Umoja Truckers Sacco (demo)', kind: 'sacco', regular: true, phone: '+254720000005', contactName: 'Sacco secretary (demo)', email: 'office@umoja-sacco.example', notes: 'Demo sacco: members own the trucks, the sacco office allocates them and is paid per trip.', active: true },
];

// ETS Sabrina Ltd: the client's real fleet (./ets.ts). Fleet trucks 1 and 2 keep the historic ids t1/t2 and drivers
// d1/d3 (they carry the demo trips); their drivers have the field app. Phones: country code assumed +254 (to confirm).
export const PHONE_NOTE = 'country code assumed +254 — to confirm';
export const CAPACITY_NOTE = 'capacity to confirm';
const etsDriverId = (no: number) => (no === 1 ? 'd1' : no === 2 ? 'd3' : `d-ets-${no}`);
const etsTruckId = (no: number) => (no === 1 ? 't1' : no === 2 ? 't2' : `t-ets-${no}`);
const e164 = (local: string) => '+254' + local.replace(/^0/, '');
const etsDrivers: Driver[] = ETS_FLEET.filter((f) => f[3]).map(([no, , , name, phone]) => ({
  id: etsDriverId(no), name, phone: e164(phone), localPhone: phone, phoneNote: PHONE_NOTE, licence: '', providerId: 'pr-ets', hasApp: no <= 2,
}));
const etsTrucks: Truck[] = ETS_FLEET.map(([no, reg, trailer, name]) => ({
  id: etsTruckId(no), providerId: 'pr-ets', reg, trailer, capacityCases: 2000, note: CAPACITY_NOTE, fleetNo: no, ...(name ? { defaultDriverId: etsDriverId(no) } : {}),
}));

export const drivers: Driver[] = [
  ...etsDrivers,
  // Demo drivers of the other providers (until the client sends their lists)
  { id: 'd2', name: 'Joseph Mugisha', phone: '+256711000002', licence: 'DL-UG-88231', providerId: 'pr-joly', hasApp: true },
  { id: 'd4', name: 'John Kamau', phone: '+254711000004', licence: 'DL-KE-62291', providerId: 'pr-joly', hasApp: false },
  { id: 'd5', name: 'Emmanuel Nkurunziza', phone: '+250711000005', licence: 'DL-RW-12004', providerId: 'pr-x', hasApp: true },
  { id: 'd6', name: 'Said Juma', phone: '+255711000006', licence: 'DL-TZ-90110', providerId: 'pr-y', hasApp: false },
  { id: 'd7', name: 'Moses Lado', phone: '+211911000007', licence: 'DL-SS-30012', providerId: 'pr-x', hasApp: true },
  // Umoja Truckers Sacco (demo)
  { id: 'd-umoja-1', name: 'Kevin Otieno', phone: '+254711000021', licence: 'DL-KE-70411', providerId: 'pr-umoja', hasApp: false },
  { id: 'd-umoja-2', name: 'Ali Hassan', phone: '+254711000022', licence: 'DL-KE-70522', providerId: 'pr-umoja', hasApp: false },
];

export const trucks: Truck[] = [
  ...etsTrucks,
  { id: 't3', providerId: 'pr-joly', reg: 'UBA 789C', trailer: 'UZ 1100', capacityCases: 2000, defaultDriverId: 'd2' },
  { id: 't4', providerId: 'pr-joly', reg: 'KCX 220D', trailer: 'ZE 9013', capacityCases: 2000, defaultDriverId: 'd4' },
  { id: 't5', providerId: 'pr-x', reg: 'RAD 310E', trailer: 'RL 0077', capacityCases: 2400, defaultDriverId: 'd5' },
  { id: 't6', providerId: 'pr-y', reg: 'T 512 DFG', trailer: 'T 991 ZZT', capacityCases: 1800, defaultDriverId: 'd6' },
  { id: 't7', providerId: 'pr-x', reg: 'SSD 410K', trailer: 'SS 220', capacityCases: 2200, defaultDriverId: 'd7' },
  { id: 't-umoja-1', providerId: 'pr-umoja', reg: 'KDA 101S', trailer: 'ZG 4410', capacityCases: 1800, defaultDriverId: 'd-umoja-1', active: true },
  { id: 't-umoja-2', providerId: 'pr-umoja', reg: 'KDB 202S', trailer: 'ZG 4522', capacityCases: 2000, defaultDriverId: 'd-umoja-2', active: true },
];

export const waitingList: WaitingEntry[] = [
  { id: 'wl1', entityId: 'e-btw', loadingPointId: 's-kbl', truckId: 't2', driverId: 'd3', arrivedAt: '2026-10-06T06:10:00Z', position: 1, status: 'Waiting' },
  { id: 'wl2', entityId: 'e-btw', loadingPointId: 's-kbl', truckId: 't4', driverId: 'd4', arrivedAt: '2026-10-06T08:40:00Z', position: 2, status: 'Waiting' },
  { id: 'wl3', entityId: 'e-btw', loadingPointId: 's-kbl', truckId: 't7', driverId: 'd7', arrivedAt: '2026-10-06T13:05:00Z', position: 3, status: 'Waiting' },
  { id: 'wl4', entityId: 'e-nud', loadingPointId: 's-ubl', truckId: 't5', driverId: 'd5', arrivedAt: '2026-10-05T09:00:00Z', position: 1, status: 'Waiting' },
  { id: 'wl5', entityId: 'e-kivu', loadingPointId: 's-sbl', truckId: 't6', driverId: 'd6', arrivedAt: '2026-10-06T05:30:00Z', position: 1, status: 'Waiting' },
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
  // Live trips for NUD (Kampala lane) and Kivu (Mwanza lane), so every company has trucks on the road.
  {
    id: 'plan-4', ref: 'NUD-PO-2026-0008', title: 'Order No. 8', entityId: 'e-nud', supplierId: 's-ubl', currency: 'USD',
    date: '2026-10-01', requiredBy: '2026-10-09', status: 'Approved', version: 1, createdById: 'u-nud-plan', poId: 'po-2',
    lines: [line(1, 'p-c200', 1200, 8.9, 'rc-asie', 'r-kla-kgl'), line(1, 'p-d300', 800, 12.4, 'rc-asie', 'r-kla-kgl')],
    history: [
      { at: '2026-10-01T07:40:00Z', byUserId: 'u-nud-plan', action: 'submitted' },
      { at: '2026-10-01T09:05:00Z', byUserId: 'u-dir', action: 'approved', signature: 'sig:director' },
    ],
  },
  {
    id: 'plan-5', ref: 'KVD-PO-2026-0010', title: 'Order No. 10', entityId: 'e-kivu', supplierId: 's-sbl', currency: 'USD',
    date: '2026-10-02', requiredBy: '2026-10-12', status: 'Approved', version: 1, createdById: 'u-kvd-plan', poId: 'po-3',
    lines: [line(1, 'p-e330', 1750, 13.1, 'rc-asie', 'r-mwz-kgl')],
    history: [
      { at: '2026-10-02T06:55:00Z', byUserId: 'u-kvd-plan', action: 'submitted' },
      { at: '2026-10-02T08:30:00Z', byUserId: 'u-dir', action: 'approved', signature: 'sig:director' },
    ],
  },
];

/** Company that owns a SKU's stock in the demo (from its supplier lane, §17.2). Real data stores entity_id on every row. */
export const entityOfProduct = (pid: string) => ENTITY_OF_SUPPLIER[products.find((p) => p.id === pid)?.supplierId ?? ''] ?? 'e-btw';

/** Approved monthly exchange rates (units per 1 USD): average for P&L and costs, closing for stock and balances. */
export function seedFxRates(now = Date.now()): FxRate[] {
  const base: Record<string, number> = { KES: 129.2, UGX: 3705, TZS: 2655, RWF: 1418 };
  const out: FxRate[] = [];
  const d = new Date(now);
  for (let i = 16; i >= 0; i--) {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1)).toISOString().slice(0, 7);
    for (const [cur, b] of Object.entries(base)) {
      const drift = 1 + 0.0015 * (16 - i) + 0.004 * Math.sin(i * 1.3 + cur.length); // gentle depreciation + noise, deterministic
      const avg = Math.round(b * drift * 100) / 100;
      out.push({ currency: cur as FxRate['currency'], month: m, avg, closing: Math.round(avg * 1.003 * 100) / 100 });
    }
  }
  return out;
}

/** Deterministic PRNG (mulberry32) so the mock and the server seed build identical demo history. */
export function rng(seedNo: number) {
  let a = seedNo >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const HISTORY_DAYS = 456; // ~15 months: quarter-on-quarter and year-on-year comparisons
/** Average cases per day by warehouse × SKU (today's level; history is scaled by growth and seasonality). */
export const salesPattern: Record<string, Record<string, number>> = {
  'w-kgl': { 'p-a300': 140, 'p-b500': 60, 'p-c200': 25, 'p-d300': 45, 'p-e330': 90 },
  'w-goma': { 'p-a300': 40, 'p-b500': 85, 'p-c200': 4, 'p-e330': 30 },
  'w-juba': { 'p-a300': 70, 'p-b500': 18, 'p-d300': 2, 'p-f330': 55 },
};
/** Month seasonality (Jan…Dec): December festive peak, January dip. */
export const SEASON = [0.86, 0.88, 0.95, 0.97, 1.0, 0.97, 1.0, 1.02, 0.98, 1.03, 1.08, 1.34];
const CUSTOMERS: Record<string, string[]> = {
  'w-kgl': ['Walk-in', 'Kimironko Wholesale', 'Nyabugogo Distributors', 'Remera Bars Ltd', 'Kicukiro Mini-market'],
  'w-goma': ['Walk-in', 'Goma Depot', 'Birere Traders', 'Lac Kivu Hotels'],
  'w-juba': ['Walk-in', 'Konyo Konyo Traders', 'Juba Town Wholesale', 'Munuki Supplies'],
};
/** Expected cases sold on a day `d` days ago (before noise): growth trend × month seasonality × weekday. */
export function demandFactor(at: number, d: number) {
  const dt = new Date(at);
  const growth = 0.8 + 0.2 * (1 - d / HISTORY_DAYS);
  const wd = [0.72, 0.95, 0.98, 1.0, 1.04, 1.12, 1.19][dt.getUTCDay()];
  return growth * SEASON[dt.getUTCMonth()] / SEASON[new Date().getUTCMonth()] * wd;
}

/** ~15 months of daily sales per warehouse × SKU, relative to `now` (deterministic). */
export function seedSales(now = Date.now()): Sale[] {
  const out: Sale[] = [];
  const r = rng(20261007);
  const today = Math.floor(now / 864e5) * 864e5 + 12 * 36e5; // noon UTC
  let k = 0;
  for (let d = HISTORY_DAYS; d >= 1; d--) {
    const at0 = today - d * 864e5;
    for (const [wh, prods] of Object.entries(salesPattern)) {
      for (const [pid, avg] of Object.entries(prods)) {
        const noise = 0.75 + r() * 0.5;
        if (wh === 'w-goma' && (d === 20 || d === 48)) continue; // CAPTURE GAP: two days with no sales recorded at Goma
        if (pid === 'p-d300' && wh === 'w-juba' && d < 35) continue; // dead stock example (no sales for 35 days)
        const qty = Math.round(avg * demandFactor(at0, d) * noise);
        if (qty <= 0) continue;
        const uplift = 1.3 + 0.05 * (1 - d / HISTORY_DAYS); // ~4% price increase over the period
        const price = Math.round((priceList.find((x) => x.productId === pid)?.price ?? 10) * uplift * 100) / 100;
        const total = Math.round(qty * price * 100) / 100;
        const kr = r();
        const kind: Sale['kind'] = kr < 0.62 ? 'Cash' : kr < 0.9 ? 'Credit' : 'Batch';
        // Cash and batch are paid at once; credit is collected over ~45 days, a few remain unpaid (bad debt).
        const pr = r();
        let paid = total;
        if (kind === 'Credit') paid = d > 75 ? (pr < 0.05 ? 0 : pr < 0.1 ? Math.round(total * 0.5) : total) : d > 30 ? (pr < 0.45 ? Math.round(total * 0.4) : total) : (pr < 0.75 ? 0 : Math.round(total * 0.5));
        k++;
        const cust = CUSTOMERS[wh];
        out.push({
          id: `sale-${k}`, entityId: entityOfProduct(pid), ref: `SAL-${String(k).padStart(5, '0')}`, at: new Date(at0 + Math.floor(r() * 8) * 36e5 - 3 * 36e5).toISOString(),
          warehouseId: wh, customer: cust[Math.floor(r() * cust.length)],
          salespersonId: wh === 'w-juba' ? 'u-zonas' : 'u-asie', kind, lines: [{ productId: pid, qty, price }], currency: 'USD',
          paid, status: paid >= total ? 'Paid' : paid > 0 ? 'Part-paid' : 'Unpaid',
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
