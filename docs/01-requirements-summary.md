# 01 — Requirements Summary

**Source of truth:** `docs/inspiration/Requirements_Document_Supply_Chain_System_v0_3.docx` (v0.3, draft for review, 3 Oct 2026).
Requirement IDs (e.g. `PL-03`) and section numbers (e.g. §7.2) refer to that document. Anything not in it is marked **Suggestion**.

Status of this file: **Draft, waiting for answers to the open questions (§5).**

---

## 1. Platform summary

### Purpose
One system on web and mobile that takes a beverage consignment through every stage without anyone retyping it. The stages are Planning, Approval, Purchase Order, Loading, Dispatch (multi-leg), Tracking, Acknowledgement, Inventory, Sales and Analytics (§6). It replaces signed and stamped order letters and tracking that is currently spread across many places. It gives directors live visibility of trucks and shows them which stock sells fast and which is slow (§2, §3).

### Organisations involved
| Kind | Names | Source |
|---|---|---|
| Ordering entities | BTW Global Distributors Ltd, Nihna Unique Distributors Ltd (NUD), Kivu Volcanic Distributors Ltd | §2 |
| Receiving companies (have their own accounts) | Asie (Congo, Rwanda; also re-exports Rwanda → Juba), Zonas (Juba) | §17.1 |
| Supplier export sections / loading points | KBL Nairobi, UBL Kampala, SBL Mwanza (Tanzania), GBI Mombasa | §2, §17.2 |
| Transport providers | ETS Sabrina, Joly, Company X (regular), plus market (non-regular) trucks | §17.4 |

### User roles (§5.1)
| Role | Main job | Channels |
|---|---|---|
| Director | Approve plans, amendments and high-value payments; group view; dashboards and flags | Web + App |
| Planner | Create plans and POs | Web (App: view) |
| Operations / Logistics | Loading, dispatch, truck and driver assignment, legs, documents | Web + App |
| Warehouse / Receiving | Acknowledge deliveries, stock, stock take | Web + App (App is the main channel for receivers) |
| Sales | Record sales, look up stock | Web + App |
| Accounts | Trip payments, balances, expenses | Web (App: view, approve payments) |
| Driver | Trip status and location | App only |
| System Administrator | Users, roles, master data, configuration | Web only |

The handwritten notes (§17.3) also mention a **Truck waiting-list keeper** and a **Fleet follow-up** responsibility. They also say users are scoped by **loading point**. See questions Q-R1 to Q-R3.

### Core modules
1. User & access management (UA)
2. Master data (MD)
3. Planning & approval (PL)
4. Purchase orders (PO)
5. Loading, including the truck waiting list (LD)
6. Dispatch & multi-leg shipments, including truck issues (DS)
7. Truck tracking & ETA (TR)
8. Delivery acknowledgement (AK)
9. Inventory (IN)
10. Sales (SL)
11. Trip financials & landing cost (FN)
12. Receiving-company management accounts (§17.1, no IDs yet)
13. Notifications & documents (NT)
14. Analytics: sales velocity, flags, dashboards, reports (§9, §10)
15. Data platform: reporting store and processing (§11)
16. Mobile app capabilities (MA)

---

## 2. Functional requirements by module

Channel key: **Both** = web and mobile app · **Web** · **App** · "Both (app: view)" = full on web, limited on the app as §5.2 states.
Priority: **M** must · **S** should · **C** could. Phase follows §15 (P1 = core, P2 = live tracking and alerts).

### 2.1 User & access management
| ID | Requirement | Channel | Pri |
|---|---|---|---|
| UA-01 | Role-based access; menus and actions adapted to the role | Both | M |
| UA-02 | Data restricted by entity, branch and warehouse; consolidated group view for directors | Both | M |
| UA-03 | Audit log of create, edit, approve, reject and delete, with user, time and channel | Both (viewing: Web) | M |
| UA-04 | Password policy; optional 2FA for directors and admins | Both | S |
| §17.7 | Assign users to **loading points** as well | Both | (from notes) |

