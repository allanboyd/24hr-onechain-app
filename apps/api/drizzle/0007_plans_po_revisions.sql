ALTER TABLE "period_plans" ADD COLUMN "replaced_by_id" text;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "revision_of" text;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "revision" integer;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "superseded_by_id" text;--> statement-breakpoint
ALTER TABLE "pos" ADD COLUMN "approval" text DEFAULT 'director' NOT NULL;--> statement-breakpoint
ALTER TABLE "pos" ADD COLUMN "revision_of" text;--> statement-breakpoint
ALTER TABLE "pos" ADD COLUMN "revision" integer;--> statement-breakpoint
ALTER TABLE "pos" ADD COLUMN "changes" jsonb;--> statement-breakpoint
ALTER TABLE "pos" ADD COLUMN "revision_reason" text;--> statement-breakpoint
ALTER TABLE "pos" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "pos" ADD COLUMN "on_behalf_of_id" text;--> statement-breakpoint
ALTER TABLE "pos" ADD COLUMN "superseded_by_id" text;--> statement-breakpoint
CREATE INDEX "pos_revision_idx" ON "pos" USING btree ("revision_of");--> statement-breakpoint
-- Period plans are suggestions (no approval): anything not replaced is Active.
UPDATE "period_plans" SET "status" = 'Active' WHERE "status" <> 'Replaced';
