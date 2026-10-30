import { and, count, desc, eq, gt, lte } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import { activeSubscription } from "./fulfil";
import { createPayment } from "./payments";
import { getPricing } from "./settings";

export type Subscription = typeof schema.subscriptions.$inferSelect;

/** Действующий период подписки (без блокировки, для показа в интерфейсе). */
export async function getActiveSubscription(userId: string, now = new Date()): Promise<Subscription | null> {
  const db = await getDb();
  const [sub] = await db
    .select()
    .from(schema.subscriptions)
    .where(and(eq(schema.subscriptions.userId, userId), lte(schema.subscriptions.periodStart, now), gt(schema.subscriptions.periodEnd, now)))
    .orderBy(desc(schema.subscriptions.periodEnd))
    .limit(1);
  return sub ?? null;
}

export async function startSubscriptionPayment(userId: string): Promise<{ redirectUrl: string }> {
  const p = await getPricing();
  // Тариф фиксируется в платеже: потом его нельзя «подменить» сменой настроек.
  const { redirectUrl } = await createPayment({
    userId,
    kind: "employer_subscription",
    amountKopecks: p.subscriptionKopecks,
    description: `Подписка работодателя на ${p.subscriptionDays} дн.`,
    meta: { days: p.subscriptionDays, includedContacts: p.includedContacts, extraContactKopecks: p.extraContactKopecks },
    returnPath: "/company/billing",
  });
  return { redirectUrl };
}

export type Quote =
  | { state: "no_subscription" }
  | { state: "already" }
  | { state: "included"; used: number; included: number }
  | { state: "payment_required"; priceKopecks: number };

async function usage(userId: string, sub: Subscription, candidateUserId: string) {
  const db = await getDb();
  const [existing] = await db
    .select({ id: schema.contactUnlocks.id })
    .from(schema.contactUnlocks)
    .where(and(eq(schema.contactUnlocks.subscriptionId, sub.id), eq(schema.contactUnlocks.candidateUserId, candidateUserId)));
  const [{ used }] = await db
    .select({ used: count() })
    .from(schema.contactUnlocks)
    .where(and(eq(schema.contactUnlocks.subscriptionId, sub.id), eq(schema.contactUnlocks.chargeKind, "included")));
  return { already: Boolean(existing), used };
}

/** Что произойдёт при открытии контакта: показывается работодателю ДО действия, вместе со стоимостью. */
export async function quoteContact(employerUserId: string, candidateUserId: string): Promise<Quote> {
  const sub = await getActiveSubscription(employerUserId);
  if (!sub) return { state: "no_subscription" };
  const u = await usage(employerUserId, sub, candidateUserId);
  if (u.already) return { state: "already" };
  if (u.used < sub.includedContacts) return { state: "included", used: u.used, included: sub.includedContacts };
  return { state: "payment_required", priceKopecks: sub.extraContactKopecks };
}

export type UnlockResult =
  | { state: "no_subscription" }
  | { state: "already" }
  | { state: "unlocked"; used: number; included: number }
  | { state: "payment_required"; priceKopecks: number };

/**
 * Открывает контакт в рамках лимита подписки. Строка подписки блокируется на время транзакции, поэтому
 * параллельные запросы не могут выйти за лимит. Повторное открытие в том же периоде не списывает ничего.
 * Сверх лимита контакт НЕ открывается: нужен подтверждённый платёж (startExtraContactPayment).
 */
export async function unlockContact(employerUserId: string, candidateUserId: string): Promise<UnlockResult> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const sub = await activeSubscription(tx, employerUserId, new Date());
    if (!sub) return { state: "no_subscription" } as const;

    const [existing] = await tx
      .select({ id: schema.contactUnlocks.id })
      .from(schema.contactUnlocks)
      .where(and(eq(schema.contactUnlocks.subscriptionId, sub.id), eq(schema.contactUnlocks.candidateUserId, candidateUserId)));
    if (existing) return { state: "already" } as const;

    const [{ used }] = await tx
      .select({ used: count() })
      .from(schema.contactUnlocks)
      .where(and(eq(schema.contactUnlocks.subscriptionId, sub.id), eq(schema.contactUnlocks.chargeKind, "included")));
    if (used >= sub.includedContacts) return { state: "payment_required", priceKopecks: sub.extraContactKopecks } as const;

    await tx
      .insert(schema.contactUnlocks)
      .values({ employerUserId, candidateUserId, subscriptionId: sub.id, chargeKind: "included" });
    return { state: "unlocked", used: used + 1, included: sub.includedContacts } as const;
  });
}

/** Платёж за контакт сверх лимита. Сам контакт откроется только после подтверждения оплаты провайдером. */
export async function startExtraContactPayment(
  employerUserId: string,
  candidateUserId: string,
): Promise<{ state: "redirect"; redirectUrl: string } | Exclude<Quote, { state: "included" }>> {
  const q = await quoteContact(employerUserId, candidateUserId);
  if (q.state !== "payment_required") return q.state === "included" ? { state: "payment_required", priceKopecks: 0 } : q;
  const { redirectUrl } = await createPayment({
    userId: employerUserId,
    kind: "extra_contact",
    amountKopecks: q.priceKopecks,
    description: "Дополнительный контакт кандидата",
    meta: { candidateUserId },
    returnPath: "/company/billing",
  });
  return { state: "redirect", redirectUrl };
}

export async function isContactUnlocked(employerUserId: string, candidateUserId: string): Promise<boolean> {
  const sub = await getActiveSubscription(employerUserId);
  if (!sub) return false;
  return (await usage(employerUserId, sub, candidateUserId)).already;
}

export async function contactUsage(employerUserId: string) {
  const sub = await getActiveSubscription(employerUserId);
  if (!sub) return null;
  const db = await getDb();
  const rows = await db.select().from(schema.contactUnlocks).where(eq(schema.contactUnlocks.subscriptionId, sub.id));
  return {
    subscription: sub,
    includedUsed: rows.filter((r) => r.chargeKind === "included").length,
    paidCount: rows.filter((r) => r.chargeKind === "paid").length,
  };
}
