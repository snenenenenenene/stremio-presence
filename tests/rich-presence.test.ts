import { test } from "node:test";
import assert from "node:assert/strict";
import { activityFor, hostLine, sameActivity, type PresenceRow } from "../src/lib/rich-presence.ts";

const now = new Date("2026-11-23T08:00:00Z");
const row = (o: Partial<PresenceRow>): PresenceRow => ({
  state: "playing", title: "The Odyssey", videoId: "tt33764258", positionMs: 600_000, durationMs: 7_200_000,
  lastSavedAt: new Date(now.getTime() - 30_000), device: "Mac", poster: "https://images.metahub.space/poster/small/tt33764258/img",
  updatedAt: new Date(now.getTime() - 20_000), ...o,
});

test("playing movie: timer from the saved position, medium poster, device", () => {
  const a = activityFor(row({}), now)!;
  const start = Math.round((now.getTime() - 30_000 - 600_000) / 1000);
  assert.deepEqual(a, {
    details: "The Odyssey", state: "on Mac", image: "https://images.metahub.space/poster/medium/tt33764258/img",
    start, end: start + 7200,
  });
});

test("paused episode has no timer and says Paused", () => {
  const a = activityFor(row({ state: "idle", videoId: "tt0944947:1:2", device: "Stremio" }), now)!;
  assert.equal(a.state, "Paused · S1E2");
  assert.equal(a.start, 0);
  assert.equal(a.end, 0);
});

test("off, untitled and stale rows clear the activity", () => {
  assert.equal(activityFor(null, now), null);
  assert.equal(activityFor(row({ state: "off" }), now), null);
  assert.equal(activityFor(row({ title: null }), now), null);
  assert.equal(activityFor(row({ updatedAt: new Date(now.getTime() - 6 * 60_000) }), now), null);
});

test("tabs and newlines cannot break the host protocol", () => {
  const line = hostLine(activityFor(row({ title: "A\tB\nC", device: "Mac\t" }), now));
  assert.equal(line.split("\t").length, 6);
  assert.ok(!line.includes("\n"));
  assert.equal(hostLine(null), "clear");
});

test("save jitter is the same activity, a seek is not", () => {
  const a = activityFor(row({}), now)!;
  assert.ok(sameActivity(a, { ...a, start: a.start + 5, end: a.end + 5 }));
  assert.ok(!sameActivity(a, { ...a, start: a.start - 300, end: a.end - 300 }));
  assert.ok(!sameActivity(a, null));
  assert.ok(sameActivity(null, null));
});

test("bad numbers become no timer instead of a value the host rejects", () => {
  const a = activityFor(row({ positionMs: Number.NaN }), now)!;
  assert.equal(a.start, 0);
  assert.equal(a.end, 0);
  assert.equal(activityFor(row({ lastSavedAt: new Date(0), positionMs: 9e12 }), now)!.start, 0);
  assert.equal(activityFor(row({ poster: "https://x/poster/small/a\tb/img" }), now)!.image, "https://x/poster/medium/ab/img");
});
