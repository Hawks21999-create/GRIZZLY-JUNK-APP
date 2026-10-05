ALTER TYPE "public"."job_status" ADD VALUE 'CONTACTED' BEFORE 'ESTIMATE_REQUESTED';--> statement-breakpoint
CREATE TABLE "fuel_price_quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fuel_type" "fuel_type" DEFAULT 'DIESEL' NOT NULL,
	"price" numeric(8, 3) NOT NULL,
	"source" text NOT NULL,
	"detail" text,
	"sample_size" integer,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "default_include_dump" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "fuel_price_source" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "lead_received_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "booked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "lost_reason" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "include_vehicle_wear" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "fuel_price_auto" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX "fuel_price_quotes_fetched_idx" ON "fuel_price_quotes" USING btree ("fetched_at");--> statement-breakpoint
CREATE INDEX "jobs_lead_received_idx" ON "jobs" USING btree ("lead_received_at");--> statement-breakpoint
CREATE INDEX "jobs_city_idx" ON "jobs" USING btree ("city");--> statement-breakpoint
-- ── Data backfill (keeps all existing data) ──
UPDATE "jobs" SET "lead_received_at" = "created_at";--> statement-breakpoint
UPDATE "jobs" SET "booked_at" = COALESCE("completed_at", "created_at") WHERE "status" IN ('SCHEDULED','ON_THE_WAY','IN_PROGRESS','COMPLETED');--> statement-breakpoint
-- Lead sources: "Facebook" becomes "Facebook Ads" (existing jobs keep their link)
UPDATE "lead_sources" SET "name" = 'Facebook Ads' WHERE "name" = 'Facebook' AND NOT EXISTS (SELECT 1 FROM "lead_sources" WHERE "name" = 'Facebook Ads');--> statement-breakpoint
INSERT INTO "lead_sources" ("name", "sort_order") VALUES
  ('Google Ads', 0), ('Google Business Profile', 1), ('Facebook Ads', 2), ('Facebook Organic', 3), ('Website', 4),
  ('Phone Call', 5), ('Realtor', 6), ('Property Manager', 7), ('Referral', 8), ('Repeat Customer', 9), ('Yard Sign', 10), ('Other', 11)
ON CONFLICT ("name") DO NOTHING;--> statement-breakpoint
UPDATE "lead_sources" SET "active" = true, "sort_order" = CASE "name"
  WHEN 'Google Ads' THEN 0 WHEN 'Google Business Profile' THEN 1 WHEN 'Facebook Ads' THEN 2 WHEN 'Facebook Organic' THEN 3
  WHEN 'Website' THEN 4 WHEN 'Phone Call' THEN 5 WHEN 'Realtor' THEN 6 WHEN 'Property Manager' THEN 7 WHEN 'Referral' THEN 8
  WHEN 'Repeat Customer' THEN 9 WHEN 'Yard Sign' THEN 10 WHEN 'Other' THEN 11 END
WHERE "name" IN ('Google Ads','Google Business Profile','Facebook Ads','Facebook Organic','Website','Phone Call','Realtor','Property Manager','Referral','Repeat Customer','Yard Sign','Other');--> statement-breakpoint
-- Older sources are hidden from new leads but kept (with their history) for reports
UPDATE "lead_sources" SET "active" = false, "sort_order" = 50 WHERE "name" IN ('Apartment','Senior Living','Cold Email','Cold Call');--> statement-breakpoint
-- Default route: Start → Customer → Return
UPDATE "settings" SET "default_include_dump" = false;--> statement-breakpoint
-- Van averages 15 MPG (only changes the untouched starting value)
UPDATE "vehicles" SET "mpg" = 15 WHERE "name" LIKE '%Sprinter%' AND "mpg" = 16;
