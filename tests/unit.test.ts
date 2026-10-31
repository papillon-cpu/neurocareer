import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/modules/auth/password";
import { loginSchema, registerSchema } from "@/modules/auth/schemas";
import { rateLimit } from "@/modules/auth/rate-limit";
import { employeeCompleteness, employerCompleteness } from "@/modules/profile/completeness";

describe("пароли", () => {
  it("проверяет верный и неверный пароль, соль уникальна", async () => {
    const a = await hashPassword("correct horse battery");
    const b = await hashPassword("correct horse battery");
    expect(a).not.toBe(b);
    expect(await verifyPassword("correct horse battery", a)).toBe(true);
    expect(await verifyPassword("wrong password!!", a)).toBe(false);
  });
  it("не падает на повреждённом хэше", async () => {
    expect(await verifyPassword("x", "garbage")).toBe(false);
    expect(await verifyPassword("x", "scrypt$1$2$3$a")).toBe(false);
  });
});

describe("валидация", () => {
  const ok = {
    fullName: "Анна Смирнова",
    email: "  Anna@Example.COM ",
    password: "longenoughpass",
    role: "employee",
    acceptService: true,
    acceptMarketing: false,
  };
  it("нормализует email", () => {
    expect(registerSchema.parse(ok).email).toBe("anna@example.com");
  });
  it("отклоняет короткий пароль, чужую роль и отсутствие согласия", () => {
    expect(registerSchema.safeParse({ ...ok, password: "short" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...ok, role: "admin" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...ok, acceptService: false }).success).toBe(false);
  });
  it("логин требует email и пароль", () => {
    expect(loginSchema.safeParse({ email: "bad", password: "" }).success).toBe(false);
  });
});

describe("ограничение частоты", () => {
  it("блокирует после лимита и сбрасывает по окну", async () => {
    const t = 1_000_000;
    for (let i = 0; i < 3; i++) expect((await rateLimit("k", 3, 1000, t)).ok).toBe(true);
    expect((await rateLimit("k", 3, 1000, t)).ok).toBe(false);
    expect((await rateLimit("k", 3, 1000, t + 1001)).ok).toBe(true);
  });
});

describe("заполненность профиля", () => {
  it("считает только реально заполненные поля", () => {
    const empty = employeeCompleteness({ fullName: "Анна", headline: "", city: "", desiredRole: "", workFormat: null, about: "коротко" });
    expect(empty.percent).toBe(17);
    expect(empty.next?.key).toBe("headline");
    const full = employeeCompleteness({ fullName: "Анна", headline: "QA", city: "Казань", desiredRole: "QA lead", workFormat: "remote", about: "x".repeat(50) });
    expect(full.percent).toBe(100);
    expect(full.next).toBeNull();
  });
  it("работодатель без компании не получает баллы за компанию", () => {
    const c = employerCompleteness({ fullName: "Иван", position: "HR", company: null });
    expect(c.percent).toBe(29);
  });
});