### 2.2 Master data (managed on Web only, per §5.2)
| ID | Requirement | Channel | Pri |
|---|---|---|---|
| MD-01 | Entities, branches, warehouses | Web | M |
| MD-02 | Suppliers / export sections with contacts | Web | M |
| MD-03 | Product catalogue: brand, container type, units per case, size, SKU code | Web | M |
| MD-04 | Price lists per supplier and SKU, with effective dates and currency | Web | M |
| MD-05 | Trucks (registration, capacity in cases, own/hired) and drivers (contact, licence) | Web | M |
| MD-05+ (§17.4) | Transport providers → trucks → trailer → driver; regular or non-regular | Web | (from notes) |
| MD-06 | Customers, routes, locations, border points | Web | M |
| §17.1 | Receiving companies (Asie, Zonas) | Web | (from notes) |

### 2.3 Planning & approval
| ID | Requirement | Channel | Pri |
|---|---|---|---|
| PL-01 | Create a plan with the §7.2 line columns; amounts calculated automatically | Web (App: view) | M |
| PL-01+ (§17.7) | Each plan/PO line also has a "delivered to" receiving company and a route | Web | (from notes) |
| PL-02 | Submit; director approves, rejects or returns with comments | Both | M |
| PL-03 | E-signature and date stamp on approval; approved plan is locked | Both | M |
| PL-04 | Versioned amendments with reason and approver; full history | Both (approve on App) | M |
| PL-05 | Notify the director on submission and the planner on the decision | Both | S |

### 2.4 Purchase orders
| ID | Requirement | Channel | Pri |
|---|---|---|---|
| PO-01 | PO generated from the approved plan with no retyping | Web (App: view) | M |
| PO-02 | Auto reference per entity and period (e.g. `BTW-PO-2026-0002`) plus a free-text title; PDF copying the entity letter format (§7.1) | Web (App: view/share) | M |
| PO-03 | Email the PO to the supplier export section; record when it was sent | Web | S |
| PO-04 | Line status: ordered, loaded, in transit, delivered, outstanding | Both | M |
| PO-05 | Mixed-load trucks; subtotals per brand and per package; grand total; currency in the heading (§7.3) | Both | M |
| §7.3 #2 | Amendments/versions: only the latest approved version is active | Both | M |
| §7.3 #3 | Truck-capacity check per truck | Both | M |

### 2.5 Loading
| ID | Requirement | Channel | Pri |
|---|---|---|---|
| LD-01 | Assign truck registration and driver to each truck line | Both | M |
| LD-02 | Loaded quantity per brand; variance against the ordered quantity | Both | M |
| LD-03 | Loading date, time and location; confirm loading | Both | M |
| LD-04 | Upload or photograph supplier documents (delivery note, invoice, gate pass) | Both (App: camera) | M |
| §17.4 | **Truck waiting list**: ordered queue of trucks per loading point | Both | (from notes) |
| §17.5 | Record the agreed transport price at loading; carry it to trip financials | Both | (from notes) |

### 2.6 Dispatch & multi-leg shipments
| ID | Requirement | Channel | Pri |
|---|---|---|---|
| DS-01 | Shipment with 1..n legs (origin, destination, truck, driver, departure, ETA, status) | Both | M |
| DS-02 | Transfer at intermediate points (receive, then reload onto another truck) | Both | M |
| DS-03 | Reconcile quantities between legs; flag the leg where a loss happened | Both | M |
| DS-04 | Statuses: Planned, Loaded, Dispatched, In transit, At border, Arrived, Acknowledged, Delayed, Cancelled | Both | M |
| DS-05 | Shipment status derived from its legs | Both | M |
| §17.5 | **Truck issue log**: place, reason, time stopped, date fixed, new due date | Both | (from notes) |

### 2.7 Truck tracking & ETA (mostly Phase 2)
| ID | Requirement | Channel | Pri |
|---|---|---|---|
| TR-01 | Location from the driver app and/or the GPS provider API | App (driver) / Integration | S |
| TR-02 | List of active trucks: truck, driver, from, to, goods, status, ETA | Both | M |
| TR-03 | Map of several trucks at once | Both | S |
| TR-04 | Rule-based ETA status: early, on time or late, and by how much | Both | S |
| TR-05 | Alerts: delay, route deviation, long stop, geofence | Both | C |
| TR-06 | Location history stored | Server | S |

### 2.8 Delivery acknowledgement
| ID | Requirement | Channel | Pri |
|---|---|---|---|
| AK-01 | Confirm delivery per leg: date, time, receiver name | Both (App primary) | M |
| AK-02 | Per brand: expected, received, damaged, short/over, remarks | Both | M |
| AK-03 | On-screen signature, stamp, photos; acknowledgement PDF | Both | M |
| AK-04 | Automatic discrepancy report and alert | Both | M |
| AK-05 | Stock posts only after acknowledgement (configurable) | Server | M |

