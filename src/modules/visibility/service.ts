import { and, eq, isNull } from "drizzle-orm";
import { verifyPassword } from "@/modules/auth/password";
import { isContactUnlocked } from "@/modules/billing/contacts";
import { hasConsent, recordConsent } from "@/modules/consent/service";
import { readContent, type ResumeContent } from "@/modules/resume/content";
import { getDb, schema } from "@/server/db";

export type Visibility = {
  published: boolean;
  resumeVersionId: string | null;
  shareEmail: boolean;
  sharePhone: boolean;
  publishedAt: Date | null;
};

const CLOSED: Visibility = { published: false, resumeVersionId: null, shareEmail: false, sharePhone: false, publishedAt: null };

export async function getVisibility(userId: string): Promise<Visibility> {
  const db = await getDb();
  const [row] = await db.select().from(schema.profileVisibility).where(eq(schema.profileVisibility.userId, userId));
  return row ?? CLOSED;
}

/** Версии резюме, которые можно опубликовать: свои и уже проверенные пользователем. */
export async function publishableVersions(userId: string) {
  const db = await getDb();
  const rows = await db
    .select({
      id: schema.resumeVersions.id,
      label: schema.resumeVersions.label,
      title: schema.resumes.title,
      reviewNotes: schema.resumeVersions.reviewNotes,
    })
    .from(schema.resumeVersions)
    .innerJoin(schema.resumes, eq(schema.resumes.id, schema.resumeVersions.resumeId))
    .where(eq(schema.resumes.userId, userId));
  return rows.map((r) => ({ id: r.id, label: `${r.title} · ${r.label}`, reviewed: r.reviewNotes.length === 0 }));
}

export type PublishResult =
  | { ok: true }
  | { ok: false; error: "no_consent" | "bad_version" | "not_reviewed" | "no_headline" };

/**
 * Публикация возможна только при отдельном согласии, проверенной версии резюме и заполненной специализации.
 * Согласие и публикация записываются одной транзакцией: не бывает опубликованного профиля без записи о согласии.
 */
export async function publishProfile(userId: string, input: { resumeVersionId: string; acceptPublication: boolean }): Promise<PublishResult> {
  const db = await getDb();
  const already = await hasConsent(userId, "profile_publication");
  if (!input.acceptPublication && !already) return { ok: false, error: "no_consent" };

  const version = (await publishableVersions(userId)).find((v) => v.id === input.resumeVersionId);
  if (!version) return { ok: false, error: "bad_version" };
  if (!version.reviewed) return { ok: false, error: "not_reviewed" };

  const [profile] = await db.select().from(schema.employeeProfiles).where(eq(schema.employeeProfiles.userId, userId));
  if (!profile || profile.headline.trim() === "") return { ok: false, error: "no_headline" };

  await db.transaction(async (tx) => {
    if (!already) await recordConsent(tx, userId, "profile_publication", true);
    const now = new Date();
    await tx
      .insert(schema.profileVisibility)
      .values({ userId, published: true, resumeVersionId: version.id, publishedAt: now })
      .onConflictDoUpdate({
        target: schema.profileVisibility.userId,
        set: { published: true, resumeVersionId: version.id, publishedAt: now, updatedAt: now },
      });
    await tx.insert(schema.auditEvents).values({ actorUserId: userId, type: "profile.published", meta: {} });
  });
  return { ok: true };
}

/** Скрыть профиль (согласие сохраняется) или отозвать согласие на публикацию (профиль скрывается обязательно). */
export async function hideProfile(userId: string, opts: { revokeConsent: boolean }): Promise<void> {
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx
      .update(schema.profileVisibility)
      .set({ published: false, updatedAt: new Date() })
      .where(eq(schema.profileVisibility.userId, userId));
    if (opts.revokeConsent) await recordConsent(tx, userId, "profile_publication", false);
    await tx.insert(schema.auditEvents).values({ actorUserId: userId, type: opts.revokeConsent ? "profile.consent_revoked" : "profile.hidden", meta: {} });
  });
}

