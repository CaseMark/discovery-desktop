CREATE TABLE "app_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"firm_name" text,
	"logo_data" text,
	"logo_mime_type" text,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cases" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"vault_id" text NOT NULL,
	"password_hash" text NOT NULL,
	"tags" text,
	"ai_summary" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" text PRIMARY KEY NOT NULL,
	"case_id" text NOT NULL,
	"object_id" text NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer,
	"page_count" integer,
	"ingestion_status" text DEFAULT 'pending' NOT NULL,
	"summary" text,
	"uploaded_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_history" (
	"id" text PRIMARY KEY NOT NULL,
	"case_id" text NOT NULL,
	"query" text NOT NULL,
	"result_count" integer,
	"total_result_count" integer,
	"relevance_threshold" integer,
	"results_cache" text,
	"searched_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_history" ADD CONSTRAINT "search_history_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;