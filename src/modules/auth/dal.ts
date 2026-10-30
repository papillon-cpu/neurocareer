import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Role } from "@/server/db/schema";
import { findSessionUser, issueSession, revokeSession, type SessionUser } from "./session-store";

export const SESSION_COOKIE = "nc_session";

export function homeFor(role: Role): string {
  return role === "admin" ? "/admin" : role === "employer" ? "/company" : "/me";
}

export async function startSession(userId: string): Promise<void> {
  const { token, expiresAt } = await issueSession(userId);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await revokeSession(token);
  store.delete(SESSION_COOKIE);
}

export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? findSessionUser(token) : null;
});

/**
 * Проверка прав на сервере. Вызывается в каждой странице и каждом серверном действии:
 * layout не перерисовывается при навигации, поэтому защищать только его недостаточно.
 */
export async function requireRole(role: Role): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== role) redirect(homeFor(user.role));
  return user;
}

export async function redirectIfSignedIn(): Promise<void> {
  const user = await getCurrentUser();
  if (user) redirect(homeFor(user.role));
}
