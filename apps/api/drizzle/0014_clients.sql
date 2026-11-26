CREATE TABLE "clients" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_id" text NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"phone" text,
	"warehouse_id" text,
	"terms_days" integer DEFAULT 14 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"by_user_id" text
);
--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "client_id" text;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "terms_days" integer DEFAULT 14 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "clients_entity_name_idx" ON "clients" USING btree ("entity_id","name_key");--> statement-breakpoint
CREATE INDEX "sales_client_idx" ON "sales" USING btree ("client_id");--> statement-breakpoint
-- V3-12 backfill: one client per customer name already on a company's sales (same name whatever spacing or capitals),
-- named as on its first sale, at that sale's warehouse, with the default 14 credit days; each sale then points to it.
INSERT INTO "clients" ("id", "entity_id", "name", "name_key", "warehouse_id", "terms_days", "created_at")
SELECT 'cl-' || substr(md5(f."entity_id" || '|' || f."key"), 1, 16), f."entity_id", f."name", f."key", f."warehouse_id", 14, f."at"
FROM (
  SELECT DISTINCT ON (s."entity_id", lower(regexp_replace(btrim(s."customer"), '\s+', ' ', 'g')))
    s."entity_id", lower(regexp_replace(btrim(s."customer"), '\s+', ' ', 'g')) AS "key",
    regexp_replace(btrim(s."customer"), '\s+', ' ', 'g') AS "name", s."warehouse_id", s."at"
  FROM "sales" s
  WHERE length(btrim(s."customer")) > 0
  ORDER BY s."entity_id", lower(regexp_replace(btrim(s."customer"), '\s+', ' ', 'g')), s."at"
) f
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "sales" s SET "client_id" = c."id"
FROM "clients" c
WHERE c."entity_id" = s."entity_id" AND c."name_key" = lower(regexp_replace(btrim(s."customer"), '\s+', ' ', 'g')) AND s."client_id" IS NULL;
