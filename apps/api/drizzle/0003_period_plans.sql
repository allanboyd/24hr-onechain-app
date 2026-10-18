CREATE TABLE "period_plan_versions" (
	"plan_id" text NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"reason" text,
	"by_user_id" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "period_plan_versions_plan_id_version_pk" PRIMARY KEY("plan_id","version")
);
--> statement-breakpoint
CREATE TABLE "period_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"ref" text NOT NULL,
	"entity_id" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"period_kind" text NOT NULL,
	"from" text NOT NULL,
	"to" text NOT NULL,
	"status" text NOT NULL,
	"version" integer NOT NULL,
	"lines" jsonb NOT NULL,
	"history" jsonb NOT NULL,
	"created_by_id" text NOT NULL,
	"copied_from_id" text,
	"amend_reason" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "period_plans_ref_unique" UNIQUE("ref")
);
--> statement-breakpoint
ALTER TABLE "warehouses" ADD COLUMN "country" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "warehouses" ADD COLUMN "town" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX "period_plans_entity_idx" ON "period_plans" USING btree ("entity_id","status","from");