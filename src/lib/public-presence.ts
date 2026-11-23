// What the live page and its API may show. Never includes tokens, ids or the Stremio key.
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { parseVideoId } from "@/lib/addon";
import { PRESENCE_MAX_AGE_MS } from "@/lib/presence";

export type PublicPresence = {
  name: string;
  state: "playing" | "idle" | "off";
  title: string | null;
  type: "movie" | "series" | null;
  season: number | null;
  episode: number | null;
  positionMs: number | null;
  durationMs: number | null;
  lastSavedAt: string | null;
  device: string | null;
  poster: string | null;
  updatedAt: string | null;
};

const SLUG_RE = /^[A-Za-z0-9_-]{6,32}$/;

export async function loadPublicPresence(slug: string): Promise<PublicPresence | null> {
  if (!SLUG_RE.test(slug)) return null;
  const [row] = await db
    .select({ name: schema.users.discordName, p: schema.presence })
    .from(schema.users)
    .leftJoin(schema.presence, eq(schema.presence.userId, schema.users.id))
    .where(eq(schema.users.slug, slug))
    .limit(1);
  if (!row) return null;
  const fresh = row.p?.updatedAt && Date.now() - row.p.updatedAt.getTime() <= PRESENCE_MAX_AGE_MS;
  const p = fresh ? row.p : null;
  const { season, episode } = parseVideoId(p?.videoId ?? "");
  return {
    name: row.name,
    state: p?.state ?? "off",
    title: p?.title ?? null,
    type: p?.type === "movie" || p?.type === "series" ? p.type : null,
    season: p?.videoId ? season : null,
    episode: p?.videoId ? episode : null,
    positionMs: p?.positionMs ?? null,
    durationMs: p?.durationMs ?? null,
    lastSavedAt: p?.lastSavedAt?.toISOString() ?? null,
    device: p?.device ?? null,
    // The poller stores the small poster; the page shows a larger one.
    poster: p?.poster?.replace("/poster/small/", "/poster/medium/") ?? null,
    updatedAt: p?.updatedAt?.toISOString() ?? null,
  };
}
