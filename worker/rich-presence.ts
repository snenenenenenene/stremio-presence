// Keeps each user's own Discord profile in sync with their presence, through one presence_host process per user.
// Called by the poller after every pass. A host runs only while there is something to show.
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { and, eq } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "../src/db/schema.ts";
import { decrypt, encrypt } from "../src/lib/crypto.ts";
import { activityFor, hostLine, sameActivity, type Activity } from "../src/lib/rich-presence.ts";

type Db = NeonHttpDatabase<typeof schema>;
type Host = { proc: ChildProcessWithoutNullStreams; sent: Activity | null; tokenEnc: string };

const HOST_BIN = fileURLToPath(new URL("../daemon/presence_host", import.meta.url));
// Discord access tokens last 7 days; renew a day early so a slow pass never lets one lapse.
const REFRESH_BEFORE_MS = 24 * 60 * 60_000;
const hosts = new Map<string, Host>();
// Hosts told to stop but not exited yet; a user gets no new host until theirs is gone,
// so the old host's final clear cannot wipe the new one's activity.
const stopping = new Map<string, ChildProcessWithoutNullStreams>();
const STOP_GRACE_MS = 5_000;
// Users whose host was refused by Discord: try a token refresh before starting it again.
const needsRefresh = new Set<string>();

const log = (userId: string, msg: string) => console.log(`${new Date().toISOString()} rp ${userId.slice(0, 8)} ${msg}`);

function startHost(userId: string, accessToken: string, tokenEnc: string): Host {
  // Only the app id: the host never needs the database or encryption keys.
  const env = { NODE_ENV: "production" as const, DISCORD_APP_ID: process.env.DISCORD_CLIENT_ID! };
  const proc = spawn(HOST_BIN, [], { env, stdio: ["pipe", "pipe", "pipe"] });
  const host: Host = { proc, sent: null, tokenEnc };
  createInterface({ input: proc.stdout }).on("line", (l) => {
    // A failed update is resent on the next pass instead of being suppressed as unchanged.
    if (l.startsWith("fail")) host.sent = null;
    if (l !== "ok") log(userId, l);
  });
  createInterface({ input: proc.stderr }).on("line", (l) => log(userId, l.slice(0, 300)));
  const forget = () => {
    if (hosts.get(userId) === host) hosts.delete(userId);
    if (stopping.get(userId) === proc) stopping.delete(userId);
  };
  // A spawn failure (binary missing) emits only "error", never "exit".
  proc.on("error", (e) => { log(userId, `spawn failed: ${e.message}`); forget(); });
  proc.on("exit", (code) => {
    log(userId, `host exited ${code}`);
    if (code === 4) needsRefresh.add(userId);
    forget();
  });
  proc.stdin.on("error", () => {}); // host already gone; its exit handler cleans up
  proc.stdin.write(`token\t${accessToken}\n`);
  hosts.set(userId, host);
  return host;
}

// Closing stdin makes the host clear the activity, disconnect and exit.
function stopHost(userId: string) {
  const host = hosts.get(userId);
  if (!host) return;
  hosts.delete(userId);
  if (host.proc.exitCode !== null || host.proc.pid === undefined) return;
  stopping.set(userId, host.proc);
  host.proc.stdin.end();
  // A host stuck inside the SDK is killed rather than leaked.
  const kill = setTimeout(() => host.proc.kill("SIGKILL"), STOP_GRACE_MS);
  kill.unref();
  host.proc.once("exit", () => clearTimeout(kill));
}

type TokenRow = typeof schema.discordTokens.$inferSelect;

// Returns the row to use, or null when Discord no longer accepts the grant (the row is then deleted).
async function freshToken(db: Db, t: TokenRow, now: Date): Promise<TokenRow | null> {
  if (t.expiresAt.getTime() - now.getTime() > REFRESH_BEFORE_MS && !needsRefresh.has(t.userId)) return t;
  needsRefresh.delete(t.userId);
  const res = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID!,
      client_secret: process.env.DISCORD_CLIENT_SECRET!,
      grant_type: "refresh_token",
      refresh_token: decrypt(t.refreshEnc),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const err = ((await res.json().catch(() => ({}))) as { error?: string }).error;
    if (err !== "invalid_grant") throw new Error(`token refresh ${res.status} ${err ?? ""}`);
    // Revoked or expired grant: they sign in again on /connect to get presence back.
    // Only delete the row we tried; a sign-in that wrote a new one meanwhile is kept.
    await db
      .delete(schema.discordTokens)
      .where(and(eq(schema.discordTokens.userId, t.userId), eq(schema.discordTokens.refreshEnc, t.refreshEnc)));
    log(t.userId, "refresh refused (invalid_grant), token removed");
    return null;
  }
  const tok = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number; scope: string };
  const row = {
    accessEnc: encrypt(tok.access_token),
    refreshEnc: encrypt(tok.refresh_token),
    expiresAt: new Date(now.getTime() + tok.expires_in * 1000),
    scope: tok.scope,
    updatedAt: now,
  };
  // Discord rotates the refresh token: losing this write would lock the user out, so try twice.
  const save = () => db.update(schema.discordTokens).set(row).where(eq(schema.discordTokens.userId, t.userId));
  await save().catch(() => save());
  log(t.userId, "token refreshed");
  return { ...t, ...row };
}

export async function syncRichPresence(db: Db, now = new Date()) {
  const rows = await db
    .select({ t: schema.discordTokens, p: schema.presence })
    .from(schema.discordTokens)
    .leftJoin(schema.presence, eq(schema.presence.userId, schema.discordTokens.userId));

  const seen = new Set<string>();
  for (const { t, p } of rows) {
    seen.add(t.userId);
    try {
      const want = activityFor(p, now);
      let host = hosts.get(t.userId);
      if (!want) {
        if (host) stopHost(t.userId);
        continue;
      }
      const tok = await freshToken(db, t, now);
      if (!tok) {
        if (host) stopHost(t.userId);
        continue;
      }
      if (host && host.tokenEnc !== tok.accessEnc) {
        host.proc.stdin.write(`token\t${decrypt(tok.accessEnc)}\n`);
        host.tokenEnc = tok.accessEnc;
      }
      if (!host && stopping.has(t.userId)) continue; // wait for the old host to exit
      host ??= startHost(t.userId, decrypt(tok.accessEnc), tok.accessEnc);
      if (!sameActivity(host.sent, want)) {
        host.proc.stdin.write(hostLine(want) + "\n");
        host.sent = want;
        log(t.userId, `${want.details} | ${want.state}`);
      }
    } catch (e) {
      log(t.userId, `sync failed: ${e instanceof Error ? e.message : e}`);
    }
  }
  // Token removed (revoked or account deleted): clear them.
  for (const userId of [...hosts.keys()]) if (!seen.has(userId)) stopHost(userId);
}

// On shutdown, let every host clear its activity before the poller exits.
export async function stopAllHosts() {
  for (const userId of [...hosts.keys()]) stopHost(userId);
  await Promise.all(
    [...stopping.values()].map((proc) => new Promise((r) => { proc.once("exit", r); setTimeout(r, STOP_GRACE_MS + 500); })),
  );
}
