import { after } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { refreshGuildBoards } from "@/lib/boards";
import { MANAGE_GUILD, verifyInteraction } from "@/lib/discord";

type Interaction = {
  type: number;
  guild_id?: string;
  channel_id?: string;
  member?: { user: { id: string }; permissions: string };
  data?: { name: string; options?: { name: string }[] };
};

const reply = (content: string) => Response.json({ type: 4, data: { content, flags: 64 } }); // ephemeral

export async function POST(req: Request) {
  const body = await req.text();
  const ok = verifyInteraction(
    body,
    req.headers.get("x-signature-ed25519"),
    req.headers.get("x-signature-timestamp"),
    process.env.DISCORD_PUBLIC_KEY!,
  );
  if (!ok) return new Response("bad signature", { status: 401 });

  const i = JSON.parse(body) as Interaction;
  if (i.type === 1) return Response.json({ type: 1 }); // PING
  if (i.type !== 2 || i.data?.name !== "nowwatching" || !i.guild_id || !i.member) return reply("Unknown command.");

  const guildId = i.guild_id;
  const sub = i.data.options?.[0]?.name;
  const connectUrl = new URL("/connect", req.url).toString();

  if (sub === "here") {
    if ((BigInt(i.member.permissions) & MANAGE_GUILD) === 0n) return reply("You need Manage Server to place the board.");
    await db
      .insert(schema.discordBoards)
      .values({ channelId: i.channel_id!, guildId })
      .onConflictDoUpdate({ target: schema.discordBoards.channelId, set: { guildId } });
    after(() => refreshGuildBoards(db, guildId));
    return reply("Board placed in this channel. Members show up after `/nowwatching join`.");
  }

  const [user] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.discordId, i.member.user.id)).limit(1);
  if (!user) return reply(`Link your Stremio first: ${connectUrl}`);

  if (sub === "join") {
    await db.insert(schema.discordMembers).values({ userId: user.id, guildId }).onConflictDoNothing();
    after(() => refreshGuildBoards(db, guildId));
    return reply("You are on this server's board.");
  }
  if (sub === "leave") {
    await db.delete(schema.discordMembers).where(and(eq(schema.discordMembers.userId, user.id), eq(schema.discordMembers.guildId, guildId)));
    after(() => refreshGuildBoards(db, guildId));
    return reply("You are off this server's board.");
  }
  return reply("Unknown command.");
}
