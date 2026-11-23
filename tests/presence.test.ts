import { test } from "node:test";
import assert from "node:assert/strict";
import { computePresence, livePosition, presenceChanged, type LibraryItem } from "../src/lib/presence.ts";

// Library items as read from api.strem.io on 2026-11-22 (trimmed to the fields we use).
const dogStars = (lastWatched: string, timeOffset: number): LibraryItem => ({
  _id: "tt21285562", name: "The Dog Stars", type: "movie",
  state: { lastWatched, timeOffset, duration: 7136457, video_id: "tt21285562" },
});
const odyssey: LibraryItem = {
  _id: "tt33764258", name: "The Odyssey", type: "movie",
  state: { lastWatched: "2026-11-22T11:18:01.206847Z", timeOffset: 69600, duration: 10355723, video_id: "tt33764258" },
};
const survivor: LibraryItem = {
  _id: "tt0239195", name: "Survivor", type: "series",
  state: { lastWatched: "2026-11-22T11:28:59.378Z", timeOffset: 0, duration: 0, video_id: "tt0239195:1:1" },
};
const xmen: LibraryItem = {
  _id: "tt16026746", name: "X-Men '97", type: "series",
  state: { lastWatched: "2026-10-11T11:49:26.479Z", timeOffset: 804697, duration: 1830167, video_id: "tt16026746:1:1" },
};
const at = (s: string) => new Date(`2026-11-22T${s}Z`);
const appleTv = [{ base: "tt21285562", device: "Apple TV", ts: at("11:19:27") }];

test("Apple TV playing The Dog Stars, 31 s after a save", () => {
  const p = computePresence([dogStars("2026-11-22T11:30:30.6255Z", 636030), odyssey, survivor, xmen], appleTv, at("11:31:01"));
  assert.equal(p.state, "playing");
  assert.equal(p.title, "The Dog Stars");
  assert.equal(p.device, "Apple TV");
  assert.equal(p.positionMs, 636030);
  assert.equal(p.durationMs, 7136457);
  assert.equal(p.poster, "https://images.metahub.space/poster/small/tt21285562/img");
});

test("paused: one save at 11:34:47, read 253 s later -> idle", () => {
  const p = computePresence([dogStars("2026-11-22T11:34:47Z", 893000)], appleTv, at("11:39:00"));
  assert.equal(p.state, "idle");
  assert.equal(p.positionMs, 893000);
});

test("a title that is playing beats a newer save that never played", () => {
  // Survivor (web, video unsupported) saved at 11:28:59 with offset 0; Dog Stars saved slightly earlier but is playing.
  const p = computePresence([dogStars("2026-11-22T11:28:30Z", 545000), survivor], appleTv, at("11:29:10"));
  assert.equal(p.title, "The Dog Stars");
  assert.equal(p.state, "playing");
});

test("opened but never played -> idle, with episode parsed", () => {
  const p = computePresence([survivor], [{ base: "tt0239195", device: "Web", ts: at("11:28:57") }], at("11:29:10"));
  assert.equal(p.state, "idle");
  assert.equal(p.season, 1);
  assert.equal(p.episode, 1);
  assert.equal(p.device, "Web");
  assert.equal(p.durationMs, null);
});

test("nothing in the last 15 minutes -> off", () => {
  assert.equal(computePresence([odyssey, xmen], [], at("11:40:00")).state, "off");
  assert.equal(computePresence([], [], at("11:40:00")).state, "off");
});

test("device falls back to Stremio when no addon event matches the title", () => {
  const p = computePresence([dogStars("2026-11-22T11:30:30Z", 636030)], [{ base: "tt33764258", device: "Mac", ts: at("11:10:56") }], at("11:31:00"));
  assert.equal(p.device, "Stremio");
});

test("livePosition extrapolates while playing and stops at the runtime", () => {
  const p = computePresence([dogStars("2026-11-22T11:30:30Z", 636030)], [], at("11:31:00"));
  assert.equal(livePosition(p, at("11:31:30")), 636030 + 60_000);
  assert.equal(livePosition(p, at("14:00:00")), 7136457);
  const idle = computePresence([dogStars("2026-11-22T11:34:47Z", 893000)], [], at("11:39:00"));
  assert.equal(livePosition(idle, at("11:40:00")), 893000);
});

test("presenceChanged ignores position drift", () => {
  const a = computePresence([dogStars("2026-11-22T11:30:30Z", 636030)], appleTv, at("11:31:00"));
  const b = computePresence([dogStars("2026-11-22T11:32:01Z", 727000)], appleTv, at("11:32:13"));
  assert.equal(presenceChanged(a, b), false);
  const c = computePresence([dogStars("2026-11-22T11:34:47Z", 893000)], appleTv, at("11:39:00"));
  assert.equal(presenceChanged(b, c), true);
  assert.equal(presenceChanged(null, c), true);
});

test("device survives a long session: addon hit at start, save 45 min later", () => {
  const p = computePresence(
    [dogStars("2026-11-22T12:05:00Z", 2_700_000)],
    [{ base: "tt21285562", device: "Apple TV", ts: at("11:19:27") }],
    at("12:05:30"),
  );
  assert.equal(p.state, "playing");
  assert.equal(p.device, "Apple TV");
});

test("a save from a fast client clock counts as now; one far ahead is ignored", () => {
  const ahead = computePresence([dogStars("2026-11-22T11:33:00Z", 636030)], [], at("11:31:00"));
  assert.equal(ahead.state, "playing");
  assert.equal(livePosition(ahead, at("11:31:00")), 636030);
  assert.equal(computePresence([dogStars("2026-11-22T12:00:00Z", 636030)], [], at("11:31:00")).state, "off");
});

test("Mac app saves every 180 s: still playing just before the next save", () => {
  assert.equal(computePresence([dogStars("2026-11-22T11:30:30Z", 636030)], [], at("11:33:40")).state, "playing");
});
