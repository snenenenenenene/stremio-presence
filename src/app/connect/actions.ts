"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { guildsOfUser, refreshGuildBoards } from "@/lib/boards";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { encrypt } from "@/lib/crypto";
import { clearSession, currentUser } from "@/lib/session";
import { login, StremioError } from "@/lib/stremio";

// The password goes straight to Stremio and is never stored or logged.
export async function linkStremio(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/connect");
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) redirect("/connect?error=missing");

  let authKey: string;
  try {
    authKey = await login(email, password);
  } catch (e) {
    redirect(`/connect?error=${e instanceof StremioError && e.code !== null ? "login" : "stremio"}`);
  }

  const authKeyEnc = encrypt(authKey);
  await db
    .insert(schema.stremioLinks)
    .values({ userId: user.id, authKeyEnc })
    .onConflictDoUpdate({ target: schema.stremioLinks.userId, set: { authKeyEnc, status: "ok", lastError: null } });
  redirect("/connect");
}

export async function unlinkStremio() {
  const user = await currentUser();
  if (!user) redirect("/connect");
  await db.delete(schema.stremioLinks).where(eq(schema.stremioLinks.userId, user.id));
  await db.delete(schema.presence).where(eq(schema.presence.userId, user.id));
  // Take them off every board they joined straight away.
  const userId = user.id;
  after(async () => {
    for (const g of await guildsOfUser(db, userId)) await refreshGuildBoards(db, g).catch(() => {});
  });
  redirect("/connect");
}

// Deletes the user and, by cascade, every row about them (Stremio key, Discord tokens, events, presence, memberships).
export async function deleteAccount() {
  const user = await currentUser();
  if (!user) redirect("/connect");
  const userId = user.id;
  const guilds = await guildsOfUser(db, userId);
  await db.delete(schema.users).where(eq(schema.users.id, userId));
  await clearSession();
  after(async () => {
    for (const g of guilds) await refreshGuildBoards(db, g).catch(() => {});
  });
  redirect("/connect?deleted=1");
}

export async function signOut() {
  await clearSession();
  redirect("/connect");
}
