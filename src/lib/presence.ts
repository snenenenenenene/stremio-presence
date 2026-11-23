// Presence state from the Stremio account library. Pure: no I/O.
//
// Observed 2026-11-22/23: while playing, Apple TV saves the library item about every 90 s, the Mac app every 180 s;
// pausing saves once, then nothing. Pause and stop look the same, so both become "idle".

import { parseVideoId } from "./addon.ts";

// One 180 s save gap plus a 60 s poll, so steady playback never reads as paused. Pause shows within ~4 min.
export const PLAYING_WINDOW_MS = 240_000;
export const IDLE_WINDOW_MS = 15 * 60_000;
// The addon is hit when playback starts; saves keep coming for the whole film. So match the latest event
// for the title from up to 6 h before the save (and a little after, for clock skew).
export const DEVICE_LOOKBACK_MS = 6 * 60 * 60_000;
export const CLOCK_SKEW_MS = 5 * 60_000;
// The poller writes every 60 s; an older row means it stopped or the link broke, so treat it as off.
export const PRESENCE_MAX_AGE_MS = 5 * 60_000;

export type LibraryItem = {
  _id: string;
  name: string;
  type: string;
  poster?: string | null;
  state: {
    lastWatched?: string | null;
    timeOffset?: number;
    duration?: number;
    video_id?: string | null;
  };
};

export type AddonEvent = { base: string; device: string; ts: Date };

export type Presence = {
  state: "playing" | "idle" | "off";
  title: string | null;
  type: string | null;
  videoId: string | null;
  base: string | null;
  season: number | null;
  episode: number | null;
  positionMs: number | null;
  durationMs: number | null;
  lastSavedAt: Date | null;
  device: string | null;
  poster: string | null;
};

const OFF: Presence = {
  state: "off", title: null, type: null, videoId: null, base: null, season: null, episode: null,
  positionMs: null, durationMs: null, lastSavedAt: null, device: null, poster: null,
};

function savedAt(item: LibraryItem): number {
  const t = item.state.lastWatched ? Date.parse(item.state.lastWatched) : NaN;
  return Number.isNaN(t) ? -Infinity : t;
}

// Time since the save. A save from a client clock that runs ahead counts as "just now"; one far in the future is ignored.
function age(item: LibraryItem, now: number): number {
  const a = now - savedAt(item);
  return a < -CLOCK_SKEW_MS ? Infinity : Math.max(0, a);
}

// A save counts as playback only if the player had actually moved (Survivor on web: opened, offset 0, never played).
function isPlaying(item: LibraryItem, now: number): boolean {
  return age(item, now) <= PLAYING_WINDOW_MS && (item.state.timeOffset ?? 0) > 0;
}

export function computePresence(items: LibraryItem[], events: AddonEvent[], now: Date): Presence {
  const t = now.getTime();
  const recent = items.filter((i) => age(i, t) <= IDLE_WINDOW_MS);
  if (recent.length === 0) return OFF;

  // Prefer what is really playing; among equals, the latest save wins.
  const pick = recent.reduce((best, i) => {
    const a = isPlaying(i, t), b = isPlaying(best, t);
    if (a !== b) return a ? i : best;
    return savedAt(i) > savedAt(best) ? i : best;
  });

  const videoId = pick.state.video_id || pick._id;
  const { base, season, episode } = parseVideoId(videoId);
  const at = savedAt(pick);
  const device =
    events
      .filter((e) => e.base === base && e.ts.getTime() <= at + CLOCK_SKEW_MS && at - e.ts.getTime() <= DEVICE_LOOKBACK_MS)
      .sort((a, b) => b.ts.getTime() - a.ts.getTime())[0]?.device ?? "Stremio";

  return {
    state: isPlaying(pick, t) ? "playing" : "idle",
    title: pick.name,
    type: pick.type,
    videoId,
    base,
    season,
    episode,
    positionMs: pick.state.timeOffset ?? null,
    durationMs: pick.state.duration || null,
    lastSavedAt: new Date(at),
    device,
    poster: pick.poster || (base.startsWith("tt") ? `https://images.metahub.space/poster/small/${base}/img` : null),
  };
}

// Position to show right now: while playing, extrapolate from the last save; never past the runtime.
export function livePosition(p: Presence, now: Date): number | null {
  if (p.positionMs == null) return null;
  if (p.state !== "playing" || !p.lastSavedAt) return p.positionMs;
  const pos = p.positionMs + Math.max(0, now.getTime() - p.lastSavedAt.getTime());
  return p.durationMs ? Math.min(pos, p.durationMs) : pos;
}

// Changed enough to re-render a Discord board? Position drift alone is not a change.
export function presenceChanged(a: Presence | null, b: Presence): boolean {
  if (!a) return b.state !== "off";
  return a.state !== b.state || a.videoId !== b.videoId || a.device !== b.device;
}
