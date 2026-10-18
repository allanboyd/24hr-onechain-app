# 08 — Client data, legs as new shipments, flexible warehouses (15 Oct 2026)

Sources:
- the client's message (ETS Sabrina Ltd trucks and drivers)
- `docs/inspiration/Source.xlsx` ("BTW Global – DR Congo price list": 131 products by source)
- the highlighted requirements copy `docs/inspiration/Copy of Requirements_Document_Supply_Chain_System_v0_3 (Repaired).docx`

## 1. Master data from the client (replaces the made-up demo items)
**Products: 131 SKUs from `Source.xlsx`**

| Source | SKUs | Range |
|---|---|---|
| KBL | 55 | spirits, beer, RTDs |
| GBI | 55 | spirits and wine |
| SBL | 5 | |
| UBL | 16 | |

- **Brand and pack:** brand = the name; pack = the bracketed "N x size" (e.g. "12 x 750 ml", "48 x 20 cl", "4 x 5 L"), normalised to units per case and size in ml. Where the sheet gives no pack (e.g. "Tusker Lite Cans", "Heineken", "Four Cousins"), pack = **"to confirm"**.
- **Category:** spirits / beer / wine / RTD-other, derived from the name for reports.
- **Same brand at two sources:** a product sold from two sources (Gilbey's Gin at SBL and UBL; V&A at KBL and UBL "‑ Ug"; Guinness bottles at KBL, SBL and UBL) is a separate SKU per source.
- **Prices:** the sheet has **no prices**. Demo prices are placeholders by category and pack, marked "demo price — to confirm" in master data and the price list. Real prices go in when the client supplies them.

**Transport provider: ETS Sabrina Ltd, 30 trucks**

| # | Prime | Trailer | Driver | Phone |
|---|---|---|---|---|
| 1 | KBV 894T | ZE 3312 | Mawazi K | 0702750019 |
| 2 | SSD 879T | ZG 9443 | Kanyike E | 0701811686 |
| 3 | SSD 883S | SSD 788S | Kawooya F | 0717587119 |
| 4 | SSD 040D | SSD 042D | Mutenderwa | 0758984306 |
| 5 | KDW 163T | ZJ 3368 | Luberenga E | 0112226067 |
| 6 | SSD 056S | SSD 179S | Mutebi M | 0114048788 |
| 7 | UAS 126S | SSD 979P | Mukwaya M | 0114373541 |
| 8 | KCC 212B | ZG 3721 | Bwanika Nick | 0119962101 |
| 9 | KCV 326U | ZE 9221 | Zzigwa R | 0715106228 |
| 10 | KCV 327U | ZE 9284 | Kasule | 0143025583 |
| 11 | KBU 587X | ZE 0212 | Dhikusooka S | 0143998577 |
| 12 | SSD 787S | SSD 789S | Mutabi G | 0745589856 |
| 13 | SSD 585U | SSD 881U | Kizito Kayinga | 0789316729 |
| 14 | SSD 094U | SSD 163AJ | Kisakye J | 0795298531 |
| 15 | SSD 095U | SSD 655Q | Kalanzi G | 0790326783 |
| 16 | KDW 467W | ZJ 6182 | Talyaka E | 0769557504 |
| 17 | UAX 786N | ZG 2954 | Ddamba W | 0758085901 |
| 18 | KCK 755X | ZG 6267 | Dawit G | 0706513759 |
| 19 | KBS 988R | ZH 9354 | Kirumira A | 0704735333 |
| 20 | KBS 017C | ZJ 4720 | Mwooza D | 0725123765 |
| 21 | KCY 746G | ZG 1931 | Musika | 0756129528 |
| 22 | UAY 563H | ZE 1235 | *(no driver — to confirm)* | |
| 23 | SSD 187S | SSD 180S | Jimmy K | 0110755898 |
| 24 | SSD 336D | SSD 334D | Binyesiga F | 0797246400 |
| 25 | SSD 860T | SSD 530U | A. Mutebi | 0799425525 |
| 26 | KBP 578Q | ZD 8143 | Geeri P | 0720261825 |
| 27 | KCF 642U | ZJ 3367 | Kiyemba M | 0700366406 |
| 28 | SSD 394Z | ZH 3065 | Kazibwe I | 0110942606 |
| 29 | KDV 019R | ZH 9503 | Ssenkumba J | 0716365550 |
| 30 | KDW 165T | ZJ 2797 | Bogere H | 0790485167 |

- **Phone numbers:** stored exactly as supplied (local format). The international number is assumed to be **+254** (Kenya), flagged "to confirm", because some drivers may use Ugandan or South Sudanese numbers. SMS and app sign-in use the international number.
- **Truck capacity in cases** is not given. Use 2,000 cases, marked "to confirm".
- **Other providers:** the other regular providers (Joly, Company X) and market trucks stay as demo data until the client supplies their lists.

## 2. Legs: the first destination is a warehouse, each next leg is a new shipment
From the highlighted requirements (§3): *"In case there is another leg, let the first destination be treated as a warehouse, the next leg(s) treated as a new shipment(s)."*

1. **Arrival:** when a truck arrives at an intermediate destination (e.g. Rwanda – Gisenyi), the receiver acknowledges it and the goods **post to that warehouse's stock** for the owning company. This replaces the earlier "stays in transit" assumption (Q-P1).
2. **Onward move:** moving goods on (e.g. Gisenyi → Goma) creates a **new shipment** from that warehouse, with its own ref, truck, driver and route. It takes stock out of the first warehouse and posts it into the next on acknowledgement.
3. **Traceability:** each shipment keeps `parentShipmentId` / `originShipmentId`, so the full journey can still be followed end to end and reconciled leg by leg (loaded vs received per shipment). Losses show on the shipment where they happen.
4. **Landing cost:** costs add up along the chain, so the final warehouse's landing cost includes the earlier shipments' costs, pro rata by cases.

## 3. Flexible warehouses
- The owner (admin, director) can **add, edit or deactivate warehouses**. Each has: country, town or city, name, receiving company, geofence point (lat/lng + radius) and active flag. For example, a second Congo warehouse in another town.
- New warehouses appear as destinations in period plans, POs, routes and the field app straight away.
- New routes can end at a new warehouse (route editor: pick checkpoints).

## 4. Seeded demo data, kept consistent
- **Seed data:** replace the made-up brands (Brand A Lager…) and trucks with the client's products and ETS Sabrina trucks and drivers in every seeded flow: history, period plans, POs, shipments, sales, stock and analytics.
- **Lanes:** BTW buys from KBL, NUD from UBL and GBI, Kivu from SBL (per requirements §17.2).
- **Demo cycle:** keep the 3-month end-to-end cycle, now with the transfer as two shipments: Nairobi → Gisenyi (received into stock), then a new shipment Gisenyi → Goma.
- **Driver logins:** keep the demo driver logins working by giving 2–3 ETS Sabrina drivers app accounts (PIN 1234). Other drivers are "no app — SMS".

## Questions for the client
- Real prices per SKU (and currency).
- Truck capacity per truck, in cases or by weight.
- Drivers' phone country codes.
- Pack sizes for the SKUs without one.
- The driver for truck 22.
- Which other transport providers to load.