export type SharingResult = { ok: true } | { ok: false; error: "no_consent" };

/** Какие контакты увидит работодатель после открытия контакта. Требует отдельного согласия на передачу данных. */
export async function saveSharing(userId: string, input: { shareEmail: boolean; sharePhone: boolean; acceptSharing: boolean }): Promise<SharingResult> {
  const wants = input.shareEmail || input.sharePhone;
  const already = await hasConsent(userId, "employer_data_sharing");
  if (wants && !already && !input.acceptSharing) return { ok: false, error: "no_consent" };
  const db = await getDb();
  await db.transaction(async (tx) => {
    if (wants && !already) await recordConsent(tx, userId, "employer_data_sharing", true);
    await tx
      .insert(schema.profileVisibility)
      .values({ userId, shareEmail: input.shareEmail, sharePhone: input.sharePhone })
      .onConflictDoUpdate({
        target: schema.profileVisibility.userId,
        set: { shareEmail: input.shareEmail, sharePhone: input.sharePhone, updatedAt: new Date() },
      });
  });
  return { ok: true };
}

/** Отзыв согласия на передачу данных: контакты закрываются сразу. */
export async function revokeSharing(userId: string): Promise<void> {
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx
      .update(schema.profileVisibility)
      .set({ shareEmail: false, sharePhone: false, updatedAt: new Date() })
      .where(eq(schema.profileVisibility.userId, userId));
    await recordConsent(tx, userId, "employer_data_sharing", false);
  });
}

/* ---------- что видит работодатель ---------- */

export type CandidateCard = {
  candidateId: string;
  headline: string;
  city: string;
  desiredRole: string;
  workFormat: string | null;
  about: string;
  /** Резюме без имени и контактов. */
  resume: ResumeContent;
};

export type CandidateContacts = { fullName: string; email: string | null; phone: string | null };

const anonymize = (c: ResumeContent): ResumeContent => ({ ...c, basics: { ...c.basics, fullName: "", email: "", phone: "" } });

async function loadPublished(candidateId: string) {
  const db = await getDb();
  const [row] = await db
    .select({
      vis: schema.profileVisibility,
      profile: schema.employeeProfiles,
      content: schema.resumeVersions.content,
    })
    .from(schema.profileVisibility)
    .innerJoin(schema.users, and(eq(schema.users.id, schema.profileVisibility.userId), isNull(schema.users.deletedAt), isNull(schema.users.blockedAt)))
    .innerJoin(schema.employeeProfiles, eq(schema.employeeProfiles.userId, schema.profileVisibility.userId))
    .innerJoin(schema.resumeVersions, eq(schema.resumeVersions.id, schema.profileVisibility.resumeVersionId))
    .where(and(eq(schema.profileVisibility.userId, candidateId), eq(schema.profileVisibility.published, true)));
  // Публикация действительна только пока действует согласие.
  if (!row || !(await hasConsent(candidateId, "profile_publication"))) return null;
  return row;
}

/** Публичная карточка кандидата: минимум данных, без имени и контактов. null, если профиль не опубликован. */
export async function getPublishedCard(candidateId: string): Promise<CandidateCard | null> {
  const row = await loadPublished(candidateId);
  if (!row) return null;
  return {
    candidateId,
    headline: row.profile.headline,
    city: row.profile.city,
    desiredRole: row.profile.desiredRole,
    workFormat: row.profile.workFormat,
    about: row.profile.about,
    resume: anonymize(readContent(row.content)),
  };
}

/** Кандидаты с опубликованным профилем: основа для подбора. Содержимое каждого получают только через getPublishedCard. */
export async function listPublishedCandidateIds(limit = 500): Promise<string[]> {
  const db = await getDb();
  const rows = await db
    .select({ id: schema.profileVisibility.userId })
    .from(schema.profileVisibility)
    .innerJoin(schema.users, and(eq(schema.users.id, schema.profileVisibility.userId), isNull(schema.users.deletedAt), isNull(schema.users.blockedAt)))
    .where(eq(schema.profileVisibility.published, true))
    .orderBy(schema.profileVisibility.userId)
    .limit(limit);
  return rows.map((r) => r.id);
}

