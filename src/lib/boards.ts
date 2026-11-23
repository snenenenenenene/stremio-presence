// Re-render every Now watching board in a guild. Used by the interactions route and the poller.
import { and, eq, gte, isNull, ne } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "../db/schema.ts";
import { parseVideoId } from "./addon.ts";
import { PRESENCE_MAX_AGE_MS } from "./presence.ts";
import { createMessage, deleteMessage, editMessage, renderBoard, type BoardRow } from "./discord.ts";

type Db = NeonHttpDatabase<typeof schema>;

export async function boardRows(db: Db, guildId: string): Promise<BoardRow[]> {
  const rows = await db
    .select({ name: schema.users.discordName, p: schema.presence })
    .from(schema.discordMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.discordMembers.userId))
    .innerJoin(schema.presence, eq(schema.presence.userId, schema.users.id))
    .where(and(
      eq(schema.discordMembers.guildId, guildId),
      ne(schema.presence.state, "off"),
      gte(schema.presence.updatedAt, new Date(Date.now() - PRESENCE_MAX_AGE_MS)),
    ));
  return rows.map(({ name, p }) => {
    const { season, episode } = parseVideoId(p.videoId ?? "");
    return {
      name,
      state: p.state as "playing" | "idle",
      title: p.title ?? "Unknown title",
      season,
      episode,
      positionMs: p.positionMs,
      durationMs: p.durationMs,
      device: p.device,
      poster: p.poster,
    };
  });
}

export async function refreshGuildBoards(db: Db, guildId: string, now = new Date()) {
  const boards = await db.select().from(schema.discordBoards).where(eq(schema.discordBoards.guildId, guildId));
  if (boards.length === 0) return;
  const payload = renderBoard(await boardRows(db, guildId), now);
  let failed = 0;
  for (const b of boards) {
    // One broken channel must not stop the other boards in this guild.
    try {
      const edited = b.messageId ? await editMessage(b.channelId, b.messageId, payload) : "gone";
      if (edited === "ok") continue;
      if (edited === "no_access") {
        await db.delete(schema.discordBoards).where(eq(schema.discordBoards.channelId, b.channelId));
        continue;
      }
      const id = await createMessage(b.channelId, payload);
      if (id === null) {
        // Channel deleted or bot removed: forget this board.
        await db.delete(schema.discordBoards).where(eq(schema.discordBoards.channelId, b.channelId));
        continue;
      }
      // Claim the slot only if nobody else posted meanwhile; otherwise remove our duplicate.
      const claimed = await db
        .update(schema.discordBoards)
        .set({ messageId: id })
        .where(and(eq(schema.discordBoards.channelId, b.channelId), b.messageId ? eq(schema.discordBoards.messageId, b.messageId) : isNull(schema.discordBoards.messageId)))
        .returning({ c: schema.discordBoards.channelId });
      if (claimed.length === 0) await deleteMessage(b.channelId, id);
    } catch (e) {
      failed++;
      console.error(`board ${b.channelId}:`, e instanceof Error ? e.message : e);
    }
  }
  if (failed > 0) throw new Error(`${failed} board(s) failed in guild ${guildId}`);
}

export async function guildsOfUser(db: Db, userId: string): Promise<string[]> {
  const rows = await db.select({ g: schema.discordMembers.guildId }).from(schema.discordMembers).where(eq(schema.discordMembers.userId, userId));
  return rows.map((r) => r.g);
}

