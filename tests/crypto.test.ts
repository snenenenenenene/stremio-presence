import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
process.env.SESSION_SECRET = randomBytes(32).toString("base64");
const { decrypt, encrypt, sign, verify } = await import("../src/lib/crypto.ts");

test("encrypt/decrypt round trip, fresh IV each time", () => {
  const a = encrypt("stremio-auth-key"), b = encrypt("stremio-auth-key");
  assert.notEqual(a, b);
  assert.equal(decrypt(a), "stremio-auth-key");
});

test("tampered ciphertext fails", () => {
  const parts = encrypt("x").split(".");
  parts[3] = Buffer.from("y").toString("base64url");
  assert.throws(() => decrypt(parts.join(".")));
});

test("signed session verifies; tampered or expired does not", () => {
  const t = sign({ uid: "u1" }, 60);
  assert.equal(verify<{ uid: string }>(t)?.uid, "u1");
  assert.equal(verify(t.slice(0, -2) + "xx"), null);
  const forged = Buffer.from(JSON.stringify({ uid: "admin", exp: 9e9 })).toString("base64url") + "." + t.split(".")[1];
  assert.equal(verify(forged), null);
  assert.equal(verify(sign({ uid: "u1" }, -1)), null);
  assert.equal(verify(undefined), null);
});
