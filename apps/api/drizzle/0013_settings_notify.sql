ALTER TABLE "users" ADD COLUMN "notify_email" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "notify_sms" boolean DEFAULT false NOT NULL;