import { cookies } from "next/headers";
import { randomToken } from "@/lib/crypto";

export async function GET(req: Request) {
  const state = randomToken(16);
  (await cookies()).set("sp_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600 });
  const url = new URL("https://discord.com/oauth2/authorize");
  url.search = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID!,
    response_type: "code",
    // openid + sdk.social_layer_presence: lets the Social SDK set Rich Presence for the user without their Discord app.
    scope: "identify openid sdk.social_layer_presence",
    redirect_uri: new URL("/api/auth/discord/callback", req.url).toString(),
    state,
  }).toString();
  return Response.redirect(url, 302);
}
