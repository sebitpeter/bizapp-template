-- Baseline: the schema before staff accounts/payments. Uses IF NOT EXISTS so
-- databases created earlier with `drizzle-kit push` can adopt migrations safely.
CREATE TABLE IF NOT EXISTS "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"category" text NOT NULL,
	"price" double precision NOT NULL,
	"description" text NOT NULL,
	"image_url" text NOT NULL,
	"rating" double precision DEFAULT 5 NOT NULL,
	"review_count" integer DEFAULT 0 NOT NULL,
	"ingredients" text[] DEFAULT '{}' NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"available" boolean DEFAULT true NOT NULL,
	CONSTRAINT "products_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_name" text NOT NULL,
	"customer_email" text NOT NULL,
	"items" jsonb NOT NULL,
	"total" double precision NOT NULL,
	"status" text DEFAULT 'Pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivery_note" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "content_entries" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"label" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_name" text NOT NULL,
	"quote" text NOT NULL,
	"rating" integer DEFAULT 5 NOT NULL,
	"verified" boolean DEFAULT true NOT NULL,
	"product_name" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "media" (
	"id" text PRIMARY KEY NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"data" "bytea",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "site_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
