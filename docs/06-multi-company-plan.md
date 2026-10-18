# 06 — Multi-company (three sibling companies + group view)

**Client direction (10 Oct 2026):**
- The platform serves three sibling companies and all their staff: **BTW Global Distributors**, **Nihna Unique Distributors (NUD)** and **Kivu (Volcanic Distributors Ltd)**.
- Each company has its own name, logo, letterhead, inventory, sales and reports.
- Staff work in their own company.
- Directors can also see **group reports** that combine all three.
- Source letterheads: `docs/inspiration/BTW GLOBAL LETTERHEAD.pdf`, `NIHNA.pdf`, `kivu.pdf`.

## Decisions (agents build to these; the research in `05-multi-company-research.md` may refine them)
1. **Tenant = company (`entity`).** One database with row-level scoping. Every transactional record carries `entity_id`:
   - **Planning and movement:** plans, POs, loadings, shipments, legs (via shipment), acknowledgements.
   - **Stock and sales:** stock moves, sales.
   - **Money:** trip costs and payments.

   Master data shared by all three stays shared: products, suppliers, checkpoints, routes, trucks, providers and drivers. A company is never inferred from a warehouse.
2. **Inventory is owned per company, even in a shared warehouse.** Asie Kigali can hold BTW, NUD and Kivu stock side by side. Stock, cover, velocity and landing cost are computed per company, then summed for the group.
3. **Access:**
   - Staff have `entityIds`. Every list, report and write is filtered to those companies, and a write to another company is refused.
   - A user with more than one company picks the active one in a **company switcher**.
   - **Directors** (and admins) also get **"Group · all companies"**: consolidated totals plus a per-company breakdown and comparison.
   - Field users see their work as usual. The app shows the **company logo of the shipment** they are handling.
4. **Consolidation:**
   - Group totals are the sum of companies in the reporting currency (USD).
   - Every group figure can be split by company.
   - Transfers or sales between sibling companies (intercompany) are marked and **eliminated** from group totals, so stock and revenue aren't double-counted. None exist today, but the model supports them.
5. **Branding per company:**
   - Logo variants, colours, letterhead header and footer, legal name, short name, address, phones, email and tagline.
   - Documents (PO letter, delivery note) use the issuing company's letterhead.
   - The web shell shows the active company's logo and accent; Group view uses a neutral group mark.
   - The design system stays the same. Only the logo, accent and letterhead change.
6. **Company record** (`entities`, additive):
   - Identity: `id, code (BTW|NUD|KVD), name (legal), shortName, poPrefix`
   - Contact: `address[] (lines), phones[], email, website?`
   - Wording: `tagline, footerLine`
   - Look: `colors {primary, accent, ink}`, `logoKey` (folder under `packages/ui/src/assets/brand/entities/<code>/`)

## Facts from the letterheads
| | BTW Global Distributors | Nihna Unique Distributors Ltd | Volcanic Distributors Limited (Kivu) |
|---|---|---|---|
| Colours | navy #062953 · orange #FE7514 | gold / bronze · black | red (KIVU mark) · indigo / purple |
| Tagline / footer | "Your global supply partner" · "People · Products · Partnerships · Progress" | "Distributors, Transporters & Manufacturers" | "Manufacturers · Transporters · Distributors · Importers · Exporters" |
| Address | P.O Box 18051-00100 Nairobi, Kenya · Elgeyo Marakwet Road, Elgeyo Garden | P.O. Box 18051-00100 | P.O Box 18051-00100 Nairobi, Kenya · Elgeyo Marakwet Road, Elgeyo Garden |
| Phones | +254 707 617 460 · +254 701 570 356 | same | same |
| Email | info@btwglobal.co.ke | info@NihnaUnique.co.ke | info@NihnaUnique.co.ke **(same as NUD — confirm with client)** |

## Open questions for the client
- **Kivu's email:** it shows NUD's email. Is that correct, or a copy error?
- **Kivu's name:** is its legal name "Kivu Volcanic Distributors Ltd" (requirements) or "Volcanic Distributors Limited" (letterhead)?
- **Intercompany sales:** do the siblings ever sell or transfer stock to each other?
- **Asie and Zonas** (receiving companies): are they separate tenants with their own staff, or warehouses operated for all three siblings?

## Agents and ownership (no two agents edit the same path)
| Agent | Owns |
|---|---|
| R · research | `docs/05-multi-company-research.md` |
| B · brand & letterheads | `docs/brand/**`, `packages/ui/src/assets/brand/**` (adds `entities/<code>/`), `apps/api/templates/**`, `apps/api/src/integrations/pdf*` |
| C · data & API | `packages/api/**`, `apps/api/**` except B's paths, `docs/api/openapi.yaml` |
| D · web & field UI | `apps/web/**`, `apps/field/**`, `tools/mockups/**` |

## Refinements adopted from the research (10 Oct 2026, see `05-multi-company-research.md`)
1. **Company on every transactional table:** `entity_id` on every transactional table, including stock moves, sales, acknowledgements, trip costs and payments, waiting entries and notifications. Stock is keyed by (company, warehouse, product).
2. **Same-company checks on writes:** a write is refused if anything it references (plan line, loading, stock, cost line, leg) belongs to another company.
3. **Group view is read-only:** every create or update needs one concrete company. The active company (header `X-Entity-Id`; omitted means Group) is checked against the user's allowed companies on every request.
4. **Currency and intercompany:**
   - An approved rate table: monthly average for profit and loss, closing rate for stock and balances.
   - Non-USD amounts store their rate and the USD amount.
   - Intercompany items carry the counterparty company.
   - Group = sum of companies − intercompany, shown as an explicit line.
5. **Company record additions:** KRA PIN, registration number, registered office, legal vs trading name, reporting currency, and letterhead assets. PIN and registration number print on POs and delivery notes, as "to confirm" placeholders until the client supplies them.
6. **Database safety net and testing:** PostgreSQL row-level security (`FORCE RLS`, app role without `BYPASSRLS`), plus a cross-company leak-test matrix in CI.
7. **Colours:** company accents must pass contrast checks, with a darker text-safe `ink` colour for NUD gold and Kivu red. Status colours stay shared.

More client questions are in research §6: KRA PINs, shared staff, shared trucks, the exchange-rate source, transfer pricing, price confidentiality between siblings, and shared customers.
