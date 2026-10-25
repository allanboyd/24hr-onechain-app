CREATE TABLE "reexport_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"ref" text NOT NULL,
	"entity_id" text NOT NULL,
	"from_warehouse_id" text NOT NULL,
	"to_warehouse_id" text NOT NULL,
	"route_id" text NOT NULL,
	"lines" jsonb NOT NULL,
	"status" text NOT NULL,
	"truck_id" text,
	"driver_id" text,
	"shipment_id" text,
	"note" text,
	"created_by_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"loaded_by_id" text,
	"loaded_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"follow_up_by_id" text,
	CONSTRAINT "reexport_orders_ref_unique" UNIQUE("ref")
);
--> statement-breakpoint
CREATE TABLE "selling_prices" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_id" text NOT NULL,
	"product_id" text NOT NULL,
	"warehouse_id" text,
	"price" double precision NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"from" text NOT NULL,
	"note" text,
	"by_user_id" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse_expenses" (
	"id" text PRIMARY KEY NOT NULL,
	"warehouse_id" text NOT NULL,
	"receiving_company_id" text NOT NULL,
	"date" text NOT NULL,
	"category" text NOT NULL,
	"amount" double precision NOT NULL,
	"currency" text NOT NULL,
	"fx_rate" double precision DEFAULT 1 NOT NULL,
	"amount_usd" double precision NOT NULL,
	"reference" text,
	"note" text,
	"receipt" jsonb,
	"by_user_id" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stock_moves" ADD COLUMN "reason" text;--> statement-breakpoint
ALTER TABLE "stock_moves" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "stock_moves" ADD COLUMN "by_user_id" text;--> statement-breakpoint
CREATE INDEX "reexport_orders_from_idx" ON "reexport_orders" USING btree ("from_warehouse_id","status");--> statement-breakpoint
CREATE INDEX "selling_prices_idx" ON "selling_prices" USING btree ("entity_id","product_id","from");--> statement-breakpoint
CREATE INDEX "warehouse_expenses_wh_idx" ON "warehouse_expenses" USING btree ("warehouse_id","date");