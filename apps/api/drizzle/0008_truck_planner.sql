ALTER TABLE "drivers" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "kind" text DEFAULT 'company' NOT NULL;--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "contact_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "email" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "notes" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "trucks" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "trucks" ADD COLUMN "documents" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
-- Existing non-regular providers were hired from the market.
UPDATE "providers" SET "kind" = 'market' WHERE "regular" = false;
