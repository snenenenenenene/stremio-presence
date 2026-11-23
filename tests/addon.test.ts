import { test } from "node:test";
import assert from "node:assert/strict";
import { manifest, parseVideoId, route } from "../src/lib/addon.ts";

const T = "0b1c2d3e-aaaa-bbbb-cccc-123456789abc";

test("root and configure route to the configure page", () => {
  assert.deepEqual(route("/"), { kind: "configure", token: null });
  assert.deepEqual(route("/configure"), { kind: "configure", token: null });
  assert.deepEqual(route(`/${T}/configure`), { kind: "configure", token: T });
});

test("manifest with and without token", () => {
  assert.deepEqual(route("/manifest.json"), { kind: "manifest", token: null });
  assert.deepEqual(route(`/${T}/manifest.json`), { kind: "manifest", token: T });
  assert.equal(manifest(null).behaviorHints.configurationRequired, true);
  assert.equal("configurationRequired" in manifest(T).behaviorHints, false);
});

test("stream request without extra", () => {
  assert.deepEqual(route(`/${T}/stream/movie/tt0111161.json`), {
    kind: "resource", token: T, resource: "stream", type: "movie", id: "tt0111161", extra: {},
  });
});

test("subtitles request with encoded series id and extra", () => {
  const r = route(`/${T}/subtitles/series/tt0944947%3A1%3A2/videoHash=abc&videoSize=123&filename=got.s01e02.mkv.json`);
  assert.deepEqual(r, {
    kind: "resource", token: T, resource: "subtitles", type: "series", id: "tt0944947:1:2",
    extra: { videoHash: "abc", videoSize: "123", filename: "got.s01e02.mkv" },
  });
});

test("rejects bad tokens, unknown resources and missing .json", () => {
  assert.equal(route("/short/manifest.json").kind, "not_found");
  assert.equal(route(`/${T}/meta/movie/tt1.json`).kind, "not_found");
  assert.equal(route(`/${T}/stream/movie/tt1`).kind, "not_found");
  assert.equal(route(`/${T}/stream/movie/tt1/a/b.json`).kind, "not_found");
  assert.equal(route(`/${T}/stream/%2e%2e/tt1.json`).kind, "not_found");
  assert.equal(route(`/${T}/stream/movie/%E0%A4%A.json`).kind, "not_found");
});

test("extra values keep encoded & and =", () => {
  const r = route(`/${T}/subtitles/movie/tt1/filename=a%26b%3Dc.mkv&videoSize=1.json`);
  assert.equal(r.kind === "resource" && r.extra.filename, "a&b=c.mkv");
});

test("parseVideoId", () => {
  assert.deepEqual(parseVideoId("tt0944947:1:2"), { base: "tt0944947", season: 1, episode: 2 });
  assert.deepEqual(parseVideoId("tt0111161"), { base: "tt0111161", season: null, episode: null });
  assert.deepEqual(parseVideoId("kitsu:123:4"), { base: "kitsu:123:4", season: null, episode: null });
});
