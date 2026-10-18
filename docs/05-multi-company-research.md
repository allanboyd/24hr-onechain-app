# 05 — Multi-company research (three sibling companies + group view)

**Purpose:** confirm or adjust the decisions in `06-multi-company-plan.md` using how established multi-entity systems work, plus current practice for PostgreSQL isolation, consolidation, switcher UX and Kenyan document rules. Researched 10 Oct 2026; sources at the end. Vendor and consultancy blogs are marked as secondary.

## 1. How leading systems model sibling companies

| System | Model | What we take from it |
|---|---|---|
| **Odoo 18** | One database. Each record has a `company_id`. A user has *allowed companies* and can be logged in to several at once (switcher top-right). **Record rules** filter on the active companies. Shared master data (products, partners) has `company_id = False`, and "company-dependent" fields can differ per company. [1][2] | Same shape as our plan: one database, a company column, shared master data, allowed companies + active company. Odoo's documented pitfall: with two companies active, a user can create a company-A order that uses company-B items; the error only shows later. **Lesson: validate every write so all referenced rows belong to the same company.** |
| **NetSuite OneWorld** | Subsidiaries in a hierarchy. Consolidation rolls ledgers up at period rates and posts **intercompany eliminations** into an *elimination subsidiary*. Unrealised profit in stock isn't eliminated automatically. [3][4][5] | Group view = sum of companies **minus** intercompany items, done in the reporting layer. Mark intercompany documents when they're created (counterparty company); don't try to detect them afterwards. |
| **Business Central** | Separate companies; a *consolidated company* imports each business unit's G/L at a chosen FX rate. No live data in the consolidated company; eliminations are manual. [6][7] | Keep the group view **read-only**. No document is ever "owned" by Group. |
| **Xero / QuickBooks** | One organisation per company, no native consolidation; groups buy add-ons (Joiin, Translucent, Konsolidator). Users on forums ask for it. [8] | Built-in group reporting is a real selling point. Separate databases make it painful. |
| **Zoho Books** | Separate organisations, switcher top-right, one subscription per organisation, no built-in consolidated report (third-party claim). [9][10] | Same lesson. |

**Pattern that fits us:** one database, row-level company scoping (Odoo), shared master data, per-user allowed companies + active company, and a read-only Group view that sums the companies and removes intercompany items (NetSuite / Business Central). Separate databases per company (Xero/Zoho style) would make group reports and shared trucks, routes and drivers hard, so we reject it.

## 2. Data isolation in PostgreSQL

- **App-level scoping alone** depends on every query remembering its filter. **Row-level security (RLS)** keeps working when application code has a bug, and covers every path in: exports, scripts, reports. [11][12]
- **RLS practice** [11][12][13]:
  - a `company_id` column on every company-scoped table, with indexes that start with it
  - a policy reading `current_setting('app.companies', true)`, set with `set_config(..., true)` inside each request's transaction, so pooled connections can't leak it
  - `FORCE ROW LEVEL SECURITY`
  - the app's database role must not be a superuser or have `BYPASSRLS`
  - write policies (`WITH CHECK`) as well as read policies
- **Recommendation for our NestJS + Drizzle API (three companies, directors see all):**
  1. **Now:** strict app-level scoping in one place. A `scope(principal)` helper adds `company_id = ANY(:allowed)` to every repository query, and a write guard checks that each referenced row (plan, PO, truck line, warehouse stock, payment) has the same `company_id` as the document. This is the Odoo lesson.
  2. **Next (before go-live):** add RLS as a second safety net on the transactional tables. Use a policy like `company_id = ANY(string_to_array(current_setting('app.companies', true), ','))`, set per transaction from the principal. Directors get all three ids. Keep a separate `btw_migrator` role that owns the tables, and run the app as `btw_app` without `BYPASSRLS`.
  3. **Leak tests in CI:** for each table and endpoint, sign in as a single-company user and show they can't **read, list, report, export or write** the other two companies' rows. Include the raw SQL path with RLS on.

## 3. Consolidated reporting

- **Currency:** report in **USD**. Translate operational figures at a **single approved rate table**: monthly average rates for revenue and costs, closing rates for stock and balances. Label which rate a figure uses and **never switch bases between periods**. Show constant-currency growth beside reported growth so FX moves don't look like performance. [14][15] Today most of our amounts are already in USD; KES, UGX, TZS and RWF costs (border duties, clearing) need a rate table and a stored `fx_rate` per document.
- **Intercompany (siblings trading with each other):** treat the group as one economic unit [16][17]:
  - remove internal revenue, cost and receivables or payables
  - for goods still in the buying sibling's stock, remove the unrealised profit: *closing intercompany stock × internal margin*. Be clear whether the margin is on cost or on price.
  - reconcile both sides before eliminating.

  **For us:** add `counterparty_company_id` on sales, stock transfers and payments. The group report subtracts those flows, and group stock is valued at the **original landing cost**, not the internal transfer price.
