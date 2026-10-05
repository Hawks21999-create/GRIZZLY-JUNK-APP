CREATE TYPE "public"."expense_category" AS ENUM('FUEL', 'VEHICLE_MAINTENANCE', 'VEHICLE_REPAIR', 'INSURANCE', 'ADVERTISING', 'EQUIPMENT', 'SOFTWARE', 'PHONE', 'DUMP_FEES', 'PAYROLL', 'SUPPLIES', 'OFFICE', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."fuel_type" AS ENUM('DIESEL', 'GASOLINE', 'ELECTRIC', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."job_expense_category" AS ENUM('DISPOSAL_SUPPLIES', 'GAS_STATION', 'EQUIPMENT_RENTAL', 'PARKING', 'TOLLS', 'MATERIALS', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('LEAD', 'ESTIMATE_REQUESTED', 'ESTIMATE_SCHEDULED', 'QUOTE_SENT', 'SCHEDULED', 'ON_THE_WAY', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NOT_BOOKED');--> statement-breakpoint
CREATE TYPE "public"."job_type" AS ENUM('SINGLE_ITEM', 'FURNITURE_REMOVAL', 'APPLIANCE_REMOVAL', 'GARAGE_CLEANOUT', 'BASEMENT_CLEANOUT', 'ATTIC_CLEANOUT', 'ESTATE_CLEANOUT', 'MOVE_OUT_CLEANOUT', 'CONSTRUCTION_DEBRIS', 'PROPERTY_CLEANOUT', 'COMMERCIAL', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('CASH', 'CARD', 'CHECK', 'ACH', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('NOT_PAID', 'DEPOSIT_PAID', 'PAID');--> statement-breakpoint
CREATE TYPE "public"."route_stop_type" AS ENUM('BUSINESS', 'CUSTOMER', 'DUMP', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('OWNER', 'ADMIN', 'EMPLOYEE');--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"job_id" uuid,
	"dump_record_id" uuid,
	"job_expense_id" uuid,
	"business_expense_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"vendor" text,
	"category" "expense_category" NOT NULL,
	"description" text,
	"amount" numeric(12, 2) NOT NULL,
	"lead_source_id" uuid,
	"covered_by_job_costs" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"phone_digits" text,
	"email" text,
	"email_lower" text,
	"address" text,
	"city" text,
	"state" text,
	"zip" text,
	"lat" double precision,
	"lng" double precision,
	"lead_source_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dump_facilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"lat" double precision,
	"lng" double precision,
	"default_fee" numeric(12, 2) DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dump_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"facility_id" uuid,
	"facility_name" text,
	"fee" numeric(12, 2) NOT NULL,
	"weight_lbs" numeric(10, 1),
	"loads" integer DEFAULT 1 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"hourly_cost" numeric(12, 2) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"category" "job_expense_category" DEFAULT 'OTHER' NOT NULL,
	"description" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_labor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"hourly_rate" numeric(12, 2) NOT NULL,
	"est_hours" numeric(6, 2) DEFAULT 0 NOT NULL,
	"actual_hours" numeric(6, 2)
);
--> statement-breakpoint
CREATE TABLE "job_route_stops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"type" "route_stop_type" NOT NULL,
	"label" text NOT NULL,
	"address" text NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"leg_miles" numeric(8, 1)
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_number" serial NOT NULL,
	"customer_id" uuid NOT NULL,
	"status" "job_status" DEFAULT 'SCHEDULED' NOT NULL,
	"job_type" "job_type" DEFAULT 'OTHER' NOT NULL,
	"scheduled_start" timestamp with time zone,
	"duration_minutes" integer DEFAULT 120 NOT NULL,
	"address" text NOT NULL,
	"city" text,
	"state" text,
	"zip" text,
	"lat" double precision,
	"lng" double precision,
	"quoted_price" numeric(12, 2) DEFAULT 0 NOT NULL,
	"final_price" numeric(12, 2),
	"deposit" numeric(12, 2) DEFAULT 0 NOT NULL,
	"payment_status" "payment_status" DEFAULT 'NOT_PAID' NOT NULL,
	"payment_method" "payment_method",
	"lead_source_id" uuid,
	"lead_cost" numeric(12, 2) DEFAULT 0 NOT NULL,
	"workers_count" integer DEFAULT 2 NOT NULL,
	"est_labor_hours" numeric(6, 2) DEFAULT 0 NOT NULL,
	"vehicle_id" uuid,
	"mpg" numeric(6, 2) NOT NULL,
	"fuel_price" numeric(8, 3) NOT NULL,
	"maintenance_per_mile" numeric(10, 4) NOT NULL,
	"depreciation_per_mile" numeric(10, 4) NOT NULL,
	"route_miles" numeric(8, 1),
	"miles_override" numeric(8, 1),
	"actual_miles" numeric(8, 1),
	"route_calculated_at" timestamp with time zone,
	"route_error" text,
	"dump_facility_id" uuid,
	"est_dump_cost" numeric(12, 2) DEFAULT 0 NOT NULL,
	"estimate_snapshot" jsonb,
	"notes" text,
	"gcal_event_id" text,
	"gcal_sync_error" text,
	"gcal_synced_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_job_number_unique" UNIQUE("job_number")
);
--> statement-breakpoint
CREATE TABLE "lead_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_sources_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"business_name" text DEFAULT 'Grizzly Junk Removal' NOT NULL,
	"business_phone" text,
	"business_email" text,
	"business_address" text,
	"business_lat" double precision,
	"business_lng" double precision,
	"timezone" text DEFAULT 'America/New_York' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"job_number_prefix" text DEFAULT 'GJR' NOT NULL,
	"default_vehicle_id" uuid,
	"default_dump_facility_id" uuid,
	"default_dump_cost" numeric(12, 2) DEFAULT 0 NOT NULL,
	"default_labor_rate" numeric(12, 2) DEFAULT 20 NOT NULL,
	"default_job_duration" integer DEFAULT 120 NOT NULL,
	"default_workers" integer DEFAULT 2 NOT NULL,
	"default_include_dump" boolean DEFAULT true NOT NULL,
	"avoid_tolls" boolean DEFAULT false NOT NULL,
	"avoid_highways" boolean DEFAULT false NOT NULL,
	"gcal_enabled" boolean DEFAULT false NOT NULL,
	"gcal_calendar_id" text DEFAULT 'primary' NOT NULL,
	"gcal_refresh_token_enc" text,
	"gcal_connected_email" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'OWNER' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"session_version" integer DEFAULT 1 NOT NULL,
	"failed_logins" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"employee_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_employee_id_unique" UNIQUE("employee_id")
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"fuel_type" "fuel_type" DEFAULT 'DIESEL' NOT NULL,
	"mpg" numeric(6, 2) NOT NULL,
	"fuel_price" numeric(8, 3) NOT NULL,
	"maintenance_per_mile" numeric(10, 4) NOT NULL,
	"depreciation_per_mile" numeric(10, 4) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_dump_record_id_dump_records_id_fk" FOREIGN KEY ("dump_record_id") REFERENCES "public"."dump_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_job_expense_id_job_expenses_id_fk" FOREIGN KEY ("job_expense_id") REFERENCES "public"."job_expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_business_expense_id_business_expenses_id_fk" FOREIGN KEY ("business_expense_id") REFERENCES "public"."business_expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_expenses" ADD CONSTRAINT "business_expenses_lead_source_id_lead_sources_id_fk" FOREIGN KEY ("lead_source_id") REFERENCES "public"."lead_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_lead_source_id_lead_sources_id_fk" FOREIGN KEY ("lead_source_id") REFERENCES "public"."lead_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dump_records" ADD CONSTRAINT "dump_records_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dump_records" ADD CONSTRAINT "dump_records_facility_id_dump_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."dump_facilities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_expenses" ADD CONSTRAINT "job_expenses_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_labor" ADD CONSTRAINT "job_labor_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_labor" ADD CONSTRAINT "job_labor_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_route_stops" ADD CONSTRAINT "job_route_stops_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_lead_source_id_lead_sources_id_fk" FOREIGN KEY ("lead_source_id") REFERENCES "public"."lead_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_dump_facility_id_dump_facilities_id_fk" FOREIGN KEY ("dump_facility_id") REFERENCES "public"."dump_facilities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_default_vehicle_id_vehicles_id_fk" FOREIGN KEY ("default_vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_default_dump_facility_id_dump_facilities_id_fk" FOREIGN KEY ("default_dump_facility_id") REFERENCES "public"."dump_facilities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachments_job_idx" ON "attachments" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "attachments_business_expense_idx" ON "attachments" USING btree ("business_expense_id");--> statement-breakpoint
CREATE INDEX "business_expenses_date_idx" ON "business_expenses" USING btree ("date");--> statement-breakpoint
CREATE INDEX "business_expenses_category_idx" ON "business_expenses" USING btree ("category");--> statement-breakpoint
CREATE INDEX "customers_phone_digits_idx" ON "customers" USING btree ("phone_digits");--> statement-breakpoint
CREATE INDEX "customers_email_lower_idx" ON "customers" USING btree ("email_lower");--> statement-breakpoint
CREATE INDEX "customers_name_idx" ON "customers" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "job_labor_job_employee_uq" ON "job_labor" USING btree ("job_id","employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "job_route_stops_job_pos_uq" ON "job_route_stops" USING btree ("job_id","position");--> statement-breakpoint
CREATE INDEX "jobs_scheduled_start_idx" ON "jobs" USING btree ("scheduled_start");--> statement-breakpoint
CREATE INDEX "jobs_status_idx" ON "jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "jobs_customer_idx" ON "jobs" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "jobs_lead_source_idx" ON "jobs" USING btree ("lead_source_id");