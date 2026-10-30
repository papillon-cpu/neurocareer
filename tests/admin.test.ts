import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { listUsers, setUserBlocked } from "@/modules/admin/users";
import { authenticate, registerUser } from "@/modules/auth/service";
import { findSessionUser, issueSession } from "@/modules/auth/session-store";
import { isSafeReturn, returnPathFor } from "@/modules/billing/return";
import { emptyContent } from "@/modules/resume/content";
import * as resumes from "@/modules/resume/service";
import * as visibility from "@/modules/visibility/service";
import { getDb, schema } from "@/server/db";

const PASSWORD = "longenoughpass";
let n = 0;
async function user(role: "employee" | "employer") {
  const email = `adm-${++n}@example.com`;
  const u = await registerUser({ fullName: "Тест", email, password: PASSWORD, role, acceptService: true, acceptMarketing: false });
  return { id: u.id, email };
}
async function admin() {
  const db = await getDb();
  const [a] = await db.insert(schema.users).values({ email: `root-${++n}@example.com`, passwordHash: "x", role: "admin" }).returning({ id: schema.users.id });
  return a.id;
}

beforeAll(async () => {
  await getDb();
});

describe("блокировка пользователей", () => {
  it("заблокированный не входит, его сессии закрываются, после разблокировки всё возвращается", async () => {
    const a = await admin();
    const u = await user("employee");
    const { token } = await issueSession(u.id);
    expect(await findSessionUser(token)).toMatchObject({ id: u.id });
    expect(await authenticate(u.email, PASSWORD)).not.toBeNull();

    expect(await setUserBlocked(a, u.id, true)).toEqual({ ok: true, blocked: true });
    expect(await findSessionUser(token)).toBeNull();
    expect(await authenticate(u.email, PASSWORD)).toBeNull();
    expect((await listUsers(u.email)).find((x) => x.id === u.id)?.blockedAt).toBeTruthy();

    expect(await setUserBlocked(a, u.id, false)).toEqual({ ok: true, blocked: false });
    expect(await authenticate(u.email, PASSWORD)).not.toBeNull();

    const types = (await (await getDb()).select().from(schema.auditEvents)).map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(["user.blocked", "user.unblocked"]));
  });

  it("нельзя блокировать администраторов, себя и несуществующих", async () => {
    const a = await admin();
    const b = await admin();
    expect(await setUserBlocked(a, b, true)).toEqual({ ok: false, error: "forbidden" });
    expect(await setUserBlocked(a, a, true)).toEqual({ ok: false, error: "forbidden" });
    expect(await setUserBlocked(a, "not-a-uuid", true)).toEqual({ ok: false, error: "not_found" });
  });

  it("профиль заблокированного кандидата пропадает из подбора", async () => {
    const a = await admin();
    const u = await user("employee");
    const db = await getDb();
    await db.update(schema.employeeProfiles).set({ headline: "Dev" }).where(eq(schema.employeeProfiles.userId, u.id));
    const r = await resumes.createResume(u.id, { title: "Р", content: emptyContent({ fullName: "Тест" }), source: "manual", reviewNotes: [] });
    await visibility.publishProfile(u.id, { resumeVersionId: r.versionId, acceptPublication: true });
    expect(await visibility.listPublishedCandidateIds()).toContain(u.id);
    expect(await visibility.getPublishedCard(u.id)).not.toBeNull();
    await setUserBlocked(a, u.id, true);
    expect(await visibility.listPublishedCandidateIds()).not.toContain(u.id);
    expect(await visibility.getPublishedCard(u.id)).toBeNull();
  });

  it("поиск по email", async () => {
    const u = await user("employer");
    const found = await listUsers(u.email.slice(0, 8));
    expect(found.map((x) => x.id)).toContain(u.id);
    expect(await listUsers("%")).toBeDefined();
  });
});

describe("возврат после оплаты", () => {
  const page = "/company/vacancies/6ba9eac8-0468-40aa-a8d6-02f639f0f819/candidates/30ef0bed-4b61-4a7f-9c3a-93b6168dd049";
  it("возвращает на карточку кандидата только по разрешённому шаблону", () => {
    expect(isSafeReturn(page)).toBe(true);
    for (const bad of ["https://evil.example/", "//evil.example", "/company/billing", `${page}/../../x`, 5, undefined]) expect(isSafeReturn(bad)).toBe(false);
    expect(returnPathFor({ kind: "extra_contact", meta: { returnTo: page } })).toBe(page);
    expect(returnPathFor({ kind: "extra_contact", meta: { returnTo: "https://evil.example/" } })).toBe("/company/billing");
    expect(returnPathFor({ kind: "employee_access", meta: {} })).toBe("/me");
    expect(returnPathFor({ kind: "employer_subscription", meta: {} })).toBe("/company/billing");
  });
});
