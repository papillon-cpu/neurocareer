import { desc, eq, ilike } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/server/db";

export type BlockResult = { ok: true; blocked: boolean } | { ok: false; error: "not_found" | "forbidden" };

/** Список пользователей для админки: последние регистрации, с поиском по части email. */
export async function listUsers(query = "") {
  const db = await getDb();
  const q = query.trim().slice(0, 100).replace(/[%_\\]/g, "");
  const base = db
    .select({ id: schema.users.id, email: schema.users.email, role: schema.users.role, createdAt: schema.users.createdAt, blockedAt: schema.users.blockedAt, deletedAt: schema.users.deletedAt })
    .from(schema.users);
  return (q ? base.where(ilike(schema.users.email, `%${q}%`)) : base).orderBy(desc(schema.users.createdAt)).limit(50);
}

/**
 * Блокировка и разблокировка. Заблокированный не может войти, его сессии закрываются сразу, профиль пропадает из подбора.
 * Данные не удаляются. Блокировать администраторов и удалённые аккаунты нельзя.
 */
export async function setUserBlocked(adminId: string, userId: string, blocked: boolean): Promise<BlockResult> {
  if (!z.uuid().safeParse(userId).success) return { ok: false, error: "not_found" };
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!user) return { ok: false, error: "not_found" };
  if (user.role === "admin" || user.deletedAt || user.id === adminId) return { ok: false, error: "forbidden" };
  await db.transaction(async (tx) => {
    await tx.update(schema.users).set({ blockedAt: blocked ? new Date() : null }).where(eq(schema.users.id, userId));
    if (blocked) await tx.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
    await tx.insert(schema.auditEvents).values({ actorUserId: adminId, type: blocked ? "user.blocked" : "user.unblocked", meta: { userId, role: user.role } });
  });
  return { ok: true, blocked };
}
