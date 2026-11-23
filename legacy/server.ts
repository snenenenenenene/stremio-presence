import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { appendFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { manifest, parseVideoId, route } from "../src/lib/addon.ts";

const PORT = Number(process.env.PORT ?? 7000);
const DATA_DIR = process.env.DATA_DIR ?? "data";
const EVENTS_FILE = join(DATA_DIR, "events.jsonl");
const RECENT_LIMIT = 200;
const MAX_TOKENS = 1000;
const MAX_TITLES = 5000;

type Title = { name: string | null; runtime: string | null };
type Event = Record<string, unknown> & { token: string };
const recent = new Map<string, Event[]>();
const titles = new Map<string, Promise<Title>>();
const NO_TITLE: Title = { name: null, runtime: null };

// Cinemeta only knows IMDb ids; other schemes are logged without a title.
function lookupTitle(type: "movie" | "series", base: string): Promise<Title> {
  if (!/^tt\d+$/.test(base)) return Promise.resolve(NO_TITLE);
  const key = `${type}/${base}`;
  let hit = titles.get(key);
  if (!hit) {
    if (titles.size >= MAX_TITLES) titles.delete(titles.keys().next().value!);
    hit = fetch(`https://v3-cinemeta.strem.io/meta/${type}/${base}.json`, { signal: AbortSignal.timeout(3000) })
      .then((r) => {
        if (!r.ok) throw new Error(`cinemeta ${r.status}`);
        return r.json();
      })
      .then((j) => ({ name: j?.meta?.name ?? null, runtime: j?.meta?.runtime ?? null }))
      .catch(() => {
        titles.delete(key); // retry on the next request instead of caching the failure
        return NO_TITLE;
      });
    titles.set(key, hit);
  }
  return hit;
}

async function record(event: Event) {
  const list = recent.get(event.token) ?? [];
  list.push(event);
  if (list.length > RECENT_LIMIT) list.shift();
  if (!recent.has(event.token) && recent.size >= MAX_TOKENS) recent.delete(recent.keys().next().value!);
  recent.set(event.token, list);
  await appendFile(EVENTS_FILE, JSON.stringify(event) + "\n");
  console.log(`${event.ts} ${event.kind} ${event.title ?? event.id} ua=${event.ua}`);
}

function send(res: ServerResponse, status: number, body: unknown, type = "application/json") {
  res.writeHead(status, {
    "Content-Type": type,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Cache-Control": "no-store",
  });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

function baseUrl(req: IncomingMessage) {
  const proto = (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0] ?? "http";
  return `${proto}://${req.headers["x-forwarded-host"] ?? req.headers.host}`;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Stremio's Configure button opens /{token}/configure: show that token, never mint a new one there.
function configurePage(req: IncomingMessage, existing: string | null) {
  const token = existing ?? randomUUID();
  const url = esc(`${baseUrl(req)}/${token}/manifest.json`);
  const stremio = url.replace(/^https?:\/\//, "stremio://");
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Presence Logger</title>
<body style="font:16px system-ui;max-width:40rem;margin:2rem auto;padding:0 1rem">
<h1>Presence Logger</h1>
<p>Your private token: <code>${token}</code>. Keep it; it is the only key to your events.</p>
<p><a href="${stremio}">Install in Stremio</a></p>
<p>Or paste into Stremio's addon search: <code>${url}</code></p>
<p>Events: <a href="/${token}/events">/${token}/events</a></p>
</body>`;
}

const server = createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error("request failed", err);
    if (!res.headersSent) send(res, 400, { error: "bad request" });
  });
});

async function handle(req: IncomingMessage, res: ServerResponse) {
  if (req.method === "OPTIONS") return send(res, 204, "");
  if (req.method !== "GET") return send(res, 405, { error: "method not allowed" });

  const r = route(new URL(req.url ?? "/", "http://x").pathname);
  switch (r.kind) {
    case "configure":
      return send(res, 200, configurePage(req, r.token), "text/html; charset=utf-8");
    case "manifest":
      return send(res, 200, manifest(r.token));
    case "events":
      return send(res, 200, { events: recent.get(r.token) ?? [] });
    case "not_found":
      console.log(`${new Date().toISOString()} unmatched ${req.url} ua=${req.headers["user-agent"]}`);
      return send(res, 404, { error: "not found" });
    case "resource": {
      // Read the socket before answering: it can be gone once the response ends.
      const ua = req.headers["user-agent"] ?? null;
      const ip = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0].trim() ?? req.socket.remoteAddress ?? null;
      // Answer first: Stremio waits on this response before it continues.
      send(res, 200, r.resource === "stream" ? { streams: [] } : { subtitles: [] });
      const video = parseVideoId(r.id);
      const meta = await lookupTitle(r.type, video.base);
      await record({
        ts: new Date().toISOString(),
        token: r.token,
        // stream = title page opened (browsing); subtitles = player opened (playback start).
        kind: r.resource === "subtitles" ? "player_open" : "stream_lookup",
        type: r.type,
        id: r.id,
        ...video,
        title: meta.name,
        runtime: meta.runtime,
        extra: r.extra,
        ua,
        ip,
      }).catch((err) => console.error("record failed", err));
      return;
    }
  }
}

await mkdir(DATA_DIR, { recursive: true });
server.listen(PORT, () => console.log(`Presence Logger on http://127.0.0.1:${PORT}/configure`));
