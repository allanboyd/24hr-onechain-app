CREATE TABLE "cash_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"receiving_company_id" text NOT NULL,
	"warehouse_id" text,
	"amount" double precision NOT NULL,
	"currency" text NOT NULL,
	"fx_rate" double precision DEFAULT 1 NOT NULL,
	"amount_usd" double precision NOT NULL,
	"date" text NOT NULL,
	"reference" text,
	"note" text,
	"slip" jsonb,
	"by_user_id" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "cash_entries_rc_idx" ON "cash_entries" USING btree ("receiving_company_id","kind");--> statement-breakpoint
CREATE INDEX "cash_entries_wh_idx" ON "cash_entries" USING btree ("warehouse_id","date");