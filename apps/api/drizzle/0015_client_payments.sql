CREATE TABLE "client_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_id" text NOT NULL,
	"sale_id" text NOT NULL,
	"client_id" text,
	"warehouse_id" text NOT NULL,
	"amount" double precision NOT NULL,
	"currency" text NOT NULL,
	"fx_rate" double precision DEFAULT 1 NOT NULL,
	"amount_usd" double precision NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"method" text,
	"reference" text,
	"by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "client_payments_sale_idx" ON "client_payments" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "client_payments_entity_at_idx" ON "client_payments" USING btree ("entity_id","at");--> statement-breakpoint
-- V3-12 backfill: one payment per sale with something paid, dated at the sale, method not recorded; USD at the approved
-- month-average rate of the sale month (or the latest earlier month, else the first on file: the rule of rules.fxFor).
INSERT INTO "client_payments" ("id", "entity_id", "sale_id", "client_id", "warehouse_id", "amount", "currency", "fx_rate", "amount_usd", "at", "method", "by_user_id")
SELECT 'cp-' || s."id", s."entity_id", s."id", s."client_id", s."warehouse_id", s."paid", s."currency",
  CASE WHEN s."currency" = 'USD' THEN 1 ELSE coalesce(r."avg", 1) END,
  CASE WHEN s."currency" = 'USD' THEN s."paid" ELSE round((s."paid" / coalesce(r."avg", 1))::numeric, 2)::double precision END,
  s."at", NULL, s."salesperson_id"
FROM "sales" s
LEFT JOIN LATERAL (
  SELECT f."avg" FROM "fx_rates" f
  WHERE f."currency" = s."currency"
  ORDER BY (f."month" <= to_char(s."at", 'YYYY-MM')) DESC,
           CASE WHEN f."month" <= to_char(s."at", 'YYYY-MM') THEN f."month" END DESC,
           f."month" ASC
  LIMIT 1
) r ON true
WHERE s."paid" > 0
ON CONFLICT DO NOTHING;
