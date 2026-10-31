import { and, desc, eq, inArray } from "drizzle-orm";
import { recommendationFor } from "@/modules/matching/service";
import { getPublishedCard } from "@/modules/visibility/service";
import { getDb, schema } from "@/server/db";

export type FavoriteItem = {
  candidateId: string;
  vacancyId: string;
  vacancyTitle: string;
  addedAt: Date;
  /** null — профиль больше не опубликован: в списке остаётся пометка, данные не показываются. */
  card: { headline: string; city: string; desiredRole: string } | null;
};

export async function isFavorite(employerId: string, candidateId: string): Promise<boolean> {
  const db = await getDb();
  const [row] = await db
    .select({ id: schema.employerFavorites.id })
    .from(schema.employerFavorites)
    .where(and(eq(schema.employerFavorites.employerUserId, employerId), eq(schema.employerFavorites.candidateUserId, candidateId)))
    .limit(1);
  return Boolean(row);
}

/** Переключает избранное. Добавить можно только кандидата, рекомендованного по вашей вакансии. Возвращает новое состояние. */
export async function toggleFavorite(employerId: string, vacancyId: string, candidateId: string): Promise<boolean | null> {
  const db = await getDb();
  if (await isFavorite(employerId, candidateId)) {
    await db
      .delete(schema.employerFavorites)
      .where(and(eq(schema.employerFavorites.employerUserId, employerId), eq(schema.employerFavorites.candidateUserId, candidateId)));
    return false;
  }
  if (!(await recommendationFor(employerId, vacancyId, candidateId))) return null;
  await db
    .insert(schema.employerFavorites)
    .values({ employerUserId: employerId, candidateUserId: candidateId, vacancyId })
    .onConflictDoNothing();
  return true;
}

export async function listFavorites(employerId: string): Promise<FavoriteItem[]> {
  const db = await getDb();
  const rows = await db
    .select({
      candidateId: schema.employerFavorites.candidateUserId,
      vacancyId: schema.employerFavorites.vacancyId,
      vacancyTitle: schema.vacancies.title,
      addedAt: schema.employerFavorites.createdAt,
    })
    .from(schema.employerFavorites)
    .innerJoin(schema.vacancies, eq(schema.vacancies.id, schema.employerFavorites.vacancyId))
    .where(eq(schema.employerFavorites.employerUserId, employerId))
    .orderBy(desc(schema.employerFavorites.createdAt));
  return Promise.all(
    rows.map(async (r) => {
      const c = await getPublishedCard(r.candidateId);
      return { ...r, card: c ? { headline: c.headline, city: c.city, desiredRole: c.desiredRole } : null };
    }),
  );
}

export type OpenedContact = FavoriteItem & { chargeKind: "included" | "paid" };

/** История открытых контактов: кандидат, дата и вид списания; для перехода к карточке берётся последняя рекомендация по вашим вакансиям. */
export async function listOpenedContacts(employerId: string): Promise<OpenedContact[]> {
  const db = await getDb();
  const unlocks = await db
    .select({
      candidateId: schema.contactUnlocks.candidateUserId,
      chargeKind: schema.contactUnlocks.chargeKind,
      addedAt: schema.contactUnlocks.createdAt,
    })
    .from(schema.contactUnlocks)
    .where(eq(schema.contactUnlocks.employerUserId, employerId))
    .orderBy(desc(schema.contactUnlocks.createdAt))
    .limit(100);
  if (unlocks.length === 0) return [];

  const recs = await db
    .select({
      candidateId: schema.matchRecommendations.candidateUserId,
      vacancyId: schema.matchRecommendations.vacancyId,
      vacancyTitle: schema.vacancies.title,
    })
    .from(schema.matchRecommendations)
    .innerJoin(schema.vacancies, eq(schema.vacancies.id, schema.matchRecommendations.vacancyId))
    .where(
      and(
        eq(schema.vacancies.employerUserId, employerId),
        inArray(schema.matchRecommendations.candidateUserId, [...new Set(unlocks.map((u) => u.candidateId))]),
      ),
    )
    .orderBy(desc(schema.matchRecommendations.createdAt));
  const latest = new Map<string, { vacancyId: string; vacancyTitle: string }>();
  for (const r of recs) if (!latest.has(r.candidateId)) latest.set(r.candidateId, r);

  const seen = new Set<string>();
  const out: OpenedContact[] = [];
  for (const u of unlocks) {
    if (seen.has(u.candidateId)) continue; // один кандидат — одна строка, даже если контакт открывали в нескольких периодах
    seen.add(u.candidateId);
    const rec = latest.get(u.candidateId);
    if (!rec) continue; // без рекомендации карточку открыть нельзя
    const c = await getPublishedCard(u.candidateId);
    out.push({
      candidateId: u.candidateId,
      vacancyId: rec.vacancyId,
      vacancyTitle: rec.vacancyTitle,
      addedAt: u.addedAt,
      chargeKind: u.chargeKind,
      card: c ? { headline: c.headline, city: c.city, desiredRole: c.desiredRole } : null,
    });
  }
  return out;
}
