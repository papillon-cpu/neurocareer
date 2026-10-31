CREATE TABLE "employer_favorites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employer_user_id" uuid NOT NULL,
	"candidate_user_id" uuid NOT NULL,
	"vacancy_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employer_favorites" ADD CONSTRAINT "employer_favorites_employer_user_id_users_id_fk" FOREIGN KEY ("employer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employer_favorites" ADD CONSTRAINT "employer_favorites_candidate_user_id_users_id_fk" FOREIGN KEY ("candidate_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employer_favorites" ADD CONSTRAINT "employer_favorites_vacancy_id_vacancies_id_fk" FOREIGN KEY ("vacancy_id") REFERENCES "public"."vacancies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "employer_favorites_unique_idx" ON "employer_favorites" USING btree ("employer_user_id","candidate_user_id");