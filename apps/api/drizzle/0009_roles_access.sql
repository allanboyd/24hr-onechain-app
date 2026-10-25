ALTER TABLE "loadings" ALTER COLUMN "agreed_transport" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "loadings" ALTER COLUMN "agreed_transport" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "feature" text DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "record_type" text;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "record_id" text;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "before" jsonb;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "after" jsonb;--> statement-breakpoint
ALTER TABLE "entities" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "receiving_companies" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "pairs" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "route_ids" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_login_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "audit_at_idx" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "audit_user_idx" ON "audit_log" USING btree ("user_id","at");--> statement-breakpoint
CREATE INDEX "audit_feature_idx" ON "audit_log" USING btree ("feature","at");--> statement-breakpoint
-- docs/12 A-04: a pending loading (or a zero price) means "agreed price not recorded yet"
UPDATE "loadings" SET "agreed_transport" = NULL WHERE "status" = 'Pending' OR "agreed_transport" = 0;--> statement-breakpoint
-- docs/12 A-07: feature area of earlier audit rows (first path segment after /v1)
UPDATE "audit_log" SET "feature" = COALESCE(NULLIF(split_part(regexp_replace("path", '^/(v1/)?', ''), '/', 1), ''), 'other');
