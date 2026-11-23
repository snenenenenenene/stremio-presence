import { cookies } from "next/headers";
import { count, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { encrypt, randomToken } from "@/lib/crypto";
import { setSession } from "@/lib/session";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const jar = await cookies();
  const expected = jar.get("sp_oauth_state")?.value;
  jar.delete("sp_oauth_state");
  const code = url.searchParams.get("code");
  if (!code || !expected || url.searchParams.get("state") !== expected) {
    return Response.redirect(new URL("/connect?error=state", url), 302);
  }

  const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID!,
      client_secret: process.env.DISCORD_CLIENT_SECRET!,
      grant_type: "authorization_code",
      code,
      redirect_uri: new URL("/api/auth/discord/callback", url).toString(),
    }),
  });
  if (!tokenRes.ok) return Response.redirect(new URL("/connect?error=discord", url), 302);
  const tok = (await tokenRes.json()) as { access_token: string; refresh_token?: string; expires_in?: number; scope?: string };
  const { access_token } = tok;

  const meRes = await fetch("https://discord.com/api/users/@me", { headers: { authorization: `Bearer ${access_token}` } });
  if (!meRes.ok) return Response.redirect(new URL("/connect?error=discord", url), 302);
  const me = (await meRes.json()) as { id: string; username: string; global_name?: string | null };

  // Open sign-up with a cap: the poller checks users one by one each minute, so new accounts stop at MAX_USERS.
  // Existing users can always sign in again.
  const [existing] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.discordId, me.id)).limit(1);
  if (!existing) {
    const [{ n }] = await db.select({ n: count() }).from(schema.users);
    if (n >= Number(process.env.MAX_USERS ?? 100)) return Response.redirect(new URL("/connect?error=full", url), 302);
  }

  const name = me.global_name || me.username;
  const [user] = await db
    .insert(schema.users)
    .values({ discordId: me.id, discordName: name, addonToken: randomToken(24), slug: randomToken(8) })
    .onConflictDoUpdate({ target: schema.users.discordId, set: { discordName: name } })
    .returning({ id: schema.users.id });

  if (tok.refresh_token && tok.scope?.split(" ").includes("sdk.social_layer_presence")) {
    const row = {
      accessEnc: encrypt(tok.access_token),
      refreshEnc: encrypt(tok.refresh_token),
      expiresAt: new Date(Date.now() + (tok.expires_in ?? 604800) * 1000),
      scope: tok.scope,
      updatedAt: new Date(),
    };
    await db.insert(schema.discordTokens).values({ userId: user.id, ...row }).onConflictDoUpdate({ target: schema.discordTokens.userId, set: row });
  }

  await setSession(user.id);
  return Response.redirect(new URL("/connect", url), 302);
}
