CREATE TABLE "acquisitions" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"company_id" integer NOT NULL,
	"deal_stage_id" integer NOT NULL,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"estimated_value" numeric(15, 2),
	"target_close_date" timestamp,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"industry" varchar(100),
	"website" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "companies_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "deal_stages" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"sequence" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "deal_stages_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "acquisitions" ADD CONSTRAINT "acquisitions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acquisitions" ADD CONSTRAINT "acquisitions_deal_stage_id_deal_stages_id_fk" FOREIGN KEY ("deal_stage_id") REFERENCES "public"."deal_stages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acquisitions" ADD CONSTRAINT "acquisitions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "acquisitions_company_id_idx" ON "acquisitions" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "acquisitions_deal_stage_id_idx" ON "acquisitions" USING btree ("deal_stage_id");--> statement-breakpoint
CREATE INDEX "acquisitions_created_by_idx" ON "acquisitions" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "acquisitions_status_idx" ON "acquisitions" USING btree ("status");