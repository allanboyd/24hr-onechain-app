CREATE EXTENSION IF NOT EXISTS postgis;
--> statement-breakpoint
CREATE TABLE "acks" (
	"id" text PRIMARY KEY NOT NULL,
	"leg_id" text NOT NULL,
	"shipment_id" text NOT NULL,
	"warehouse_id" text NOT NULL,
	"receiver_name" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"lines" jsonb NOT NULL,
	"signature" text,
	"photos" jsonb DEFAULT '[]' NOT NULL,
	"has_discrepancy" boolean NOT NULL,
	"by_user_id" text
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text,
	"channel" text NOT NULL,
	"method" text NOT NULL,
	"path" text NOT NULL,
	"status" integer NOT NULL,
	"detail" jsonb
);
--> statement-breakpoint
CREATE TABLE "checkpoints" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"country" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"radius_m" integer NOT NULL,
	"code" text NOT NULL,
	"aliases" text[] DEFAULT '{}' NOT NULL,
	"geog" geography(Point, 4326) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"push_token" text,
	"platform" text DEFAULT 'web' NOT NULL,
	"app_version" text,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "drivers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"licence" text DEFAULT '' NOT NULL,
	"provider_id" text NOT NULL,
	"has_app" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entities" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"po_prefix" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"url" text NOT NULL,
	"by_user_id" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"key" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"op" text NOT NULL,
	"status" text NOT NULL,
	"response" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legs" (
	"id" text PRIMARY KEY NOT NULL,
	"shipment_id" text NOT NULL,
	"seq" integer NOT NULL,
	"route_id" text NOT NULL,
	"from_id" text NOT NULL,
	"to_id" text NOT NULL,
	"truck_id" text NOT NULL,
	"driver_id" text NOT NULL,
	"status" text NOT NULL,
	"departed_at" timestamp with time zone,
	"planned_arrival" timestamp with time zone NOT NULL,
	"passes" jsonb NOT NULL,
	"last_ping" jsonb,
	"lines" jsonb NOT NULL,
	"ack_id" text,
	"issues" jsonb DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loadings" (
	"id" text PRIMARY KEY NOT NULL,
	"po_id" text NOT NULL,
	"truck_no" integer NOT NULL,
	"truck_id" text DEFAULT '' NOT NULL,
	"driver_id" text DEFAULT '' NOT NULL,
	"loading_point_id" text NOT NULL,
	"loaded_at" timestamp with time zone,
	"lines" jsonb NOT NULL,
	"agreed_transport" double precision DEFAULT 0 NOT NULL,
	"transport_currency" text DEFAULT 'USD' NOT NULL,
	"documents" jsonb DEFAULT '[]' NOT NULL,
	"status" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_reads" (
	"notification_id" text NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "notification_reads_notification_id_user_id_pk" PRIMARY KEY("notification_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"link" text,
	"for_roles" text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_versions" (
	"plan_id" text NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"reason" text,
	"by_user_id" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_versions_plan_id_version_pk" PRIMARY KEY("plan_id","version")
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" text PRIMARY KEY NOT NULL,
	"ref" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"entity_id" text NOT NULL,
	"supplier_id" text NOT NULL,
	"currency" text NOT NULL,
	"date" text NOT NULL,
	"required_by" text NOT NULL,
	"status" text NOT NULL,
	"version" integer NOT NULL,
	"lines" jsonb NOT NULL,
	"history" jsonb NOT NULL,
	"created_by_id" text NOT NULL,
	"po_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_ref_unique" UNIQUE("ref")
);
--> statement-breakpoint
CREATE TABLE "pos" (
	"id" text PRIMARY KEY NOT NULL,
	"ref" text NOT NULL,
	"plan_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"supplier_id" text NOT NULL,
	"currency" text NOT NULL,
	"date" text NOT NULL,
	"title" text NOT NULL,
	"instruction" text NOT NULL,
	"version" integer NOT NULL,
	"sent_at" timestamp with time zone,
	"approved_by_id" text NOT NULL,
	"approved_at" timestamp with time zone NOT NULL,
	"signature" text
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"leg_id" text,
	"truck_id" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"geog" geography(Point, 4326) NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"source" text NOT NULL,
	"accuracy_m" double precision,
	"speed_kmh" double precision
);
--> statement-breakpoint
CREATE TABLE "price_list" (
	"product_id" text NOT NULL,
	"supplier_id" text NOT NULL,
	"price" double precision NOT NULL,
	"currency" text NOT NULL,
	"from" text NOT NULL,
	CONSTRAINT "price_list_product_id_supplier_id_from_pk" PRIMARY KEY("product_id","supplier_id","from")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"sku" text NOT NULL,
	"brand" text NOT NULL,
	"pack" text NOT NULL,
	"units_per_case" integer NOT NULL,
	"size_ml" integer NOT NULL,
	"supplier_id" text NOT NULL,
	CONSTRAINT "products_sku_unique" UNIQUE("sku")
);
--> statement-breakpoint
CREATE TABLE "providers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"regular" boolean NOT NULL,
	"phone" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receiving_companies" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"countries" text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"device_id" text,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routes" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"distance_km" integer NOT NULL,
	"stops" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" text PRIMARY KEY NOT NULL,
	"ref" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"warehouse_id" text NOT NULL,
	"customer" text NOT NULL,
	"salesperson_id" text NOT NULL,
	"kind" text NOT NULL,
	"lines" jsonb NOT NULL,
	"currency" text NOT NULL,
	"paid" double precision NOT NULL,
	"status" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipments" (
	"id" text PRIMARY KEY NOT NULL,
	"ref" text NOT NULL,
	"po_id" text NOT NULL,
	"truck_no" integer NOT NULL,
	"receiving_company_id" text NOT NULL,
	"warehouse_id" text NOT NULL,
	"status" text NOT NULL,
	"entity_id" text NOT NULL,
	"loading_point_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipments_ref_unique" UNIQUE("ref")
);
--> statement-breakpoint
CREATE TABLE "stock_moves" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"warehouse_id" text NOT NULL,
	"product_id" text NOT NULL,
	"kind" text NOT NULL,
	"qty" integer NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"ref" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"city" text NOT NULL,
	"country" text NOT NULL,
	"checkpoint_id" text NOT NULL,
	"email" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_costs" (
	"id" text PRIMARY KEY NOT NULL,
	"shipment_id" text NOT NULL,
	"leg_id" text,
	"kind" text NOT NULL,
	"amount" double precision NOT NULL,
	"currency" text NOT NULL,
	"doc_ref" text
);
--> statement-breakpoint
CREATE TABLE "trip_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"shipment_id" text NOT NULL,
	"cost_id" text NOT NULL,
	"amount" double precision NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"reference" text NOT NULL,
	"approved_by_id" text,
	"status" text NOT NULL,
	"receipt_file_id" text
);
--> statement-breakpoint
CREATE TABLE "trucks" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"reg" text NOT NULL,
	"trailer" text NOT NULL,
	"capacity_cases" integer NOT NULL,
	"default_driver_id" text,
	CONSTRAINT "trucks_reg_unique" UNIQUE("reg")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"password_hash" text,
	"pin_hash" text,
	"roles" text[] NOT NULL,
	"entity_ids" text[] DEFAULT '{}' NOT NULL,
	"loading_point_ids" text[] DEFAULT '{}' NOT NULL,
	"warehouse_ids" text[] DEFAULT '{}' NOT NULL,
	"driver_id" text,
	"active" boolean DEFAULT true NOT NULL,
	"token_version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "waiting_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"loading_point_id" text NOT NULL,
	"truck_id" text NOT NULL,
	"driver_id" text NOT NULL,
	"arrived_at" timestamp with time zone NOT NULL,
	"position" integer NOT NULL,
	"status" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouses" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"receiving_company_id" text NOT NULL,
	"checkpoint_id" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "checkpoints_geog_idx" ON "checkpoints" USING gist ("geog");--> statement-breakpoint
CREATE INDEX "legs_shipment_idx" ON "legs" USING btree ("shipment_id");--> statement-breakpoint
CREATE INDEX "legs_driver_idx" ON "legs" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX "legs_to_idx" ON "legs" USING btree ("to_id");--> statement-breakpoint
CREATE INDEX "positions_leg_idx" ON "positions" USING btree ("leg_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "refresh_tokens_hash_idx" ON "refresh_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sales_wh_at_idx" ON "sales" USING btree ("warehouse_id","at");--> statement-breakpoint
CREATE INDEX "stock_moves_wp_idx" ON "stock_moves" USING btree ("warehouse_id","product_id","at");