- **What directors compare** (general practice, not from a single source): revenue and growth, **gross margin after landing cost**, stock value and **stock turns / days of cover**, **cash conversion** (collected vs billed, receivables ageing), **on-time delivery %** and transit days per lane, damage/short %, transport cost per case.
- **Group dashboard layout:**
  1. group totals with deltas
  2. a **company split** (stacked bars or small multiples in each company's brand colour)
  3. a **comparison / benchmark** table: the three companies side by side, best figure highlighted, a "group" column, and each figure linking to that company's own report.

  Intercompany eliminations appear as a visible line ("less intercompany"), never silently netted.

## 4. Company switching and branding

- **Placement:**
  - **Switcher:** top of the sidebar or app chrome, *separate* from the profile menu ("which company am I in?" vs "who am I?").
  - **Active company:** shown on every screen as a name plus a **logo or colour**, so a mistake is visible at a glance; a company's visual signature is the cheapest guard against acting in the wrong one.
  - **Returning users:** land in the last-used company. [18][19]
- **Switching:**
  - **One step:** a switch changes the label, the data and the landing page together. Avoid "new label, old data". [18]
  - **On the server:** the switch is applied in the session, permissions are recomputed, and failures show an explicit message (403 or not a member). [20][21]
- **Theming within one design system:**
  - **What changes per company:** only the logo, one accent colour token and the document letterhead.
  - **What stays shared:** layout, typography and status colours (success/warning/danger), so a red "late" badge means the same in every company.
  - **Checks:** each company's accent must pass contrast checks in light and dark mode. NUD's gold and Kivu's red need darker text variants.
- **Preventing cross-company writes:**
  - **Header:** every create or edit form shows the company it belongs to (logo + name).
  - **Defaults:** in Group view the create buttons are disabled or ask for the company first.
  - **Server:** writes are rejected when referenced rows belong to another company (see §2).
  - **Confirmation:** add one for high-impact actions right after a switch, such as approving a plan or a payment.
- **Document branding:**
  - **Letterhead:** POs, delivery notes and future invoices use the **issuing company's** letterhead (logo, legal name, address, contacts, footer line).
  - **Kenya:**
    - **Tax invoices** go through **KRA eTIMS**. A valid receipt shows at least the **supplier's KRA PIN, a QR code and the total**. The fuller list adds invoice number and date/time, item detail with tax, and the **buyer's PIN** when they claim the expense or input VAT. From **1 Jan 2026** KRA checks declared expenses against eTIMS invoices. [22][23][24]
    - **Name:** a private company's name must end in "Limited" / "Ltd", and it must have a registered office. [25] I couldn't confirm a statutory list of particulars for letters and order forms in the Companies Act 2015 or the 2015 Regulations; **confirm with the client's lawyer or company secretary**.
  - **Recommendation:** store each company's **KRA PIN, registration number and registered office** and print them on PO letters and delivery notes now. Leave eTIMS invoicing for when we issue tax invoices; it's out of scope today.

## 5. Recommendations on the plan in 06

| # | Decision in 06 | Verdict | Change / addition |
|---|---|---|---|
| 1 | Tenant = company, one database, row scoping; shared master data | **Confirm** | Add **same-company write validation** (Odoo pitfall). Add `company_id` to **every** transactional table; today `stock_moves`, `sales`, `acks`, `trip_costs`, `trip_payments`, `waiting_entries`, `notifications` lack it (only plans, POs and shipments have it). Index `(company_id, …)`. |
| 2 | Inventory per company even in a shared warehouse | **Confirm** | The stock key becomes **(company, warehouse, SKU)**. An acknowledgement posts stock to the **shipment's** company. A sale must name the company and can only draw that company's stock. Landing cost is per company. |
| 3 | Allowed companies + switcher + Group for directors | **Confirm, sharpen** | Group view is **read-only** (Business Central). Creating anything requires a concrete company. The active company is held server-side in the session and sent as a header; the server checks it against allowed companies on every request. |
| 4 | Group totals = sum in USD; intercompany eliminated | **Confirm, extend** | Add an **FX rate table** (monthly average + closing) and store `amount_usd` + `fx_rate` on non-USD costs. Add `counterparty_company_id` for intercompany flows. Show "less intercompany" as an explicit line. |
| 5 | Per-company logo, accent, letterhead; shared design system | **Confirm** | Accent colours must pass contrast checks in both themes. Shared status colours never change per company. |
| 6 | Company record | **Extend** | Add `kraPin`, `registrationNo`, `registeredOffice`, `legalName` vs `tradingName` (Kivu shows "Volcanic Distributors Limited"), `reportingCurrency`, `letterhead {header, footer, watermark}`. |
| new | Isolation hardening | **Add** | RLS as a second net before go-live (§2), with the app role not bypassing RLS. |

**Risks and the tests that catch them**
1. **Leak between siblings** (list, report, export or file link shows another company's rows): a matrix test of every endpoint as a single-company user, plus the same through raw SQL with RLS on.
2. **Cross-company write** (a BTW plan line using an NUD truck line or stock, or a payment on another company's trip): API tests that try each such reference and expect 403/422.
3. **Shared-warehouse stock mix-up** (an NUD sale drawing BTW stock in Asie Kigali): a rule test with both companies holding the same SKU in the same warehouse. Each company's closing stock must reconcile on its own ledger.
4. **Double counting in Group:** group total = Σ companies − intercompany, checked by a test with a seeded intercompany transfer. The group view must never read a pre-aggregated table that already includes a company twice.
5. **Wrong letterhead or company on a document:** a PDF test per company that checks the legal name, PIN and logo on its PO.
6. **FX drift:** a test that a period recomputed later gives the same USD figures because the stored rates are used.

## 6. Questions for the client (in addition to the four in 06)
1. Each company's **KRA PIN, registration number, registered office** and **legal vs trading name**: they need to appear on POs and later on eTIMS invoices.
2. Do any staff work for **more than one** sibling (e.g. Kabonge, Tesfie)? If yes, which companies each?
3. Are trucks, drivers and transport providers **shared** across the siblings, or contracted per company? This affects who pays the transport.
4. Which **reporting currency and FX source** should we use (e.g. Central Bank of Kenya rates), and monthly or daily?
5. If siblings ever transfer stock, at what **price** (landing cost or a markup)? This decides whether there is unrealised profit to remove.
6. Should accounts staff in one company see another company's **supplier prices and margins**, or are those confidential between siblings?
7. Do the companies share **customer accounts** (one customer buying from several siblings) or keep separate customer lists?

## Sources
1. Odoo 18 — Multi-company guidelines: https://www.odoo.com/documentation/18.0/developer/howtos/company.html
2. Cybrosys — Odoo 18 multi-company setup (secondary): https://www.cybrosys.com/blog/odoo-18-multi-company-setup-guidelines-and-tips
3. Tim Dietrich — NetSuite intercompany eliminations (secondary): https://timdietrich.me/blog/netsuite-intercompany-transactions-eliminations/
4. Kore1 — NetSuite multi-subsidiary consolidation (secondary): https://www.kore1.com/netsuite-multi-subsidiary-consolidation/
5. Houseblend — NetSuite eliminations guide, Jul 2025 (secondary): https://www.houseblend.io/articles/en/netsuite-eliminations-intersocietes-guide
6. Stoneridge — Business Central multi-entity consolidations, Nov 2024 (secondary): https://stoneridgesoftware.com/streamlining-multi-entity-consolidations-in-dynamics-365-business-central/
7. ArcherPoint — Consolidations in Business Central (secondary): https://archerpoint.com/using-consolidations-in-microsoft-dynamics-365-business-central/
8. Xero App Store — multi-entity collection: https://apps.xero.com/us/collection/new-year-grow-multi-entity
9. Zoho Books — Manage multiple organizations: https://www.zoho.com/in/books/kb/general/manage-multiple-organizations.html
10. Aaxonix — Multi-organisation Zoho Books (secondary): https://aaxonix.com/resources/glossary/multi-organisation-zoho-books/
11. AppMaster — PostgreSQL RLS multi-tenant patterns, Mar 2025 (secondary): https://appmaster.io/blog/postgresql-row-level-security-multitenant-patterns
12. OneUptime — Multi-tenant data with RLS in PostgreSQL, Jan 2026 (secondary): https://oneuptime.com/blog/post/2026-01-25-row-level-security-postgresql/view
13. ECOSIRE — Drizzle ORM + Postgres RLS multitenancy (secondary): https://ecosire.com/es/blog/drizzle-orm-postgres-rls-multitenancy
14. Drivetrain — Multi-currency consolidation (secondary): https://www.drivetrain.ai/post/multi-currency-consolidation
15. Dokka — Consolidate across entities and currencies (secondary): https://dokka.com/how-to-consolidate-across-entities-and-currencies-faster/
16. Hyperbots — Intercompany inventory elimination (secondary): https://www.hyperbots.com/glossary/intercompany-inventory-elimination
17. 1C — Reconciling and eliminating intercompany transactions: https://kb.1ci.com/1C_Perform/Guides/1C_Perform_User_Guide/Consolidation/Reconciling_and_eliminating_intercompany_transactions
18. SaaS UI — Workspace / organization switcher UX patterns: https://www.saasui.design/blog/saas-workspace-organization-switcher-ux-patterns
19. Orbix — Multi-tenant dashboard design (secondary): https://www.orbix.studio/blogs/multi-tenant-dashboard-design
20. SSOJet — Switching tenant: https://ssojet.com/docs/en/organizations/switching-tenant
21. Clerk — Organization switcher: https://clerk.com/components/organization-switcher
22. KRA — eTIMS Online Portal User Guide 2025: https://www.kra.go.ke/images/publications/eTIMS-Online-Portal-User-Guide-2025.pdf
23. People Daily — KRA: three features of a valid eTIMS receipt (2026): https://peopledaily.digital/business/kra-outlines-three-features-of-a-valid-etims-receipt/amp
24. Invoice Data Extraction — Kenya eTIMS requirements (secondary): https://invoicedataextraction.com/blog/kenya-etims-requirements
25. Companies Act No. 17 of 2015 (via KPDA): https://www.kpda.or.ke/documents/Policies/The%20Companies%20Act%202015.pdf · Companies (General) Regulations 2015: https://new.kenyalaw.org/akn/ke/act/ln/2015/239/eng@2022-12-31
