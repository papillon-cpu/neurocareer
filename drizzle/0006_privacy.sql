CREATE TABLE "profile_visibility" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"resume_version_id" uuid,
	"share_email" boolean DEFAULT false NOT NULL,
	"share_phone" boolean DEFAULT false NOT NULL,
	"share_test_results" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "profile_visibility" ADD CONSTRAINT "profile_visibility_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_visibility" ADD CONSTRAINT "profile_visibility_resume_version_id_resume_versions_id_fk" FOREIGN KEY ("resume_version_id") REFERENCES "public"."resume_versions"("id") ON DELETE set null ON UPDATE no action;