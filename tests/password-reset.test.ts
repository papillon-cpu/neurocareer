import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { registerUser, authenticate } from "@/modules/auth/service";
import { issueSession, findSessionUser } from "@/modules/auth/session-store";
import { isResetTokenValid, requestPasswordReset, resetPassword } from "@/modules/auth/password-reset";
import { mailer, type Mail } from "@/modules/mail";
import { getDb, schema } from "@/server/db";

const OLD = "old-password-123";
const NEW = "new-password-456";
let sent: Mail[] = [];

function tokenFrom(mail: Mail): string {
  return mail.text.match(/token=([\w-]+)/)![1];
}

async function newUser(email: string) {
  return registerUser({ fullName: "Тест", email, password: OLD, role: "employee", acceptService: true, acceptMarketing: false });
}

beforeAll(async () => {
  await getDb();
});

afterEach(() => {
  sent = [];
  mailer.transport = null;
});

function capture() {
  mailer.transport = async (m) => {
    sent.push(m);
    return { sent: true };
  };
}

describe("восстановление пароля", () => {
  it("письмо со ссылкой, смена пароля, старый пароль и сессии перестают работать", async () => {
    capture();
    const user = await newUser("reset1@example.com");
    const session = await issueSession(user.id);

    await requestPasswordReset("reset1@example.com");
    expect(sent).toHaveLength(1);
    const token = tokenFrom(sent[0]);
    expect(await isResetTokenValid(token)).toBe(true);

    expect(await resetPassword(token, NEW)).toBe(true);
    expect(await authenticate("reset1@example.com", OLD)).toBeNull();
    expect(await authenticate("reset1@example.com", NEW)).not.toBeNull();
    expect(await findSessionUser(session.token)).toBeNull();
  });

  it("ссылка одноразовая, а новая ссылка отменяет прежнюю", async () => {
    capture();
    await newUser("reset2@example.com");
    await requestPasswordReset("reset2@example.com");
    await requestPasswordReset("reset2@example.com");
    const [first, second] = sent.map(tokenFrom);

    expect(await resetPassword(first, NEW)).toBe(false);
    expect(await resetPassword(second, NEW)).toBe(true);
    expect(await resetPassword(second, "another-password-789")).toBe(false);
    expect(await authenticate("reset2@example.com", NEW)).not.toBeNull();
  });

  it("истёкшая ссылка не работает", async () => {
    capture();
    await newUser("reset3@example.com");
    await requestPasswordReset("reset3@example.com");
    const token = tokenFrom(sent[0]);
    const db = await getDb();
    await db.update(schema.passwordResetTokens).set({ expiresAt: new Date(Date.now() - 1000) });
    expect(await isResetTokenValid(token)).toBe(false);
    expect(await resetPassword(token, NEW)).toBe(false);
  });

  it("неизвестный и заблокированный email: письма нет, ошибки нет", async () => {
    capture();
    await expect(requestPasswordReset("nobody@example.com")).resolves.toBeUndefined();
    const user = await newUser("reset4@example.com");
    const db = await getDb();
    await db.update(schema.users).set({ blockedAt: new Date() }).where(eq(schema.users.id, user.id));
    await requestPasswordReset("reset4@example.com");
    expect(sent).toHaveLength(0);
  });

  it("в БД лежит хеш токена, а не сам токен", async () => {
    capture();
    await newUser("reset5@example.com");
    await requestPasswordReset("reset5@example.com");
    const token = tokenFrom(sent[0]);
    const db = await getDb();
    const rows = await db.select().from(schema.passwordResetTokens);
    expect(rows.some((r) => r.tokenHash === token)).toBe(false);
  });
});
