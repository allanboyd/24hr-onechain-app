# Generates packages/api/src/mock/catalogue.ts from docs/inspiration/Source.xlsx (client product list, 131 SKUs).
import re, sys, json, openpyxl
src, out = sys.argv[1], sys.argv[2]
ws = openpyxl.load_workbook(src, data_only=True).active
rows = []
for r in ws.iter_rows(values_only=True):
    v = [c for c in r if c not in (None, '')]
    if len(v) >= 3 and isinstance(v[0], (int, float)) and str(v[-1]).strip() in ('KBL', 'GBI', 'SBL', 'UBL'):
        rows.append((int(v[0]), str(v[1]), str(v[-1]).strip()))
assert len(rows) == 131, len(rows)
SUP = {'KBL': 's-kbl', 'GBI': 's-gbi', 'SBL': 's-sbl', 'UBL': 's-ubl'}
def size_ml(num, unit):
    num = float(num); unit = unit.lower()
    return round(num * (1000 if unit.startswith('l') else 10 if unit == 'cl' else 1))
SPIRITS = r"gin|jw |whisk|singleton|tanqueray|don julio|ciroc|vodka|baileys|casamigos|smirnoff|v&a|captain morgan|kenya cane|amarula|glenvilet|chivas|jameson|jack daniels|grants|hennessy|ballentine|martell|glenfiddich|absolut|hindricks|teachers|famous grouse|black & white|monkey|waragi|bond 7|gilbey"
WINE = r"drostdy|cellar cask|chamdor|overmeer|four cousins|4th street|nederburg"
BEER = r"tusker|guinness|white cap|barozi|heineken|serengeti|bell lager"
PREMIUM = r"jw black|jw double|jw gold|jw green|singleton|don julio|casamigos|hennessy|martell|glenfiddich|chivas|black barrel|monkey|ciroc|tanqueray|hindricks|jack daniels|glenvilet"
MID = r"jw red|jameson|grants|ballentine|teachers|famous grouse|black & white|absolut|baileys|amarula|gordon|captain morgan"
def category(name):
    n = name.lower()
    if re.search(WINE, n): return 'wine'
    if re.search(BEER, n): return 'beer'
    if re.search(SPIRITS, n): return 'spirits'
    return 'rtd'
items = []
for no, raw, s in rows:
    name = re.sub(r'\s+', ' ', raw).strip()
    m = re.search(r'\(\s*(\d+)\s*[xX]\s*([\d.]+)\s*(ml|cl|l|lts|ltr)\s*\)', name, re.I)
    units = size = None; confirmed = False
    if m:
        units = int(m.group(1)); size = size_ml(m.group(2), m.group(3)); confirmed = True
        brand = (name[:m.start()] + ' ' + name[m.end():]).strip()
    else:
        brand = name
        m2 = re.search(r'([\d.]+)\s*(ml|cl|l|lts)\b', name, re.I)   # e.g. "Chivas 750 ml" — size only, units unknown
        if m2: size = size_ml(m2.group(1), m2.group(2)); brand = name[:m2.start()].strip()
    brand = re.sub(r'\s*-\s*Ug$', ' (Ug)', re.sub(r'\s+', ' ', brand)).strip(' -')
    cat = category(name)
    if not confirmed:
        units = units or (24 if cat in ('beer', 'rtd') else 12 if (size or 0) <= 1000 else 4)
        size = size or (330 if cat in ('beer', 'rtd') else 750)
    pack = f"{units} x {fmt}" if confirmed and (fmt := (f"{size/1000:g} L" if size >= 1000 else f"{size:g} ml")) else (
        f"{(f'{size/1000:g} L' if size >= 1000 else f'{size:g} ml')} — case size to confirm" if re.search(r'([\d.]+)\s*(ml|cl|l|lts)\b', name, re.I) else 'to confirm')
    litres = units * size / 1000
    n = name.lower()
    if cat == 'spirits':
        rate = 20 if re.search(PREMIUM, n) else 12 if re.search(MID, n) else 8
        price = litres * rate
    elif cat == 'wine': price = litres * 5
    elif cat == 'beer': price = 18 if size >= 500 else 14
    else: price = 12
    price = round(round(price / 0.05) * 0.05, 2)
    items.append({'no': no, 'source': s, 'name': name, 'brand': brand, 'pack': pack, 'units': units, 'sizeMl': size,
                  'supplierId': SUP[s], 'category': cat, 'packConfirmed': confirmed, 'price': price})
with open(out, 'w') as f:
    f.write('// GENERATED from docs/inspiration/Source.xlsx ("BTW Global – DR Congo price list", 131 SKUs) — see docs/08 §1.\n')
    f.write('// Regenerate: python3 packages/api/scripts/gen_catalogue.py docs/inspiration/Source.xlsx packages/api/src/mock/catalogue.ts\n')
    f.write('// packConfirmed=false → the sheet gives no pack; units/size are assumptions shown as "to confirm".\n')
    f.write('// price = DEMO placeholder by category and pack (the sheet has no prices) — to confirm with the client.\n')
    f.write('export interface CatalogueRow { no: number; source: "KBL" | "GBI" | "SBL" | "UBL"; name: string; brand: string; pack: string; units: number; sizeMl: number; supplierId: string; category: "spirits" | "beer" | "wine" | "rtd"; packConfirmed: boolean; price: number }\n')
    f.write('export const CATALOGUE: CatalogueRow[] = [\n')
    for it in items: f.write('  ' + json.dumps(it, ensure_ascii=False) + ',\n')
    f.write('];\n')
print(len(items), 'rows;', sum(1 for i in items if not i['packConfirmed']), 'packs to confirm')
for it in items[:3] + [i for i in items if not i['packConfirmed']][:4]: print(it)
