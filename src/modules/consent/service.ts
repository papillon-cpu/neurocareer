import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import type { Db } from "@/server/db";
import type { ConsentPurpose } from "@/server/db/schema";
import { CONSENT_TEXT_VERSION } from "./texts";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Действует последнее решение по цели: каждое согласие и отзыв хранятся отдельной записью. */
export async function hasConsent(userId: string, purpose: ConsentPurpose): Promise<boolean> {
  const db = await getDb();
  const [last] = await db
    .select({ granted: schema.consentRecords.granted })
    .from(schema.consentRecords)
    .where(and(eq(schema.consentRecords.userId, userId), eq(schema.consentRecords.purpose, purpose)))
    .orderBy(desc(schema.consentRecords.createdAt), desc(schema.consentRecords.id))
    .limit(1);
  return last?.granted ?? false;
}

/** Запись согласия или отзыва внутри уже открытой транзакции (чтобы менять согласие и его последствия атомарно). */
export async function recordConsent(tx: Tx, userId: string, purpose: ConsentPurpose, granted: boolean): Promise<void> {
  await tx.insert(schema.consentRecords).values({ userId, purpose, granted, textVersion: CONSENT_TEXT_VERSION });
  await tx
    .insert(schema.auditEvents)
    .values({ actorUserId: userId, type: granted ? "consent.granted" : "consent.revoked", meta: { purpose } });
}

export async function setConsent(userId: string, purpose: ConsentPurpose, granted: boolean): Promise<void> {
  const db = await getDb();
  await db.transaction((tx) => recordConsent(tx, userId, purpose, granted));
}
