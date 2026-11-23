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

export type Button = { label: string; url: string };
export type Activity = {
  name: string; details: string; state: string; image: string; hover: string;
  start: number; end: number; buttons: Button[];
};
// From Stremio's Cinemeta catalog; null when it has nothing or could not be reached.
export type Meta = { rating: string | null; cast: string[] };

// Discord caps details and state at 128 characters; tabs and newlines would break the host's line protocol.
const clean = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 128);

export function activityFor(p: PresenceRow | null, now: Date, meta: Meta | null = null): Activity | null {
  if (!p || p.state === "off" || !p.title) return null;
  if (now.getTime() - p.updatedAt.getTime() > PRESENCE_MAX_AGE_MS) return null;
  const { base, season, episode } = parseVideoId(p.videoId ?? "");
  const playing = p.state === "playing" && p.lastSavedAt !== null && p.positionMs !== null;
  const state = [
    playing ? null : "Paused",
    meta?.rating ? `IMDb ${meta.rating}` : null,
    p.device && p.device !== "Stremio" ? `on ${p.device}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  // Start is when playback would have begun at this speed, so Discord's timer shows the real position.
  // Clamped to whole non-negative seconds: the host rejects anything else.
  const secs = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0);
  const start = playing ? secs((p.lastSavedAt!.getTime() - p.positionMs!) / 1000) : 0;
  const end = start && p.durationMs ? start + secs(p.durationMs / 1000) : 0;
  const series = season !== null;
  return {
    name: clean(p.title),
    // The title is already the header. The bold line is only the episode number (a movie has none): long text
    // there wraps badly. The rating goes in the small line, the cast in the poster's hover text.
    details: series && episode !== null ? `Season ${season}, Episode ${episode}` : "",
    state: clean(state),
    image: p.poster ? p.poster.replace("/poster/small/", "/poster/medium/").replace(/\s/g, "") : "",
    hover: clean(meta?.cast.slice(0, 3).join(", ") ?? ""),
    start,
    end,
    buttons: buttonsFor(base, p.videoId, series),
  };
}

// Library saves land every ~90 s with a little jitter; only a real seek should resend the activity.
const SEEK_TOLERANCE_S = 30;

export function sameActivity(a: Activity | null, b: Activity | null): boolean {
  if (!a || !b) return a === b;
  return (
    a.name === b.name &&
    a.details === b.details &&
    a.hover === b.hover &&
    JSON.stringify(a.buttons) === JSON.stringify(b.buttons) &&
    a.state === b.state &&
    a.image === b.image &&
    Math.abs(a.start - b.start) <= SEEK_TOLERANCE_S &&
    Math.abs(a.end - b.end) <= SEEK_TOLERANCE_S
  );
}

export function hostLine(a: Activity | null): string {
  if (!a) return "clear";
  return ["set", a.name, a.details, a.state, a.image, a.hover, a.start, a.end, ...a.buttons.flatMap((b) => [b.label, b.url])].join("\t");
}

// Discord shows at most two buttons and only takes https links. Only IMDb ids: other catalogs' ids do not
// resolve on Stremio Web, Letterboxd or IMDb.
function buttonsFor(base: string, videoId: string | null, series: boolean): Button[] {
  if (!videoId || !/^tt\d+$/.test(base)) return [];
  return [
    { label: "Open in Stremio", url: `https://web.stremio.com/#/detail/${series ? "series" : "movie"}/${base}/${encodeURIComponent(videoId)}` },
    series
      ? { label: "IMDb", url: `https://www.imdb.com/title/${base}/` }
      : { label: "Letterboxd", url: `https://letterboxd.com/imdb/${base}/` },
  ];
}
