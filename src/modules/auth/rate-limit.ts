import { lt, sql } from "drizzle-orm";
import { getDb } from "@/server/db";
import { rateLimits } from "@/server/db/schema";

// Счётчики лежат в БД, поэтому ограничение работает одинаково на нескольких инстансах.
// Одна атомарная команда: новое окно начинается, когда старое истекло.
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): Promise<{ ok: boolean; retryAfterMs: number }> {
  const db = await getDb();
  const nowAt = new Date(now);
  const nextReset = new Date(now + windowMs);
  const [row] = await db
    .insert(rateLimits)
    .values({ key, count: 1, resetAt: nextReset })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`CASE WHEN ${rateLimits.resetAt} <= ${nowAt} THEN 1 ELSE ${rateLimits.count} + 1 END`,
        resetAt: sql`CASE WHEN ${rateLimits.resetAt} <= ${nowAt} THEN ${nextReset} ELSE ${rateLimits.resetAt} END`,
      },
    })
    .returning({ count: rateLimits.count, resetAt: rateLimits.resetAt });

  // Редкая уборка истёкших записей, чтобы таблица не росла.
  if (Math.random() < 0.01) await db.delete(rateLimits).where(lt(rateLimits.resetAt, nowAt));

  return row.count <= limit ? { ok: true, retryAfterMs: 0 } : { ok: false, retryAfterMs: row.resetAt.getTime() - now };
}

export async function resetRateLimits(): Promise<void> {
  const db = await getDb();
  await db.delete(rateLimits);
}
