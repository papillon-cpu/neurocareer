import { eq } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import { CONSENT_TEXT_VERSION } from "@/modules/consent/texts";
import { dummyHash, hashPassword, verifyPassword } from "./password";
import type { RegisterInput } from "./schemas";
import type { Role } from "@/server/db/schema";

export class EmailTakenError extends Error {}

function isUniqueViolation(e: unknown): boolean {
  let cur: unknown = e;
  for (let i = 0; i < 3 && cur; i++) {
    if ((cur as { code?: string }).code === "23505") return true;
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}

/** Создаёт пользователя, профиль и записи согласий в одной транзакции. */
export async function registerUser(input: RegisterInput): Promise<{ id: string; role: Role }> {
  const db = await getDb();
  const passwordHash = await hashPassword(input.password);
  try {
    return await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(schema.users)
        .values({ email: input.email, passwordHash, role: input.role })
        .returning({ id: schema.users.id, role: schema.users.role });

      if (input.role === "employee") {
        await tx.insert(schema.employeeProfiles).values({ userId: user.id, fullName: input.fullName });
      } else {
        await tx.insert(schema.employerProfiles).values({ userId: user.id, fullName: input.fullName });
      }

      await tx.insert(schema.consentRecords).values([
        { userId: user.id, purpose: "service_processing", textVersion: CONSENT_TEXT_VERSION, granted: true },
        ...(input.acceptMarketing
          ? [{ userId: user.id, purpose: "marketing" as const, textVersion: CONSENT_TEXT_VERSION, granted: true }]
          : []),
      ]);

      await tx
        .insert(schema.auditEvents)
        .values({ actorUserId: user.id, type: "user.registered", meta: { role: input.role } });

      return user;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new EmailTakenError();
    throw e;
  }
}

/** Возвращает пользователя при верном пароле, иначе null. Время ответа не зависит от наличия email. */
export async function authenticate(
  email: string,
  password: string,
): Promise<{ id: string; role: Role } | null> {
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  const ok = await verifyPassword(password, user?.passwordHash ?? (await dummyHash()));
  return user && ok ? { id: user.id, role: user.role } : null;
}
