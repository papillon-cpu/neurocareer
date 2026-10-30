import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import { authenticate, EmailTakenError, registerUser } from "@/modules/auth/service";
import { findSessionUser, issueSession, revokeSession } from "@/modules/auth/session-store";

const base = { password: "longenoughpass", acceptService: true as const };

describe("регистрация и вход (реальная БД PGlite)", () => {
  beforeAll(async () => {
    await getDb();
  });

  it("создаёт пользователя, профиль и отдельные записи согласий", async () => {
    const u = await registerUser({ ...base, fullName: "Анна", email: "anna@example.com", role: "employee", acceptMarketing: true });
    const db = await getDb();
    const consents = await db.select().from(schema.consentRecords).where(eq(schema.consentRecords.userId, u.id));
    expect(consents.map((c) => c.purpose).sort()).toEqual(["marketing", "service_processing"]);
    expect(consents.every((c) => c.granted && c.textVersion)).toBe(true);
    const [profile] = await db.select().from(schema.employeeProfiles).where(eq(schema.employeeProfiles.userId, u.id));
    expect(profile.fullName).toBe("Анна");
  });

  it("без галочки маркетинга запись о нём не создаётся; работодатель получает свой профиль", async () => {
    const u = await registerUser({ ...base, fullName: "Иван", email: "ivan@example.com", role: "employer", acceptMarketing: false });
    const db = await getDb();
    const consents = await db.select().from(schema.consentRecords).where(eq(schema.consentRecords.userId, u.id));
    expect(consents.map((c) => c.purpose)).toEqual(["service_processing"]);
    const [p] = await db.select().from(schema.employerProfiles).where(eq(schema.employerProfiles.userId, u.id));
    expect(p.fullName).toBe("Иван");
  });

  it("не даёт зарегистрировать email повторно", async () => {
    await registerUser({ ...base, fullName: "A", email: "dup@example.com", role: "employee", acceptMarketing: false });
    await expect(
      registerUser({ ...base, fullName: "B", email: "dup@example.com", role: "employer", acceptMarketing: false }),
    ).rejects.toBeInstanceOf(EmailTakenError);
  });

  it("не хранит пароль открытым текстом", async () => {
    const db = await getDb();
    const [u] = await db.select().from(schema.users).where(eq(schema.users.email, "anna@example.com"));
    expect(u.passwordHash.startsWith("scrypt$")).toBe(true);
    expect(u.passwordHash).not.toContain(base.password);
  });

  it("authenticate: верный пароль, неверный пароль, неизвестный email", async () => {
    expect((await authenticate("anna@example.com", base.password))?.role).toBe("employee");
    expect(await authenticate("anna@example.com", "wrongpassword1")).toBeNull();
    expect(await authenticate("nobody@example.com", base.password)).toBeNull();
  });

  it("сессии: выдача, чтение, отзыв, истечение; в БД только хэш токена", async () => {
    const u = await authenticate("anna@example.com", base.password);
    const { token } = await issueSession(u!.id);
    expect((await findSessionUser(token))?.email).toBe("anna@example.com");

    const db = await getDb();
    const rows = await db.select().from(schema.sessions).where(eq(schema.sessions.userId, u!.id));
    expect(rows.some((r) => r.tokenHash === token)).toBe(false);

    await db.update(schema.sessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.sessions.userId, u!.id));
    expect(await findSessionUser(token)).toBeNull();

    const fresh = await issueSession(u!.id);
    await revokeSession(fresh.token);
    expect(await findSessionUser(fresh.token)).toBeNull();
    expect(await findSessionUser("не-токен")).toBeNull();
  });
});
