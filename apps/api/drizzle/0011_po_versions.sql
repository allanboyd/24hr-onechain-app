CREATE TABLE "po_versions" (
	"po_id" text PRIMARY KEY NOT NULL,
	"base_po_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"ref" text NOT NULL,
	"revision" integer NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"instruction" text NOT NULL,
	"required_by" text NOT NULL,
	"currency" text NOT NULL,
	"lines" jsonb NOT NULL,
	"line_changes" jsonb NOT NULL,
	"reason" text,
	"by_user_id" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pos" ADD COLUMN "status" text DEFAULT 'Issued' NOT NULL;--> statement-breakpoint
ALTER TABLE "pos" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pos" ADD COLUMN "deleted_by_id" text;--> statement-breakpoint
ALTER TABLE "pos" ADD COLUMN "delete_reason" text;--> statement-breakpoint
ALTER TABLE "pos" ADD COLUMN "revision_kind" text;--> statement-breakpoint
ALTER TABLE "pos" ADD COLUMN "line_changes" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "po_versions_base_rev_idx" ON "po_versions" USING btree ("base_po_id","revision");--> statement-breakpoint
-- docs/09 §4: POs are created, updated (= a revision) or deleted — never drafted. Data changes below.
-- Revisions made at loading before this migration.
UPDATE "pos" SET "revision_kind" = 'revised at loading' WHERE "approval" = 'revision' AND "revision_kind" IS NULL;--> statement-breakpoint
-- A submitted (not yet approved) order becomes a PO awaiting approval. When config approvals.purchase_orders is false the
-- API approves it automatically at start-up ("Approved automatically · system"), creating its loadings.
INSERT INTO "pos" ("id", "ref", "plan_id", "entity_id", "supplier_id", "currency", "date", "title", "instruction", "version", "approved_by_id", "approved_at", "approval", "status")
  SELECT 'po-' || pl."id", pl."ref", pl."id", pl."entity_id", pl."supplier_id", pl."currency", pl."date", pl."title", 'Kindly process and avail stock for loading.', pl."version", '', now(), 'issued', 'Awaiting approval'
  FROM "plans" pl WHERE pl."status" = 'Submitted' AND pl."po_id" IS NULL AND pl."revision_of" IS NULL AND jsonb_array_length(pl."lines") > 0;--> statement-breakpoint
UPDATE "plans" SET "po_id" = 'po-' || "id" WHERE "status" = 'Submitted' AND "po_id" IS NULL AND "revision_of" IS NULL AND jsonb_array_length("lines") > 0;--> statement-breakpoint
-- Draft, returned and rejected orders (and empty submitted ones) never became POs: they are discarded — kept in the table
-- with status Deleted, invisible in every list and report.
UPDATE "plans" SET "status" = 'Deleted' WHERE "po_id" IS NULL AND "revision_of" IS NULL AND "status" IN ('Draft', 'Returned', 'Rejected', 'Submitted');--> statement-breakpoint
-- Immutable snapshot of every existing PO version: the original (revision 0) and each revision, from its order.
INSERT INTO "po_versions" ("po_id", "base_po_id", "plan_id", "entity_id", "ref", "revision", "kind", "title", "instruction", "required_by", "currency", "lines", "line_changes", "reason", "by_user_id", "at")
  SELECT p."id", COALESCE(p."revision_of", p."id"), p."plan_id", p."entity_id", p."ref", COALESCE(p."revision", 0),
    CASE WHEN p."revision_of" IS NULL THEN 'original' ELSE COALESCE(p."revision_kind", 'revised at loading') END,
    p."title", p."instruction", pl."required_by", p."currency", pl."lines", '[]'::jsonb, p."revision_reason",
    COALESCE(NULLIF(p."on_behalf_of_id", ''), NULLIF(p."approved_by_id", ''), pl."created_by_id"), p."approved_at"
  FROM "pos" p JOIN "plans" pl ON pl."id" = p."plan_id"
  ON CONFLICT DO NOTHING;
