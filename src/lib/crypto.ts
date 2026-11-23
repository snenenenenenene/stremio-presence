// AES-256-GCM for Stremio auth keys at rest, HMAC for session cookies. Keys come from env.
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

function key(name: string, bytes: number): Buffer {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  const k = Buffer.from(v, "base64");
  if (k.length !== bytes) throw new Error(`${name} must be ${bytes} bytes, base64`);
  return k;
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key("ENCRYPTION_KEY", 32), iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}

export function decrypt(token: string): string {
  const [v, iv, tag, body] = token.split(".");
  if (v !== "v1" || !iv || !tag || !body) throw new Error("bad ciphertext");
  const d = createDecipheriv("aes-256-gcm", key("ENCRYPTION_KEY", 32), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(body, "base64url")), d.final()]).toString("utf8");
}

function mac(data: string): string {
  return createHmac("sha256", key("SESSION_SECRET", 32)).update(data).digest("base64url");
}

// "<payload>.<mac>", payload = base64url(JSON). Returns null if tampered or expired.
export function sign(payload: object, ttlSeconds: number): string {
  const data = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds })).toString("base64url");
  return `${data}.${mac(data)}`;
}

export function verify<T>(token: string | undefined): T | null {
  if (!token) return null;
  const [data, sig] = token.split(".");
  if (!data || !sig) return null;
  const expected = Buffer.from(mac(data));
  const got = Buffer.from(sig);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
  const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as T & { exp: number };
  return payload.exp > Date.now() / 1000 ? payload : null;
}

export const randomToken = (bytes: number) => randomBytes(bytes).toString("base64url");
