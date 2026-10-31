import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import { appUrl, sendMail } from "@/modules/mail";
import { hashPassword } from "./password";

export const RESET_TTL_MS = 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Создаёт ссылку восстановления и отправляет письмо. Ничего не сообщает о том, есть ли такой email:
 * ответ одинаков всегда, чтобы нельзя было перебирать зарегистрированные адреса.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (!user || user.blockedAt) return;

  const token = randomBytes(32).toString("base64url");
  await db.transaction(async (tx) => {
    // Прежние неиспользованные ссылки перестают работать.
    await tx
      .update(schema.passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(schema.passwordResetTokens.userId, user.id), isNull(schema.passwordResetTokens.usedAt)));
    await tx.insert(schema.passwordResetTokens).values({
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
    });
  });

  await sendMail({
    to: user.email,
    subject: "Восстановление пароля",
    text:
      `Вы запросили восстановление пароля.\n\nСсылка действует 1 час и работает один раз:\n` +
      `${appUrl()}/reset-password?token=${token}\n\nЕсли это были не вы, просто проигнорируйте письмо.`,
  });
}

export async function isResetTokenValid(token: string): Promise<boolean> {
  const db = await getDb();
  const [row] = await db
    .select({ id: schema.passwordResetTokens.id })
    .from(schema.passwordResetTokens)
    .where(
      and(
        eq(schema.passwordResetTokens.tokenHash, hashToken(token)),
        isNull(schema.passwordResetTokens.usedAt),
        gt(schema.passwordResetTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/** Меняет пароль по одноразовому токену и завершает все существующие сессии пользователя. */
export async function resetPassword(token: string, newPassword: string): Promise<boolean> {
  const db = await getDb();
  const passwordHash = await hashPassword(newPassword);
  return db.transaction(async (tx) => {
    // Атомарно «забираем» токен: второй параллельный запрос не найдёт неиспользованную строку.
    const [row] = await tx
      .update(schema.passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(schema.passwordResetTokens.tokenHash, hashToken(token)),
          isNull(schema.passwordResetTokens.usedAt),
          gt(schema.passwordResetTokens.expiresAt, new Date()),
        ),
      )
      .returning({ userId: schema.passwordResetTokens.userId });
    if (!row) return false;

    await tx.update(schema.users).set({ passwordHash }).where(eq(schema.users.id, row.userId));
    await tx.delete(schema.sessions).where(eq(schema.sessions.userId, row.userId));
    await tx.insert(schema.auditEvents).values({ actorUserId: row.userId, type: "user.password_reset", meta: {} });
    return true;
  });
}
