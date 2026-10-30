import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { authenticate, registerUser } from "@/modules/auth/service";
import { issueSession, findSessionUser } from "@/modules/auth/session-store";
import { unlockContact } from "@/modules/billing/contacts";
import { hasConsent, setConsent } from "@/modules/consent/service";
import { emptyContent } from "@/modules/resume/content";
import * as resumes from "@/modules/resume/service";
import * as vis from "@/modules/visibility/service";
import { getDb, schema } from "@/server/db";

const PASSWORD = "longenoughpass";
let n = 0;

async function candidate(opts: { headline?: string; reviewed?: boolean } = {}) {
  const id = ++n;
  const email = `cand-${id}@example.com`;
  const u = await registerUser({ fullName: `Кандидат ${id}`, email, password: PASSWORD, role: "employee", acceptService: true, acceptMarketing: false });
  const db = await getDb();
  await db
    .update(schema.employeeProfiles)
    .set({ headline: opts.headline ?? "QA-инженер", city: "Казань", desiredRole: "Lead QA", workFormat: "remote", about: "Строю процессы качества." })
    .where(eq(schema.employeeProfiles.userId, u.id));
  const content = emptyContent({ fullName: `Кандидат ${id}`, headline: "QA", email: `resume-${id}@example.com`, phone: "+7 900 000-00-00" });
  content.skills = ["Playwright"];
  const r = await resumes.createResume(u.id, {
    title: "Резюме",
    content,
    source: opts.reviewed === false ? "import" : "manual",
    reviewNotes: opts.reviewed === false ? ["проверьте"] : [],
  });
  return { id: u.id, email, versionId: r.versionId };
}

async function employerWithSubscription(includedContacts = 50) {
  const db = await getDb();
  const [u] = await db.insert(schema.users).values({ email: `emp-${++n}@example.com`, passwordHash: "x", role: "employer" }).returning({ id: schema.users.id });
  await db.insert(schema.subscriptions).values({
    userId: u.id,
    periodStart: new Date(Date.now() - 86_400_000),
    periodEnd: new Date(Date.now() + 29 * 86_400_000),
    priceKopecks: 100_000,
    includedContacts,
    extraContactKopecks: 20_000,
  });
  return u.id;
}

beforeAll(async () => {
  await getDb();
});

describe("публикация профиля", () => {
  it("по умолчанию всё закрыто", async () => {
    const c = await candidate();
    expect(await vis.getVisibility(c.id)).toMatchObject({ published: false, shareEmail: false, sharePhone: false });
    expect(await vis.getPublishedCard(c.id)).toBeNull();
  });

  it("без отдельного согласия, чужой или непроверенной версии, без специализации публикация невозможна", async () => {
    const c = await candidate();
    const other = await candidate();
    expect(await vis.publishProfile(c.id, { resumeVersionId: c.versionId, acceptPublication: false })).toEqual({ ok: false, error: "no_consent" });
    expect(await vis.publishProfile(c.id, { resumeVersionId: other.versionId, acceptPublication: true })).toEqual({ ok: false, error: "bad_version" });

    const unreviewed = await candidate({ reviewed: false });
    expect(await vis.publishProfile(unreviewed.id, { resumeVersionId: unreviewed.versionId, acceptPublication: true })).toEqual({ ok: false, error: "not_reviewed" });

    const noHeadline = await candidate({ headline: "" });
    expect(await vis.publishProfile(noHeadline.id, { resumeVersionId: noHeadline.versionId, acceptPublication: true })).toEqual({ ok: false, error: "no_headline" });

    expect(await vis.getPublishedCard(c.id)).toBeNull();
    expect(await hasConsent(c.id, "profile_publication")).toBe(false);
  });

  it("публикация записывает согласие, показывает минимум данных и скрывает имя и контакты", async () => {
    const c = await candidate();
    expect(await vis.publishProfile(c.id, { resumeVersionId: c.versionId, acceptPublication: true })).toEqual({ ok: true });
    expect(await hasConsent(c.id, "profile_publication")).toBe(true);

    const card = (await vis.getPublishedCard(c.id))!;
    expect(card).toMatchObject({ headline: "QA-инженер", city: "Казань", desiredRole: "Lead QA" });
    expect(card.resume.skills).toEqual(["Playwright"]);
    const json = JSON.stringify(card);
    for (const secret of [`Кандидат`, c.email, "resume-", "+7 900", "000-00-00"]) expect(json).not.toContain(secret);

    const db = await getDb();
    const audit = await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.actorUserId, c.id));
    expect(audit.map((a) => a.type)).toContain("profile.published");
  });

  it("скрытие сохраняет согласие, отзыв согласия требует нового подтверждения; пропавшее согласие скрывает профиль само", async () => {
    const c = await candidate();
    await vis.publishProfile(c.id, { resumeVersionId: c.versionId, acceptPublication: true });

    await vis.hideProfile(c.id, { revokeConsent: false });
    expect(await vis.getPublishedCard(c.id)).toBeNull();
    expect(await hasConsent(c.id, "profile_publication")).toBe(true);
    expect(await vis.publishProfile(c.id, { resumeVersionId: c.versionId, acceptPublication: false })).toEqual({ ok: true });
    expect(await vis.getPublishedCard(c.id)).not.toBeNull();

    await vis.hideProfile(c.id, { revokeConsent: true });
    expect(await vis.getPublishedCard(c.id)).toBeNull();
    expect(await hasConsent(c.id, "profile_publication")).toBe(false);
    expect(await vis.publishProfile(c.id, { resumeVersionId: c.versionId, acceptPublication: false })).toEqual({ ok: false, error: "no_consent" });

    await vis.publishProfile(c.id, { resumeVersionId: c.versionId, acceptPublication: true });
    await setConsent(c.id, "profile_publication", false); // согласие отозвано напрямую
    expect(await vis.getPublishedCard(c.id)).toBeNull();
  });
});