/** Можно ли вообще получить контакты кандидата: опубликован, дал согласие на передачу и выбрал хотя бы один способ связи. */
export async function contactsShareable(candidateId: string): Promise<boolean> {
  const row = await loadPublished(candidateId);
  if (!row || !(await hasConsent(candidateId, "employer_data_sharing"))) return false;
  const resume = readContent(row.content);
  return (row.vis.shareEmail && Boolean(resume.basics.email)) || (row.vis.sharePhone && Boolean(resume.basics.phone));
}

/**
 * Карточка + контакты для работодателя. Контакты выдаются, только если одновременно: профиль опубликован,
 * работодатель открыл контакт в рамках подписки, кандидат дал согласие на передачу данных и выбрал, что показывать.
 */
export async function getCandidateForEmployer(employerId: string, candidateId: string) {
  const row = await loadPublished(candidateId);
  if (!row) return null;
  const card = (await getPublishedCard(candidateId))!;
  if (!(await isContactUnlocked(employerId, candidateId))) return { card, contacts: null as CandidateContacts | null };
  if (!(await hasConsent(candidateId, "employer_data_sharing"))) return { card, contacts: null };
  const resume = readContent(row.content);
  return {
    card,
    contacts: {
      fullName: resume.basics.fullName || row.profile.fullName,
      email: row.vis.shareEmail ? resume.basics.email || null : null,
      phone: row.vis.sharePhone ? resume.basics.phone || null : null,
    } satisfies CandidateContacts,
  };
}

/* ---------- удаление данных ---------- */

export type DeleteResult = { ok: true } | { ok: false; error: "wrong_password" | "not_found" };

/**
 * Удаляет персональные данные и закрывает аккаунт. Строка пользователя остаётся обезличенной, потому что платежи
 * и подписки хранятся по требованиям финансового учёта; записи о согласиях и журнал хранятся как доказательство.
 */
export async function deleteAccount(userId: string, password: string): Promise<DeleteResult> {
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!user || user.deletedAt) return { ok: false, error: "not_found" };
  if (!(await verifyPassword(password, user.passwordHash))) return { ok: false, error: "wrong_password" };

  await db.transaction(async (tx) => {
    const [employer] = await tx.select().from(schema.employerProfiles).where(eq(schema.employerProfiles.userId, userId));
    // История рекомендаций: кандидата — как кандидата; работодателя — вместе с его вакансиями (каскад).
    await tx.delete(schema.matchRecommendations).where(eq(schema.matchRecommendations.candidateUserId, userId));
    await tx.delete(schema.vacancies).where(eq(schema.vacancies.employerUserId, userId));
    await tx.delete(schema.profileVisibility).where(eq(schema.profileVisibility.userId, userId));
    await tx.delete(schema.employeeProfiles).where(eq(schema.employeeProfiles.userId, userId));
    await tx.delete(schema.resumes).where(eq(schema.resumes.userId, userId));
    await tx.delete(schema.assessmentAttempts).where(eq(schema.assessmentAttempts.userId, userId));
    await tx.delete(schema.aiConversations).where(eq(schema.aiConversations.userId, userId));
    await tx.delete(schema.employerProfiles).where(eq(schema.employerProfiles.userId, userId));
    if (employer?.companyId) await tx.delete(schema.companies).where(eq(schema.companies.id, employer.companyId));
    await tx.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
    await tx
      .update(schema.users)
      .set({ email: `deleted-${userId}@deleted.invalid`, passwordHash: "deleted", deletedAt: new Date() })
      .where(eq(schema.users.id, userId));
    await tx.insert(schema.auditEvents).values({ actorUserId: userId, type: "account.deleted", meta: { role: user.role } });
  });
  return { ok: true };
}
