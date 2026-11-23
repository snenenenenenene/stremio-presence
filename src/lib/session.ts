import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { sign, verify } from "@/lib/crypto";

const COOKIE = "sp_session";
const TTL = 30 * 24 * 60 * 60;

export async function setSession(userId: string) {
  (await cookies()).set(COOKIE, sign({ uid: userId }, TTL), {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: TTL,
  });
}

export async function clearSession() {
  (await cookies()).delete(COOKIE);
}

export async function currentUser() {
  const s = verify<{ uid: string }>((await cookies()).get(COOKIE)?.value);
  if (!s) return null;
  // Deleting the user ends their access at once, not when the cookie expires.
  const [row] = await db
    .select({ user: schema.users })
    .from(schema.users)
    .where(eq(schema.users.id, s.uid))
    .limit(1);
  return row?.user ?? null;
}
