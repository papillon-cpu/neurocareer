CREATE TYPE "public"."payment_kind" AS ENUM('employee_access', 'employer_subscription', 'extra_contact');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'succeeded', 'failed', 'canceled');--> statement-breakpoint
CREATE TABLE "admin_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "contact_unlocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employer_user_id" uuid NOT NULL,
	"candidate_user_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"charge_kind" text NOT NULL,
	"payment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_access" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"payment_id" uuid,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"event_id" text NOT NULL,
	"payment_id" uuid,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "payment_kind" NOT NULL,
	"amount_kopecks" integer NOT NULL,
	"currency" text DEFAULT 'RUB' NOT NULL,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"provider" text NOT NULL,
	"provider_payment_id" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"price_kopecks" integer NOT NULL,
	"included_contacts" integer NOT NULL,
	"extra_contact_kopecks" integer NOT NULL,
	"payment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_settings" ADD CONSTRAINT "admin_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_unlocks" ADD CONSTRAINT "contact_unlocks_employer_user_id_users_id_fk" FOREIGN KEY ("employer_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_unlocks" ADD CONSTRAINT "contact_unlocks_candidate_user_id_users_id_fk" FOREIGN KEY ("candidate_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_unlocks" ADD CONSTRAINT "contact_unlocks_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_unlocks" ADD CONSTRAINT "contact_unlocks_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_access" ADD CONSTRAINT "employee_access_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_access" ADD CONSTRAINT "employee_access_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contact_unlock_unique_idx" ON "contact_unlocks" USING btree ("subscription_id","candidate_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_events_unique_idx" ON "payment_events" USING btree ("provider","event_id");--> statement-breakpoint
CREATE INDEX "payments_user_idx" ON "payments" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_id_idx" ON "payments" USING btree ("provider","provider_payment_id");--> statement-breakpoint
CREATE INDEX "subscriptions_user_idx" ON "subscriptions" USING btree ("user_id","period_end");