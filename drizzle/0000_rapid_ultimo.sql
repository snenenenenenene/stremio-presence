CREATE TABLE "addon_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" text NOT NULL,
	"type" text NOT NULL,
	"video_id" text NOT NULL,
	"base" text NOT NULL,
	"device" text NOT NULL,
	"ua" text,
	"extra" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "allowlist" (
	"discord_id" text PRIMARY KEY NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "discord_boards" (
	"channel_id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"message_id" text
);
--> statement-breakpoint
CREATE TABLE "discord_members" (
	"user_id" uuid NOT NULL,
	"guild_id" text NOT NULL,
	CONSTRAINT "discord_members_user_id_guild_id_pk" PRIMARY KEY("user_id","guild_id")
);
--> statement-breakpoint
CREATE TABLE "presence" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"state" text NOT NULL,
	"title" text,
	"type" text,
	"video_id" text,
	"base" text,
	"position_ms" bigint,
	"duration_ms" bigint,
	"last_saved_at" timestamp with time zone,
	"device" text,
	"poster" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stremio_links" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"auth_key_enc" text NOT NULL,
	"status" text DEFAULT 'ok' NOT NULL,
	"last_polled_at" timestamp with time zone,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"discord_id" text NOT NULL,
	"discord_name" text NOT NULL,
	"addon_token" text NOT NULL,
	"slug" text NOT NULL,
	"public_handle" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_discord_id_unique" UNIQUE("discord_id"),
	CONSTRAINT "users_addon_token_unique" UNIQUE("addon_token"),
	CONSTRAINT "users_slug_unique" UNIQUE("slug"),
	CONSTRAINT "users_public_handle_unique" UNIQUE("public_handle")
);
--> statement-breakpoint
ALTER TABLE "addon_events" ADD CONSTRAINT "addon_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_members" ADD CONSTRAINT "discord_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presence" ADD CONSTRAINT "presence_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stremio_links" ADD CONSTRAINT "stremio_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "addon_events_user_ts" ON "addon_events" USING btree ("user_id","ts");