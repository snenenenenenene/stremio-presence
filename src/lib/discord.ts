// Discord: interaction signature check, slash command definition, board rendering, REST calls.
import { createPublicKey, verify } from "node:crypto";
import { clock } from "./format.ts";
import { APP_NAME } from "./brand.ts";

export { clock };

const API = "https://discord.com/api/v10";
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

const MAX_SKEW_S = 5 * 60;

export function verifyInteraction(body: string, signature: string | null, timestamp: string | null, publicKeyHex: string, nowS = Date.now() / 1000): boolean {
  if (!signature || !timestamp || !/^[0-9a-f]{128}$/i.test(signature) || !/^\d+$/.test(timestamp)) return false;
  // Reject replays of old signed bodies.
  if (Math.abs(nowS - Number(timestamp)) > MAX_SKEW_S) return false;
  const key = createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(publicKeyHex, "hex")]), format: "der", type: "spki" });
  return verify(null, Buffer.from(timestamp + body), key, Buffer.from(signature, "hex"));
}

export const COMMANDS = [
  {
    name: "nowwatching",
    description: `${APP_NAME} board`,
    contexts: [0], // guilds only
    options: [
      { type: 1, name: "here", description: "Post the Now watching board in this channel (needs Manage Server)" },
      { type: 1, name: "join", description: "Show what you watch on this server's board" },
      { type: 1, name: "leave", description: "Stop showing you on this server's board" },
    ],
  },
];

export const MANAGE_GUILD = 1n << 5n;
export const BOT_PERMISSIONS = String((1n << 10n) | (1n << 11n) | (1n << 14n)); // View Channel, Send Messages, Embed Links

export type BoardRow = {
  name: string;
  state: "playing" | "idle";
  title: string;
  season: number | null;
  episode: number | null;
  positionMs: number | null;
  durationMs: number | null;
  device: string | null;
  poster: string | null;
};

export function bar(positionMs: number, durationMs: number, width = 12): string {
  const filled = Math.max(0, Math.min(width, Math.round((positionMs / durationMs) * width)));
  return "▰".repeat(filled) + "▱".repeat(width - filled);
}

// Discord markdown is interpreted in names and titles; escape it so a title like "*batteries*" stays literal.
// Newlines are flattened so a title cannot add lines (headings, -# notes) to the board.
const md = (s: string) => s.replace(/\s+/g, " ").replace(/([\\*_~`|<>#\[\]()-])/g, "\\$1");

export function renderBoard(rows: BoardRow[], now: Date) {
  const sorted = [...rows].sort((a, b) => (a.state === b.state ? a.name.localeCompare(b.name) : a.state === "playing" ? -1 : 1));
  const lines = sorted.map((r) => {
    const ep = r.season != null && r.episode != null ? ` · S${r.season}E${r.episode}` : "";
    const head = `${r.state === "playing" ? "▶" : "⏸"} **${md(r.name)}** · ${md(r.title)}${ep}`;
    const progress =
      r.positionMs != null && r.durationMs ? `${bar(r.positionMs, r.durationMs)} ${clock(r.positionMs)} / ${clock(r.durationMs)}` : "";
    const tail = [progress, r.device ? md(r.device) : "", r.state === "idle" ? "*idle*" : ""].filter(Boolean).join(" · ");
    return tail ? `${head}\n${tail}` : head;
  });
  const poster = sorted.find((r) => r.state === "playing" && r.poster)?.poster;
  return {
    embeds: [
      {
        title: "Now watching",
        description: (lines.length ? lines.join("\n\n") : "Nobody is watching right now.") + `\n\n-# Updated <t:${Math.floor(now.getTime() / 1000)}:R> · /nowwatching join`,
        color: 0x7b5bf5,
        ...(poster ? { thumbnail: { url: poster } } : {}),
      },
    ],
    allowed_mentions: { parse: [] },
  };
}

async function rest(method: string, path: string, body?: unknown) {
  const res = await fetch(API + path, {
    method,
    headers: { authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  return res;
}

// null = channel gone or no access (403/404): the board should be forgotten.
export async function createMessage(channelId: string, payload: unknown): Promise<string | null> {
  const res = await rest("POST", `/channels/${channelId}/messages`, payload);
  if (res.status === 403 || res.status === 404) return null;
  if (!res.ok) throw new Error(`discord create message: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { id: string }).id;
}

// "gone" = message deleted (post a new one); "no_access" = bot lost the channel.
export async function editMessage(channelId: string, messageId: string, payload: unknown): Promise<"ok" | "gone" | "no_access"> {
  const res = await rest("PATCH", `/channels/${channelId}/messages/${messageId}`, payload);
  if (res.status === 404) return "gone";
  if (res.status === 403) return "no_access";
  if (!res.ok) throw new Error(`discord edit message: ${res.status} ${await res.text()}`);
  return "ok";
}

export async function deleteMessage(channelId: string, messageId: string): Promise<void> {
  await rest("DELETE", `/channels/${channelId}/messages/${messageId}`);
}

export async function registerCommands(appId: string) {
  const res = await rest("PUT", `/applications/${appId}/commands`, COMMANDS);
  if (!res.ok) throw new Error(`discord register commands: ${res.status} ${await res.text()}`);
  return res.json();
}
