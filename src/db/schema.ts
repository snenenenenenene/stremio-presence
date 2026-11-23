import { bigint, index, jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const allowlist = pgTable("allowlist", {
  discordId: text("discord_id").primaryKey(),
  note: text("note"),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  discordId: text("discord_id").notNull().unique(),
  discordName: text("discord_name").notNull(),
  // Secret used in the addon URL; never shown on public pages.
  addonToken: text("addon_token").notNull().unique(),
  // Unlisted live page: /u/<slug>.
  slug: text("slug").notNull().unique(),
  publicHandle: text("public_handle").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const stremioLinks = pgTable("stremio_links", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  authKeyEnc: text("auth_key_enc").notNull(),
  status: text("status", { enum: ["ok", "broken"] }).notNull().default("ok"),
  lastPolledAt: timestamp("last_polled_at", { withTimezone: true }),
  lastError: text("last_error"),
});

// Discord OAuth tokens for the Social SDK presence daemon (sdk.social_layer_presence). Encrypted at rest.
export const discordTokens = pgTable("discord_tokens", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  accessEnc: text("access_enc").notNull(),
  refreshEnc: text("refresh_enc").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  scope: text("scope").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const addonEvents = pgTable(
  "addon_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
    kind: text("kind", { enum: ["stream_lookup", "player_open"] }).notNull(),
    type: text("type").notNull(),
    videoId: text("video_id").notNull(),
    base: text("base").notNull(),
    device: text("device").notNull(),
    ua: text("ua"),
    extra: jsonb("extra").$type<Record<string, string>>().notNull().default({}),
  },
  (t) => [index("addon_events_user_ts").on(t.userId, t.ts)],
);

export const presence = pgTable("presence", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  state: text("state", { enum: ["playing", "idle", "off"] }).notNull(),
  title: text("title"),
  type: text("type"),
  videoId: text("video_id"),
  base: text("base"),
  positionMs: bigint("position_ms", { mode: "number" }),
  durationMs: bigint("duration_ms", { mode: "number" }),
  lastSavedAt: timestamp("last_saved_at", { withTimezone: true }),
  device: text("device"),
  poster: text("poster"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const discordBoards = pgTable("discord_boards", {
  channelId: text("channel_id").primaryKey(),
  guildId: text("guild_id").notNull(),
  messageId: text("message_id"),
});

export const discordMembers = pgTable(
  "discord_members",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    guildId: text("guild_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.guildId] })],
);
