import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { bar, clock, renderBoard, verifyInteraction, type BoardRow } from "../src/lib/discord.ts";

test("verifyInteraction accepts Discord's signature scheme and rejects tampering", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const hex = publicKey.export({ format: "der", type: "spki" }).subarray(12).toString("hex");
  const body = '{"type":1}', ts = "1795350000";
  const sig = sign(null, Buffer.from(ts + body), privateKey).toString("hex");
  const now = 1795350010;
  assert.equal(verifyInteraction(body, sig, ts, hex, now), true);
  assert.equal(verifyInteraction('{"type":2}', sig, ts, hex, now), false);
  assert.equal(verifyInteraction(body, sig, "1795350001", hex, now), false);
  assert.equal(verifyInteraction(body, null, ts, hex, now), false);
  assert.equal(verifyInteraction(body, "zz", ts, hex, now), false);
  // A correctly signed body replayed 10 minutes later is refused.
  assert.equal(verifyInteraction(body, sig, ts, hex, now + 600), false);
});

test("clock and bar", () => {
  assert.equal(clock(4254024), "1:10:54");
  assert.equal(clock(69600), "1:09");
  assert.equal(bar(4254024, 7136416), "▰▰▰▰▰▰▰▱▱▱▱▱");
  assert.equal(bar(9e9, 1000), "▰".repeat(12));
});

const row = (o: Partial<BoardRow>): BoardRow => ({
  name: "セン", state: "playing", title: "The Dog Stars", season: null, episode: null,
  positionMs: 4254024, durationMs: 7136416, device: "Apple TV", poster: "https://p/dog.jpg", ...o,
});

test("board lists playing before idle, escapes markdown, uses the playing poster", () => {
  const payload = renderBoard(
    [row({ name: "zed", state: "idle", title: "Survivor", season: 1, episode: 1, positionMs: 0, durationMs: null, device: "Web", poster: "https://p/s.jpg" }), row({ title: "*Odd_title*" })],
    new Date("2026-11-22T15:38:49Z"),
  );
  const d = payload.embeds[0].description;
  assert.ok(d.indexOf("セン") < d.indexOf("zed"));
  assert.ok(d.includes("\\*Odd\\_title\\*"));
  assert.ok(d.includes("1:10:54 / 1:58:56"));
  assert.ok(d.includes("S1E1"));
  assert.ok(d.includes("*idle*"));
  assert.equal(payload.embeds[0].thumbnail?.url, "https://p/dog.jpg");
  assert.deepEqual(payload.allowed_mentions, { parse: [] });
});

test("empty board", () => {
  assert.ok(renderBoard([], new Date()).embeds[0].description.startsWith("Nobody is watching right now."));
});

test("titles and devices cannot inject lines or links into the board", () => {
  const d = renderBoard([row({ title: "Film\n-# <https://evil>", device: "Apple TV\n# x" })], new Date()).embeds[0].description;
  assert.ok(!d.includes("\n-# <https"));
  assert.ok(d.includes("Film \\-\\# \\<https://evil\\>"));
  assert.ok(d.includes("Apple TV \\# x"));
});