describe("контакты для работодателя", () => {
  it("контакты выдаются только при открытом контакте, согласии кандидата и его выборе", async () => {
    const c = await candidate();
    const employer = await employerWithSubscription();
    await vis.publishProfile(c.id, { resumeVersionId: c.versionId, acceptPublication: true });

    expect((await vis.getCandidateForEmployer(employer, c.id))!.contacts).toBeNull(); // не открыт

    await unlockContact(employer, c.id);
    expect((await vis.getCandidateForEmployer(employer, c.id))!.contacts).toBeNull(); // нет согласия на передачу

    expect(await vis.saveSharing(c.id, { shareEmail: true, sharePhone: false, acceptSharing: false })).toEqual({ ok: false, error: "no_consent" });
    expect((await vis.getVisibility(c.id)).shareEmail).toBe(false);

    expect(await vis.saveSharing(c.id, { shareEmail: true, sharePhone: false, acceptSharing: true })).toEqual({ ok: true });
    const shared = (await vis.getCandidateForEmployer(employer, c.id))!.contacts!;
    expect(shared.fullName).toContain("Кандидат");
    expect(shared.email).toMatch(/^resume-\d+@example\.com$/);
    expect(shared.phone).toBeNull(); // телефон не выбран

    await vis.revokeSharing(c.id);
    expect((await vis.getCandidateForEmployer(employer, c.id))!.contacts).toBeNull();
    expect(await hasConsent(c.id, "employer_data_sharing")).toBe(false);
  });

  it("другой работодатель без открытого контакта контактов не видит; снятый с публикации профиль недоступен", async () => {
    const c = await candidate();
    const opened = await employerWithSubscription();
    const stranger = await employerWithSubscription();
    await vis.publishProfile(c.id, { resumeVersionId: c.versionId, acceptPublication: true });
    await vis.saveSharing(c.id, { shareEmail: true, sharePhone: true, acceptSharing: true });
    await unlockContact(opened, c.id);

    expect((await vis.getCandidateForEmployer(opened, c.id))!.contacts).not.toBeNull();
    expect((await vis.getCandidateForEmployer(stranger, c.id))!.contacts).toBeNull();

    await vis.hideProfile(c.id, { revokeConsent: false });
    expect(await vis.getCandidateForEmployer(opened, c.id)).toBeNull();
  });
});

describe("удаление аккаунта", () => {
  it("стирает персональные данные, закрывает сессии и вход, сохраняет платёжные записи", async () => {
    const c = await candidate();
    await vis.publishProfile(c.id, { resumeVersionId: c.versionId, acceptPublication: true });
    const db = await getDb();
    await db.insert(schema.payments).values({ userId: c.id, kind: "employee_access", amountKopecks: 50_000, status: "succeeded", provider: "sandbox", providerPaymentId: `sbx_del_${c.id}` });
    const { token } = await issueSession(c.id);
    expect(await findSessionUser(token)).not.toBeNull();

    expect(await vis.deleteAccount(c.id, "wrongpassword!")).toEqual({ ok: false, error: "wrong_password" });
    expect(await vis.getPublishedCard(c.id)).not.toBeNull(); // ничего не удалено при неверном пароле

    expect(await vis.deleteAccount(c.id, PASSWORD)).toEqual({ ok: true });
    expect(await vis.getPublishedCard(c.id)).toBeNull();
    expect(await findSessionUser(token)).toBeNull();
    expect(await authenticate(c.email, PASSWORD)).toBeNull();
    expect(await resumes.listResumes(c.id)).toEqual([]);

    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, c.id));
    expect(user.email).toBe(`deleted-${c.id}@deleted.invalid`);
    expect(user.deletedAt).not.toBeNull();
    expect(await db.select().from(schema.employeeProfiles).where(eq(schema.employeeProfiles.userId, c.id))).toHaveLength(0);
    expect(await db.select().from(schema.payments).where(eq(schema.payments.userId, c.id))).toHaveLength(1);
    const audit = await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.actorUserId, c.id));
    expect(audit.map((a) => a.type)).toContain("account.deleted");

    expect(await vis.deleteAccount(c.id, PASSWORD)).toEqual({ ok: false, error: "not_found" });
  });

  it("у работодателя удаляется и компания", async () => {
    const u = await registerUser({ fullName: "Босс", email: `boss-${++n}@example.com`, password: PASSWORD, role: "employer", acceptService: true, acceptMarketing: false });
    const db = await getDb();
    const [company] = await db.insert(schema.companies).values({ name: "Ромашка" }).returning();
    await db.update(schema.employerProfiles).set({ companyId: company.id }).where(eq(schema.employerProfiles.userId, u.id));
    expect((await vis.deleteAccount(u.id, PASSWORD)).ok).toBe(true);
    expect(await db.select().from(schema.companies).where(eq(schema.companies.id, company.id))).toHaveLength(0);
  });
});
