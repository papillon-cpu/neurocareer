import { and, asc, count, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import { compactContent, readContent, resumeContentSchema, type ResumeContent } from "./content";

export const MAX_RESUMES = 10;
export const MAX_VERSIONS = 20;

export class LimitError extends Error {}

const ownedVersion = (userId: string, versionId: string) =>
  and(eq(schema.resumeVersions.id, versionId), eq(schema.resumes.userId, userId));

export async function listResumes(userId: string) {
  const db = await getDb();
  const resumes = await db
    .select()
    .from(schema.resumes)
    .where(eq(schema.resumes.userId, userId))
    .orderBy(desc(schema.resumes.updatedAt));
  const versions = resumes.length
    ? await db
        .select({
          id: schema.resumeVersions.id,
          resumeId: schema.resumeVersions.resumeId,
          label: schema.resumeVersions.label,
          needsReview: schema.resumeVersions.reviewNotes,
        })
        .from(schema.resumeVersions)
        .innerJoin(schema.resumes, eq(schema.resumes.id, schema.resumeVersions.resumeId))
        .where(eq(schema.resumes.userId, userId))
        .orderBy(asc(schema.resumeVersions.createdAt))
    : [];
  return resumes.map((r) => ({
    ...r,
    versions: versions
      .filter((v) => v.resumeId === r.id)
      .map((v) => ({ id: v.id, label: v.label, needsReview: v.needsReview.length > 0 })),
  }));
}

export async function createResume(
  userId: string,
  input: {
    title: string;
    content: ResumeContent;
    source: "manual" | "import";
    sourceText?: string;
    reviewNotes?: string[];
  },
): Promise<{ resumeId: string; versionId: string }> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [{ n }] = await tx
      .select({ n: count() })
      .from(schema.resumes)
      .where(eq(schema.resumes.userId, userId));
    if (n >= MAX_RESUMES) throw new LimitError(`Можно хранить не больше ${MAX_RESUMES} резюме.`);

    const [resume] = await tx
      .insert(schema.resumes)
      .values({ userId, title: input.title })
      .returning({ id: schema.resumes.id });
    const [version] = await tx
      .insert(schema.resumeVersions)
      .values({
        resumeId: resume.id,
        label: "Основная версия",
        content: compactContent(input.content),
        source: input.source,
        sourceText: input.sourceText ?? null,
        reviewNotes: input.reviewNotes ?? [],
      })
      .returning({ id: schema.resumeVersions.id });
    return { resumeId: resume.id, versionId: version.id };
  });
}

/** Резюме со всеми версиями; null, если оно не принадлежит пользователю. */
export async function getResumeForUser(userId: string, resumeId: string) {
  const db = await getDb();
  const [resume] = await db
    .select()
    .from(schema.resumes)
    .where(and(eq(schema.resumes.id, resumeId), eq(schema.resumes.userId, userId)));
  if (!resume) return null;
  const versions = await db
    .select()
    .from(schema.resumeVersions)
    .where(eq(schema.resumeVersions.resumeId, resumeId))
    .orderBy(asc(schema.resumeVersions.createdAt));
  return {
    resume,
    versions: versions.map((v) => ({ ...v, content: readContent(v.content) })),
  };
}

export async function saveVersion(
  userId: string,
  versionId: string,
  input: { label: string; content: ResumeContent },
): Promise<boolean> {
  const parsed = resumeContentSchema.safeParse(input.content);
  if (!parsed.success) return false;
  const db = await getDb();
  const [owned] = await db
    .select({ id: schema.resumeVersions.id, resumeId: schema.resumeVersions.resumeId })
    .from(schema.resumeVersions)
    .innerJoin(schema.resumes, eq(schema.resumes.id, schema.resumeVersions.resumeId))
    .where(ownedVersion(userId, versionId));
  if (!owned) return false;
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(schema.resumeVersions)
      .set({ label: input.label, content: compactContent(parsed.data), updatedAt: now })
      .where(eq(schema.resumeVersions.id, versionId));
    await tx.update(schema.resumes).set({ updatedAt: now }).where(eq(schema.resumes.id, owned.resumeId));
  });
  return true;
}

/** Пользователь подтверждает, что проверил данные: пометки «проверьте» снимаются. */
export async function confirmReview(userId: string, versionId: string): Promise<boolean> {
  const db = await getDb();
  const [owned] = await db
    .select({ id: schema.resumeVersions.id })
    .from(schema.resumeVersions)
    .innerJoin(schema.resumes, eq(schema.resumes.id, schema.resumeVersions.resumeId))
    .where(ownedVersion(userId, versionId));
  if (!owned) return false;
  await db.update(schema.resumeVersions).set({ reviewNotes: [] }).where(eq(schema.resumeVersions.id, versionId));
  return true;
}

/** Копия версии (или пустая основа) под новую цель, например под вакансию. */
export async function addVersion(
  userId: string,
  resumeId: string,
  fromVersionId: string,
  label: string,
): Promise<string | null> {
  const db = await getDb();
  const data = await getResumeForUser(userId, resumeId);
  if (!data) return null;
  if (data.versions.length >= MAX_VERSIONS) throw new LimitError(`Не больше ${MAX_VERSIONS} версий в одном резюме.`);
  const source = data.versions.find((v) => v.id === fromVersionId) ?? data.versions[0];
  const [created] = await db
    .insert(schema.resumeVersions)
    .values({
      resumeId,
      label,
      content: source.content,
      source: "manual",
      // Копия наследует непроверенные пометки: проверка не «отмывается» копированием.
      reviewNotes: source.reviewNotes,
    })
    .returning({ id: schema.resumeVersions.id });
  return created.id;
}

export async function deleteVersion(userId: string, versionId: string): Promise<boolean> {
  const db = await getDb();
  const [owned] = await db
    .select({ id: schema.resumeVersions.id, resumeId: schema.resumeVersions.resumeId })
    .from(schema.resumeVersions)
    .innerJoin(schema.resumes, eq(schema.resumes.id, schema.resumeVersions.resumeId))
    .where(ownedVersion(userId, versionId));
  if (!owned) return false;
  const [{ n }] = await db
    .select({ n: count() })
    .from(schema.resumeVersions)
    .where(eq(schema.resumeVersions.resumeId, owned.resumeId));
  if (n <= 1) return false; // последнюю версию удаляют вместе с резюме
  await db.delete(schema.resumeVersions).where(eq(schema.resumeVersions.id, versionId));
  return true;
}

export async function deleteResume(userId: string, resumeId: string): Promise<boolean> {
  const db = await getDb();
  const deleted = await db
    .delete(schema.resumes)
    .where(and(eq(schema.resumes.id, resumeId), eq(schema.resumes.userId, userId)))
    .returning({ id: schema.resumes.id });
  return deleted.length > 0;
}
