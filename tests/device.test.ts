import { test } from "node:test";
import assert from "node:assert/strict";
import { deviceFromUa } from "../src/lib/device.ts";

test("devices seen in the 2026-11-22 validation", () => {
  assert.equal(deviceFromUa("Stremio-Apple/0.6.0 (AppleTV14,1; tvOS 27.2.1)"), "Apple TV");
  assert.equal(deviceFromUa("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)"), "Mac");
  assert.equal(
    deviceFromUa("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36"),
    "Web",
  );
});

test("fallbacks", () => {
  assert.equal(deviceFromUa(null), "Stremio");
  assert.equal(deviceFromUa("Stremio-Apple/0.6.0 (iPad13,1; iPadOS 27.2)"), "iPad");
  assert.equal(deviceFromUa("Mozilla/5.0 (Linux; Android 14; SHIELD Android TV)"), "Android TV");
});
