import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { nowIso } from "@/lib/format";
import { verifyPassword } from "@/lib/password";
import { deleteExpiredSessions, deleteSession, getUserBySession, getUserByUsername, insertSession } from "@/lib/queries";
import type { PublicUser } from "@/lib/types";

const COOKIE = "approval_sid";
const WEEK_SECONDS = 60 * 60 * 24 * 7;

export const getOptionalUser = cache(async (): Promise<PublicUser | null> => {
  deleteExpiredSessions(nowIso());
  const jar = await cookies();
  const sid = jar.get(COOKIE)?.value;
  if (!sid) return null;
  const user = getUserBySession(sid);
  if (!user) return null;
  if (user.expiresAt <= nowIso()) {
    deleteSession(sid);
    return null;
  }
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
  };
});

export const getCurrentUser = cache(async () => {
  const user = await getOptionalUser();
  if (!user) redirect("/login");
  return user;
});

export async function requireAdmin() {
  const user = await getCurrentUser();
  if (user.role !== "admin") redirect("/");
  return user;
}

export async function createSession(userId: number) {
  const id = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + WEEK_SECONDS * 1000).toISOString();
  insertSession(id, userId, expires);
  const jar = await cookies();
  jar.set(COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: WEEK_SECONDS,
  });
}

export async function clearSession() {
  const jar = await cookies();
  const sid = jar.get(COOKIE)?.value;
  if (sid) deleteSession(sid);
  jar.set(COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
}

export async function authenticate(username: string, password: string) {
  const user = getUserByUsername(username.trim().toLowerCase());
  if (!user || !verifyPassword(password, user.passwordHash)) return null;
  await createSession(user.id);
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
  } satisfies PublicUser;
}
