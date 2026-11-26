CREATE TABLE "supplier_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_id" text NOT NULL,
	"supplier_id" text NOT NULL,
	"po_id" text,
	"po_ref" text,
	"kind" text NOT NULL,
	"amount" double precision NOT NULL,
	"currency" text NOT NULL,
	"fx_rate" double precision DEFAULT 1 NOT NULL,
	"amount_usd" double precision NOT NULL,
	"date" text NOT NULL,
	"reference" text,
	"note" text,
	"document" jsonb,
	"status" text NOT NULL,
	"linked_id" text,
	"by_user_id" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by_id" text,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "supplier_entries_pair_idx" ON "supplier_entries" USING btree ("entity_id","supplier_id");--> statement-breakpoint
CREATE INDEX "supplier_entries_po_idx" ON "supplier_entries" USING btree ("po_id");