### 2.9 Inventory
| ID | Requirement | Channel | Pri |
|---|---|---|---|
| IN-01 | Live stock by warehouse and SKU; in transit shown separately; §7.5 columns | Both (App: view) | M |
| IN-02 | Stock ledger of every movement | Web | M |
| IN-03 | Transfers between warehouses and branches, with approval | Web (+App approve) | S |
| IN-04 | Stock take and adjustments with reason and approval | Both (App: count entry) | S |
| IN-05 | Reorder and overstock thresholds per SKU and warehouse | Web | S |
| IN-06 | Batch and expiry tracking | Both | C |

### 2.10 Sales
| ID | Requirement | Channel | Pri |
|---|---|---|---|
| SL-01 | Record sales with the §7.4 columns | Both | M |
| SL-02 | Stock reduces automatically; sales above stock blocked unless an authorised user overrides | Both | M |
| SL-03 | Customer, salesperson, payment status; outstanding balances by customer | Both | M |
| SL-04 | Returns and credit notes that restore stock | Both | S |
| SL-05 | Import historical sales from Excel | Web | S |
| §17.1 | Cash, credit and **batch** sales | Both | (from notes) |

### 2.11 Trip financials & landing cost
| ID | Requirement | Channel | Pri |
|---|---|---|---|
| FN-01 | Per trip and leg: agreed cost, payments, balance, other expenses, status | Both (App: view) | M |
| FN-02 | Payments with reference and attached receipts | Web | M |
| FN-03 | Approval of payments above a director-set threshold | Both | S |
| FN-04 | Outstanding balances report; export to accounting software | Web | S |
| §17.5 | Transport fee tracking: paid and unpaid against document references; follow-up period | Web | (from notes) |
| §17.6 | **Landing cost per truck** = price + transport, taxes and duties, clearing and forwarding, loading and offloading, storage and other charges; used for stock value | Web | In scope §4.1 |

### 2.12 Receiving-company management accounts (§17.1, in scope per §4.1; depth to confirm)
| Ref | Requirement | Channel |
|---|---|---|
| §17.1 | Per company (Asie, Zonas): stock, sales, expenses (transport, taxes, clearing, storage, handling, salary, rent, utilities, damaged goods), P&L, retained earnings, dividends | Web (App: summary view) |

### 2.13 Notifications & documents
| ID | Requirement | Channel | Pri |
|---|---|---|---|
| NT-01 | Alerts for approvals, dispatch, delays, arrivals, discrepancies: in-app, email, push; SMS/WhatsApp where configured | Both | S |
| NT-02 | Central document store per order, shipment and leg | Both | M |
| NT-03 | Export any list or report to PDF, Excel, CSV | Web (App: view/share) | M |

### 2.14 Analytics, dashboards & reports (§9, §10)
| Ref | Requirement | Channel |
|---|---|---|
| §9.1 | Measures: velocity (cases/day, rolling 30 days), velocity index, stock cover, sell-through %, days since last sale | Both |
| §9.2 | Classes Fast ≥120% · Normal 80–119% · Slow 40–79% · Stagnant <40% or no sales for 30 days with stock; thresholds adjustable by directors | Both |
| §9.3 | Flags: slow-moving (2 periods), overstock (cover >60 days), stock-out risk (Fast and cover <7 days), dead stock; push to directors; email/WhatsApp digest | Both |
| §9.4 | Drill down both ways brand ↔ branch/warehouse; cross-comparison flag with a suggested transfer; heatmap; filters | Web full; App summary and key drill-downs |
| §10 | Dashboards: Executive, Procurement, Logistics, Inventory, Sales, Finance; charts (trend, bar/ranking, heatmap, map) | Web full; App summary |
| §11 | Dashboards read only from a separate reporting store, filled on a schedule and rebuildable | Server |

### 2.15 Mobile app (§8.13)
| ID | Requirement | Pri |
|---|---|---|
| MA-01 | Android and iOS; same accounts, roles and permissions as web | M |
| MA-02 | Driver: assigned trips and legs, status, events (arrived, at border, offloading), share location | M |
| MA-03 | Receiver: acknowledgement with quantities, damages, photos, signature | M |
| MA-04 | Director: approve plans, amendments, payments; dashboards, flags, alerts | M |
| MA-05 | Sales and warehouse: sales, stock lookup, stock-take counts | S |
| MA-06 | Offline capture (trips, acknowledgements, photos, sales); auto-sync; visible sync status; conflict handling | M |
| MA-07 | Push notifications | S |
| MA-08 | PIN/biometric, session timeout, remote logout | M |
| MA-09 | Camera capture; optional barcode/QR scanning | S |
| MA-10 | Low data use (compressed photos, incremental sync); recent OS versions | M |
| MA-11 | Controlled releases; minimum-version enforcement | S |

