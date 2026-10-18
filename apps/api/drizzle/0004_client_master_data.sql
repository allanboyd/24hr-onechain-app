ALTER TABLE "drivers" ADD COLUMN "local_phone" text;--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN "phone_note" text;--> statement-breakpoint
ALTER TABLE "price_list" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "pack_confirmed" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "sheet_no" integer;--> statement-breakpoint
ALTER TABLE "trucks" ADD COLUMN "fleet_no" integer;--> statement-breakpoint
ALTER TABLE "trucks" ADD COLUMN "note" text;