// Polls each linked user's Stremio library and writes their presence. Runs under launchd (KeepAlive).
// node worker/poll.ts            -> loop forever, one pass per POLL_INTERVAL_MS
// node worker/poll.ts --once     -> one pass, then exit (for checks)
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { and, eq, gte, lt } from "drizzle-orm";
import * as schema from "../src/db/schema.ts";
import { decrypt } from "../src/lib/crypto.ts";
import { computePresence, IDLE_WINDOW_MS, DEVICE_LOOKBACK_MS, presenceChanged, type Presence } from "../src/lib/presence.ts";
import { guildsOfUser, refreshGuildBoards } from "../src/lib/boards.ts";
import { changedItemIds, getItems, StremioError } from "../src/lib/stremio.ts";
import { stopAllHosts, syncRichPresence } from "./rich-presence.ts";
import { keepBotOnline } from "./gateway.ts";

const INTERVAL = Number(process.env.POLL_INTERVAL_MS ?? 60_000);
const db = drizzle(neon(process.env.DATABASE_URL!), { schema });
// While someone is playing, refresh their boards at least this often so the progress bar moves.
const BOARD_REFRESH_MS = 5 * 60_000;
const lastBoardRefresh = new Map<string, number>();
// Users whose last board refresh failed; retried on the next pass even if nothing changed.
const boardsDirty = new Set<string>();

async function refreshBoardsFor(userId: string, now: Date) {
  lastBoardRefresh.set(userId, now.getTime());
  let ok = true;
  for (const guildId of await guildsOfUser(db, userId)) {
    // A Discord failure must not mark the Stremio link as failing.
    await refreshGuildBoards(db, guildId, now).catch((e) => {
      ok = false;
      console.error(`board ${guildId}:`, e instanceof Error ? e.message : e);
    });
  }
  if (ok) boardsDirty.delete(userId);
  else boardsDirty.add(userId);
}

async function pollUser(userId: string, authKeyEnc: string): Promise<Presence["state"]> {
  const now = new Date();
  const authKey = decrypt(authKeyEnc);
  // Only items saved in the idle window can matter; datastoreMeta is cheap, datastoreGet is not.
  const ids = await changedItemIds(authKey, now.getTime() - IDLE_WINDOW_MS);
  const items = await getItems(authKey, ids);
  const events = await db
    .select({ base: schema.addonEvents.base, device: schema.addonEvents.device, ts: schema.addonEvents.ts })
    .from(schema.addonEvents)
    .where(and(eq(schema.addonEvents.userId, userId), gte(schema.addonEvents.ts, new Date(now.getTime() - DEVICE_LOOKBACK_MS))));
  const [prev] = await db.select().from(schema.presence).where(eq(schema.presence.userId, userId)).limit(1);
  const p = computePresence(items, events, now);
  const row = { ...p, updatedAt: now };
  delete (row as Partial<Presence>).season;
  delete (row as Partial<Presence>).episode;
  await db.insert(schema.presence).values({ userId, ...row }).onConflictDoUpdate({ target: schema.presence.userId, set: row });

  const prevP = prev ? ({ state: prev.state, videoId: prev.videoId, device: prev.device } as Presence) : null;
  const stale = p.state === "playing" && now.getTime() - (lastBoardRefresh.get(userId) ?? 0) >= BOARD_REFRESH_MS;
  if (presenceChanged(prevP, p) || stale || boardsDirty.has(userId)) await refreshBoardsFor(userId, now);
  return p.state;
}

async function pass() {
  const links = await db.select().from(schema.stremioLinks).where(eq(schema.stremioLinks.status, "ok"));
  for (const link of links) {
    try {
      const state = await pollUser(link.userId, link.authKeyEnc);
      await db.update(schema.stremioLinks).set({ lastPolledAt: new Date(), lastError: null }).where(eq(schema.stremioLinks.userId, link.userId));
      console.log(`${new Date().toISOString()} ${link.userId} ${state}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const broken = e instanceof StremioError && e.isAuth;
      await db
        .update(schema.stremioLinks)
        .set({ lastError: msg.slice(0, 500), ...(broken ? { status: "broken" as const } : {}) })
        .where(eq(schema.stremioLinks.userId, link.userId));
      console.error(`${new Date().toISOString()} ${link.userId} ${broken ? "BROKEN" : "error"}: ${msg}`);
      if (broken) {
        // A dead key means we no longer know what they watch: clear it everywhere.
        const now = new Date();
        await db.update(schema.presence).set({ state: "off", updatedAt: now }).where(eq(schema.presence.userId, link.userId));
        await refreshBoardsFor(link.userId, now);
      }
    }
  }
}

// Addon events (title, device, user agent) are kept 30 days, as the privacy page says.
const EVENT_RETENTION_MS = 30 * 24 * 60 * 60_000;
let lastPrune = 0;
async function pruneEvents(now: number) {
  if (now - lastPrune < 60 * 60_000) return;
  lastPrune = now;
  await db.delete(schema.addonEvents).where(lt(schema.addonEvents.ts, new Date(now - EVENT_RETENTION_MS)));
}

// Heartbeat to HQ (HC_BASE/HC_SECRET from ~/.config/hc/env, see brain-raw scripts/hc-run.sh). No-op when unset.
// Every 15 min with a 30 min gap: a stuck or crashed poller alerts, without waking HQ's database every minute.
const HEARTBEAT_MS = 15 * 60_000;
let lastBeat = 0;
async function heartbeat(ok: boolean, now: number) {
  const { HC_BASE, HC_SECRET } = process.env;
  if (!HC_BASE || !HC_SECRET || (ok && now - lastBeat < HEARTBEAT_MS)) return;
  lastBeat = now;
  const url = `${HC_BASE}?name=stremio-presence-poller&gap=1800&status=${ok ? "ok" : "fail"}`;
  await fetch(url, { method: "POST", headers: { authorization: `Bearer ${HC_SECRET}` }, signal: AbortSignal.timeout(10_000) });
}

// Each pass also updates users' own Discord profiles, if they granted presence at sign-in.
async function passAndSync() {
  const ok = await pass().then(() => true, (e) => (console.error("pass failed", e), false));
  await heartbeat(ok, Date.now()).catch((e) => console.error("heartbeat failed", e instanceof Error ? e.message : e));
  await pruneEvents(Date.now()).catch((e) => console.error("prune failed", e));
  await syncRichPresence(db).catch((e) => console.error("rich presence failed", e));
}

for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.once(sig, () => void stopAllHosts().finally(() => process.exit(0)));
}

if (process.argv.includes("--once")) {
  await pass();
} else {
  if (process.env.DISCORD_BOT_TOKEN) keepBotOnline(process.env.DISCORD_BOT_TOKEN);
  for (;;) {
    const started = Date.now();
    await passAndSync();
    await new Promise((r) => setTimeout(r, Math.max(1_000, INTERVAL - (Date.now() - started))));
  }
}
