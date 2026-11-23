// Pure addon logic: routing, manifest, id parsing. No I/O.
import { APP_NAME } from "./brand.ts";

export const TOKEN_RE = /^[a-z0-9-]{8,64}$/i;

export type Route =
  | { kind: "configure"; token: string | null }
  | { kind: "manifest"; token: string | null }
  | { kind: "resource"; token: string; resource: "stream" | "subtitles"; type: "movie" | "series"; id: string; extra: Record<string, string> }
  | { kind: "events"; token: string }
  | { kind: "not_found" };

export function manifest(token: string | null) {
  return {
    id: "xyz.senne.presence-logger",
    version: "0.1.0",
    name: APP_NAME,
    description: "Shows what you are watching to your friends. Adds no streams or subtitles.",
    resources: ["stream", "subtitles"],
    types: ["movie", "series"],
    catalogs: [],
    behaviorHints: token
      ? { configurable: true }
      : { configurable: true, configurationRequired: true },
  };
}

export function route(pathname: string): Route {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0 || (parts.length === 1 && parts[0] === "configure")) return { kind: "configure", token: null };
  if (parts.length === 1 && parts[0] === "manifest.json") return { kind: "manifest", token: null };

  const [token, ...rest] = parts;
  if (!TOKEN_RE.test(token)) return { kind: "not_found" };
  if (rest.length === 1 && rest[0] === "manifest.json") return { kind: "manifest", token };
  if (rest.length === 1 && rest[0] === "configure") return { kind: "configure", token };
  if (rest.length === 1 && rest[0] === "events") return { kind: "events", token };

  // /{token}/{resource}/{type}/{id}.json or /{token}/{resource}/{type}/{id}/{extra}.json
  const [resource, type, rawId, rawExtra] = rest;
  if ((resource !== "stream" && resource !== "subtitles") || (type !== "movie" && type !== "series") || !rawId || rest.length > 4) {
    return { kind: "not_found" };
  }
  const last = rawExtra ?? rawId;
  if (!last.endsWith(".json")) return { kind: "not_found" };
  let id: string;
  try {
    id = decodeURIComponent(rawExtra ? rawId : rawId.slice(0, -5));
  } catch {
    return { kind: "not_found" };
  }
  // URLSearchParams decodes once itself; decoding first would split values that contain %26 or %3D.
  const extra = rawExtra ? Object.fromEntries(new URLSearchParams(rawExtra.slice(0, -5))) : {};
  return { kind: "resource", token, resource, type, id, extra };
}

// "tt0944947:1:2" -> { base: "tt0944947", season: 1, episode: 2 }. Other id schemes (kitsu:…) stay whole.
export function parseVideoId(id: string) {
  const m = /^(tt\d+)(?::(\d+):(\d+))?$/.exec(id);
  if (!m) return { base: id, season: null, episode: null };
  return {
    base: m[1],
    season: m[2] === undefined ? null : Number(m[2]),
    episode: m[3] === undefined ? null : Number(m[3]),
  };
}
