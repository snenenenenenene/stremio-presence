import { after } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { manifest, parseVideoId, route } from "@/lib/addon";
import { deviceFromUa } from "@/lib/device";

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Cache-Control": "no-store",
};

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: HEADERS });

export function OPTIONS() {
  return new Response(null, { status: 204, headers: HEADERS });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const r = route(url.pathname);
  switch (r.kind) {
    case "configure":
      return Response.redirect(new URL("/connect", url), 302);
    case "manifest":
      return json(manifest(r.token));
    case "events":
    case "not_found":
      return json({ error: "not found" }, 404);
    case "resource": {
      const ua = req.headers.get("user-agent");
      // Answer at once; Stremio waits on this. Log after the response is sent.
      after(async () => {
        const [user] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.addonToken, r.token)).limit(1);
        if (!user) return; // unknown token: answer normally, store nothing
        await db.insert(schema.addonEvents).values({
          userId: user.id,
          kind: r.resource === "subtitles" ? "player_open" : "stream_lookup",
          type: r.type,
          videoId: r.id,
          base: parseVideoId(r.id).base,
          device: deviceFromUa(ua),
          ua,
          extra: r.extra,
        });
      });
      return json(r.resource === "stream" ? { streams: [] } : { subtitles: [] });
    }
  }
}