---

## 3. Non-functional requirements (§12, §13, §14)

| Area | Requirement |
|---|---|
| Architecture | One backend and API for web and app; **all business rules run on the server** |
| Security | TLS, hashed passwords, RBAC, audit trail, least privilege for staff and developers |
| Mobile security | Encrypted on-device storage for credentials and offline data; PIN/biometric; timeout; remote sign-out |
| Offline | Field functions work offline; automatic sync; clear unsent indicator; conflict handling |
| Availability & backup | Daily automated backups with tested restore (both stores); availability target **to be agreed** |
| Performance | Common screens and reports load "within a few seconds"; pre-computed dashboard summaries; responsive on mid-range phones |
| Browsers | Current Chrome, Edge, Firefox, Safari; desktop, tablet, phone |
| Localisation | East Africa Time; USD and KES with clear labels; dates as `DD Month YYYY`; more languages [Q22] |
| Compliance | Kenya Data Protection Act 2019 and regional rules; hosting location [Q27] |
| Usability | Screens follow the paper layouts; selection lists instead of typing; one-handed app use |
| Maintainability | Documented code and APIs; dev, test and prod environments; handover docs |
| Data | Capture once; access scope on every record; versioned amendments; reporting store rebuildable from operational data |
| Integrations (§13) | GPS (driver app and/or provider API) [Q16]; push, email, SMS, WhatsApp (providers to be selected); e-signature/stamp [Q24]; accounting export [Q26]; maps and routing (to be selected); Excel import (required); app-store distribution [Q20] |
| Delivery | Whole project in **3 months from 3 Oct 2026** (§15) |
| Acceptance (§16) | Reproduce the sample order layouts and totals; velocity classes match manual calculations; a ≥2-leg test shipment runs plan → acknowledgement; offline works on agreed devices |

---

## 4. Out of scope (§4.2)
Statutory accounting, general ledger and payroll; customs systems; hardware; supplier and customer portals; data migration beyond master data and opening balances.

---

## 5. Open questions (answers needed before the plan)

### A. Missing reference documents
- **Q-A1.** The document cites `[CONFIRM Q3, Q5, Q6, Q7, Q12, Q13, Q14, Q16, Q20, Q22, Q24, Q26, Q27]` from a separate *Client Clarification Questions* document, and §15 cites a *Workflow & Delivery Plan* with dates and a Gantt chart. Neither is in `docs/inspiration/`. Can you share them, or their answers?

### B. Organisations, branding & scope
- **Q-B1.** The logo is **BTW Global Distributors**, but the platform serves three entities plus Asie and Zonas. Is BTW the brand for the whole platform (app name, login screen, app icon)? Or should the product have a neutral name, with BTW as one entity letterhead among the others?
- **Q-B2.** PO letterheads need the logo, address, signature and stamp for **each** entity (§14.2). Only the BTW logo was supplied. When will NUD and Kivu assets arrive?
- **Q-B3.** Is there a **vector (SVG) or transparent PNG** logo, plus a version approved for **dark backgrounds**? The supplied JPEG has a white background, and navy lettering disappears on dark surfaces. I won't recolour the logo, so dark mode needs an official variant (or a rule to always place the logo on a white tile).
- **Q-B4.** Are **Asie and Zonas** full entities in the system (users, warehouses, sales, accounts)? Asie also *orders* re-exports (§17.2), but §14.1 says every order is issued under one of the three entities. Which is correct?
- **Q-B5.** What are "**branches**"? They appear in UA-02, sales and analytics, but no branch is ever named. Are they the Asie and Zonas warehouses in Congo, Rwanda and Juba, sales outlets, or something else?
- **Q-B6.** Is **GBI Mombasa** a fourth supplier? It appears only in §17.2. Is "SBL, Tanzania" the same as "SBL Mwanza"?

