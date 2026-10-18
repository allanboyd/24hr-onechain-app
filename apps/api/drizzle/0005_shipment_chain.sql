ALTER TABLE "shipments" ADD COLUMN "parent_shipment_id" text;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "origin_shipment_id" text;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "from_warehouse_id" text;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "planned_warehouse_id" text;