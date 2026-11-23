// What a user's own Discord profile shows ("Watching …"), built from their presence row.
import { parseVideoId } from "./addon.ts";
import { PRESENCE_MAX_AGE_MS } from "./presence.ts";

export type PresenceRow = {
  state: "playing" | "idle" | "off";
  title: string | null;
  videoId: string | null;
  positionMs: number | null;
  durationMs: number | null;
  lastSavedAt: Date | null;
  device: string | null;
  poster: string | null;
  updatedAt: Date;
};

export type Activity = { details: string; state: string; image: string; start: number; end: number };

// Discord caps details and state at 128 characters; tabs and newlines would break the host's line protocol.
const clean = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 128);

export function activityFor(p: PresenceRow | null, now: Date): Activity | null {
  if (!p || p.state === "off" || !p.title) return null;
  if (now.getTime() - p.updatedAt.getTime() > PRESENCE_MAX_AGE_MS) return null;
  const { season, episode } = parseVideoId(p.videoId ?? "");
  const playing = p.state === "playing" && p.lastSavedAt !== null && p.positionMs !== null;
  const state = [
    playing ? null : "Paused",
    season !== null && episode !== null ? `S${season}E${episode}` : null,
    p.device && p.device !== "Stremio" ? `on ${p.device}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  // Start is when playback would have begun at this speed, so Discord's timer shows the real position.
  // Clamped to whole non-negative seconds: the host rejects anything else.
  const secs = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0);
  const start = playing ? secs((p.lastSavedAt!.getTime() - p.positionMs!) / 1000) : 0;
  const end = start && p.durationMs ? start + secs(p.durationMs / 1000) : 0;
  return {
    details: clean(p.title),
    state: clean(state),
    image: p.poster ? p.poster.replace("/poster/small/", "/poster/medium/").replace(/\s/g, "") : "",
    start,
    end,
  };
}

// Library saves land every ~90 s with a little jitter; only a real seek should resend the activity.
const SEEK_TOLERANCE_S = 30;

export function sameActivity(a: Activity | null, b: Activity | null): boolean {
  if (!a || !b) return a === b;
  return (
    a.details === b.details &&
    a.state === b.state &&
    a.image === b.image &&
    Math.abs(a.start - b.start) <= SEEK_TOLERANCE_S &&
    Math.abs(a.end - b.end) <= SEEK_TOLERANCE_S
  );
}

export function hostLine(a: Activity | null): string {
  return a ? ["set", a.details, a.state, a.image, a.start, a.end].join("\t") : "clear";
}