### C. Roles & access
- **Q-R1.** Do the **waiting-list keeper** (Kabonge, Eric) and **fleet follow-up** (Tesfie) need new roles, or permissions added to Operations/Logistics?
- **Q-R2.** Loading-point users (Joel, Eric, Moses, Tesfie, the Asie team) see "their loading point only". Loading points are *supplier* warehouses, not entity warehouses. Is the loading point a fourth access dimension next to entity, branch and warehouse?
- **Q-R3.** Do drivers of **hired / market trucks** get app accounts? If not, who updates their leg status?
- **Q-R4.** §7.1 says "Prepared by: Operations officer", but the Planner creates plans and POs. Whose name and signature go on the PO?

### D. Process & business rules
- **Q-P1.** When a multi-leg shipment is received at an **intermediate point** (DS-02), does stock post to that warehouse's inventory? Or does it stay "in transit" until the final acknowledgement?
- **Q-P2.** **Truck capacity "in cases"** (MD-05): cases of different pack sizes (24×200 ml vs 24×500 ml) take different space. Should capacity be one number of cases, or per package, weight or pallets?
- **Q-P3.** **Landing cost allocation:** for a mixed-load truck, or a shipment over several legs, how are truck-level costs split across SKUs: by cases, value or volume?
- **Q-P4.** **Currencies:** only USD and KES are listed, but costs arise in UGX, TZS, RWF, CDF and SSP. Which currencies are allowed per document? Who sets exchange rates, and which currency do landing cost and P&L report in?
- **Q-P5.** "**Batch sales**" (§17.1): what is a batch sale?
- **Q-P6.** **Management accounts vs out of scope:** retained earnings and dividends usually need a ledger, but a general ledger is out of scope (§4.2). Are simple categorised income and expense entries plus period-end figures enough? Are salary and rent entered or imported?
- **Q-P7.** **Velocity benchmark:** what counts as a "comparable SKU" when no target exists? Same brand in other warehouses, same package, or the same category?
- **Q-P8.** **Offline conflicts:** if two people change the same record offline (e.g. stock take vs a sale), which wins? Server rejects and the user resolves, or last write wins?
- **Q-P9.** **Transport fee follow-up period** (§17.5 says "one month"). Please confirm.
- **Q-P10.** How often should the **reporting store** refresh (every 15 min, hourly, nightly)? This decides how fresh dashboards and flags are.

### E. Phasing & timeline
- **Q-T1.** Is **3 months** for *both* phases (finishing early January 2027) fixed? Phase 1 alone covers 15+ modules on web and two mobile platforms with offline sync. Is a smaller first release acceptable?
- **Q-T2.** MA-02 (**Must**) includes "share location", but live location is in **Phase 2**. Does Phase 1 cover status events only, with GPS sharing in Phase 2?
- **Q-T3.** Velocity flags are in Phase 1, but they need sales history. Is the historical sales import (SL-05, **Should**) needed at go-live?

### F. Integrations & compliance
- **Q-I1.** E-signature: is a **drawn or uploaded signature image plus stamp** with an audit trail enough, or do you need a certified/qualified digital signature?
- **Q-I2.** Preferred SMS/WhatsApp provider (e.g. Africa's Talking, Twilio, Meta WhatsApp Cloud API)? Who pays the per-message costs?
- **Q-I3.** Hosting: must data stay in Kenya / East Africa (Q27), or is an EU/global cloud region acceptable?
- **Q-I4.** Which accounting software is the export for (QuickBooks, Sage, Xero, Tally, other)?
- **Q-I5.** Interface languages: is French needed (Congo, Rwanda)? Swahili?

### G. Technical
- **Q-G1.** Do you have a **preferred tech stack**, hosting provider or team skill set? The prompt template left this blank. If not, I'll recommend one in the plan.
- **Q-G2.** One mobile app with role-based menus (as §5.2 implies), or separate apps per role? The §11 figure shows "Driver app", "Receiver app" and so on. I've assumed **one app**.

---

## 6. Suggestions (not in the document; flagged, not added)
- **S-1.** Use **tabular (fixed-width) figures** for all quantity and amount columns, so the order tables line up like the paper letters. (Design detail, no scope change.)
- **S-2.** A **"Receiving company"** dimension on plan and PO lines is implied by §17.7. I'd model it as a first-class field from day one, even if its accounts module comes later.
- **S-3.** **Idempotency keys** on every mobile write. This is a technical guard that stops duplicates after offline retries (supports MA-06 and MA-11).
- **S-4.** A **demo/sandbox entity** for training and acceptance testing.
