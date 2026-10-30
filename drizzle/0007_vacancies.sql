CREATE TYPE "public"."vacancy_level" AS ENUM('intern', 'junior', 'middle', 'senior', 'lead');--> statement-breakpoint
CREATE TYPE "public"."vacancy_status" AS ENUM('draft', 'pending', 'published', 'rejected', 'closed');--> statement-breakpoint
ALTER TYPE "public"."consent_purpose" ADD VALUE 'ai_matching' BEFORE 'marketing';--> statement-breakpoint
CREATE TABLE "match_recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vacancy_id" uuid NOT NULL,
	"candidate_user_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"rank" integer NOT NULL,
	"score" integer NOT NULL,
	"must_matched" integer NOT NULL,
	"must_total" integer NOT NULL,
	"explanation" jsonb NOT NULL,
	"ai_inference" jsonb,
	"algorithm_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recommendation_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recommendation_id" uuid NOT NULL,
	"reporter_user_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"comment" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"resolution_note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "vacancies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employer_user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"tasks" text DEFAULT '' NOT NULL,
	"must_skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"nice_skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"min_experience_years" integer,
	"level" "vacancy_level",
	"work_format" "work_format",
	"city" text DEFAULT '' NOT NULL,
	"salary_from" integer,
	"salary_to" integer,
	"extra" text DEFAULT '' NOT NULL,
	"status" "vacancy_status" DEFAULT 'draft' NOT NULL,
	"moderation_note" text DEFAULT '' NOT NULL,
	"analysis" jsonb,
	"analysis_source" text,
	"analyzed_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "match_recommendations" ADD CONSTRAINT "match_recommendations_vacancy_id_vacancies_id_fk" FOREIGN KEY ("vacancy_id") REFERENCES "public"."vacancies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_recommendations" ADD CONSTRAINT "match_recommendations_candidate_user_id_users_id_fk" FOREIGN KEY ("candidate_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_reports" ADD CONSTRAINT "recommendation_reports_recommendation_id_match_recommendations_id_fk" FOREIGN KEY ("recommendation_id") REFERENCES "public"."match_recommendations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_reports" ADD CONSTRAINT "recommendation_reports_reporter_user_id_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vacancies" ADD CONSTRAINT "vacancies_employer_user_id_users_id_fk" FOREIGN KEY ("employer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "match_rec_vacancy_idx" ON "match_recommendations" USING btree ("vacancy_id","run_id");--> statement-breakpoint
CREATE INDEX "match_rec_candidate_idx" ON "match_recommendations" USING btree ("candidate_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rec_report_unique_idx" ON "recommendation_reports" USING btree ("recommendation_id","reporter_user_id");--> statement-breakpoint
CREATE INDEX "rec_report_status_idx" ON "recommendation_reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "vacancies_employer_idx" ON "vacancies" USING btree ("employer_user_id","status");--> statement-breakpoint
CREATE INDEX "vacancies_status_idx" ON "vacancies" USING btree ("status","updated_at");