CREATE TABLE "fx_rates" (
	"currency" text NOT NULL,
	"month" text NOT NULL,
	"avg" double precision NOT NULL,
	"closing" double precision NOT NULL,
	"by_user_id" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fx_rates_currency_month_pk" PRIMARY KEY("currency","month")
);
--> statement-breakpoint
ALTER TABLE "entities" ALTER COLUMN "address" SET DATA TYPE text[] USING CASE WHEN "address" IS NULL OR "address" = '' THEN '{}'::text[] ELSE string_to_array("address", E'\n') END;--> statement-breakpoint
ALTER TABLE "entities" ALTER COLUMN "address" SET DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "acks" ADD COLUMN "entity_id" text;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "entity_id" text;--> statement-breakpoint
ALTER TABLE "entities" ADD COLUMN "short_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "entities" ADD COLUMN "phones" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "entities" ADD COLUMN "email" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "entities" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "entities" ADD COLUMN "tagline" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "entities" ADD COLUMN "footer_line" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "entities" ADD COLUMN "colors" jsonb DEFAULT '{"primary":"#062953","accent":"#FE7514","ink":"#0B1B33"}' NOT NULL;--> statement-breakpoint
ALTER TABLE "entities" ADD COLUMN "logo_key" text DEFAULT 'btw' NOT NULL;--> statement-breakpoint
ALTER TABLE "entities" ADD COLUMN "kra_pin" text DEFAULT 'to confirm' NOT NULL;--> statement-breakpoint
ALTER TABLE "entities" ADD COLUMN "registration_no" text DEFAULT 'to confirm' NOT NULL;--> statement-breakpoint
ALTER TABLE "entities" ADD COLUMN "registered_office" text DEFAULT 'to confirm' NOT NULL;--> statement-breakpoint
ALTER TABLE "entities" ADD COLUMN "reporting_currency" text DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE "entities" ADD COLUMN "letterhead" jsonb DEFAULT '{"header":"","footer":""}' NOT NULL;--> statement-breakpoint
ALTER TABLE "loadings" ADD COLUMN "entity_id" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "entity_id" text;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "entity_id" text;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "counterparty_entity_id" text;--> statement-breakpoint
ALTER TABLE "stock_moves" ADD COLUMN "entity_id" text;--> statement-breakpoint
ALTER TABLE "trip_costs" ADD COLUMN "entity_id" text;--> statement-breakpoint
ALTER TABLE "trip_costs" ADD COLUMN "fx_rate" double precision DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "trip_costs" ADD COLUMN "amount_usd" double precision;--> statement-breakpoint
ALTER TABLE "trip_payments" ADD COLUMN "entity_id" text;--> statement-breakpoint
ALTER TABLE "trip_payments" ADD COLUMN "fx_rate" double precision DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "trip_payments" ADD COLUMN "amount_usd" double precision;--> statement-breakpoint
ALTER TABLE "waiting_entries" ADD COLUMN "entity_id" text;--> statement-breakpoint
-- Backfill the owning company of existing rows (from PO / shipment / product supplier), then require it.
UPDATE "loadings" l SET "entity_id" = COALESCE((SELECT po."entity_id" FROM "pos" po WHERE po."id" = l."po_id"), (SELECT "id" FROM "entities" ORDER BY "id" LIMIT 1)) WHERE l."entity_id" IS NULL;--> statement-breakpoint
UPDATE "acks" a SET "entity_id" = COALESCE((SELECT sh."entity_id" FROM "shipments" sh WHERE sh."id" = a."shipment_id"), (SELECT "id" FROM "entities" ORDER BY "id" LIMIT 1)) WHERE a."entity_id" IS NULL;--> statement-breakpoint
UPDATE "trip_costs" c SET "entity_id" = COALESCE((SELECT sh."entity_id" FROM "shipments" sh WHERE sh."id" = c."shipment_id"), (SELECT "id" FROM "entities" ORDER BY "id" LIMIT 1)) WHERE c."entity_id" IS NULL;--> statement-breakpoint
UPDATE "trip_payments" x SET "entity_id" = COALESCE((SELECT sh."entity_id" FROM "shipments" sh WHERE sh."id" = x."shipment_id"), (SELECT "id" FROM "entities" ORDER BY "id" LIMIT 1)) WHERE x."entity_id" IS NULL;--> statement-breakpoint
UPDATE "waiting_entries" w SET "entity_id" = COALESCE((SELECT p."entity_id" FROM "plans" p WHERE p."supplier_id" = w."loading_point_id" GROUP BY p."entity_id" ORDER BY count(*) DESC LIMIT 1), (SELECT "id" FROM "entities" ORDER BY "id" LIMIT 1)) WHERE w."entity_id" IS NULL;--> statement-breakpoint
UPDATE "sales" s SET "entity_id" = COALESCE((SELECT p."entity_id" FROM "plans" p WHERE p."supplier_id" = (SELECT pr."supplier_id" FROM "products" pr WHERE pr."id" = s."lines"->0->>'productId') GROUP BY p."entity_id" ORDER BY count(*) DESC LIMIT 1), (SELECT "id" FROM "entities" ORDER BY "id" LIMIT 1)) WHERE s."entity_id" IS NULL;--> statement-breakpoint
UPDATE "stock_moves" m SET "entity_id" = COALESCE((SELECT sh."entity_id" FROM "shipments" sh WHERE sh."ref" = m."ref" LIMIT 1), (SELECT p."entity_id" FROM "plans" p WHERE p."supplier_id" = (SELECT pr."supplier_id" FROM "products" pr WHERE pr."id" = m."product_id") GROUP BY p."entity_id" ORDER BY count(*) DESC LIMIT 1), (SELECT "id" FROM "entities" ORDER BY "id" LIMIT 1)) WHERE m."entity_id" IS NULL;--> statement-breakpoint
UPDATE "trip_costs" SET "amount_usd" = "amount" WHERE "amount_usd" IS NULL AND "currency" = 'USD';--> statement-breakpoint
UPDATE "trip_payments" SET "amount_usd" = "amount" WHERE "amount_usd" IS NULL;--> statement-breakpoint
ALTER TABLE "acks" ALTER COLUMN "entity_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "loadings" ALTER COLUMN "entity_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ALTER COLUMN "entity_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_moves" ALTER COLUMN "entity_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "trip_costs" ALTER COLUMN "entity_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "trip_payments" ALTER COLUMN "entity_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "waiting_entries" ALTER COLUMN "entity_id" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "acks_entity_idx" ON "acks" USING btree ("entity_id","at");--> statement-breakpoint
CREATE INDEX "loadings_entity_idx" ON "loadings" USING btree ("entity_id","loading_point_id");--> statement-breakpoint
CREATE INDEX "notifications_entity_idx" ON "notifications" USING btree ("entity_id","at");--> statement-breakpoint
CREATE INDEX "plans_entity_idx" ON "plans" USING btree ("entity_id","status");--> statement-breakpoint
CREATE INDEX "pos_entity_idx" ON "pos" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "sales_entity_idx" ON "sales" USING btree ("entity_id","at");--> statement-breakpoint
CREATE INDEX "shipments_entity_idx" ON "shipments" USING btree ("entity_id","created_at");--> statement-breakpoint
CREATE INDEX "stock_moves_entity_idx" ON "stock_moves" USING btree ("entity_id","warehouse_id","product_id");--> statement-breakpoint
CREATE INDEX "trip_costs_entity_idx" ON "trip_costs" USING btree ("entity_id","shipment_id");--> statement-breakpoint
CREATE INDEX "trip_payments_entity_idx" ON "trip_payments" USING btree ("entity_id","shipment_id");--> statement-breakpoint
CREATE INDEX "waiting_entity_idx" ON "waiting_entries" USING btree ("entity_id","loading_point_id");