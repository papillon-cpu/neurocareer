import { and, desc, eq, gt, lte } from "drizzle-orm";
import { schema } from "@/server/db";
import type { Db } from "@/server/db";

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type Payment = typeof schema.payments.$inferSelect;

type SubscriptionMeta = { days: number; includedContacts: number; extraContactKopecks: number };

/** Действующий период подписки работодателя (с блокировкой строки внутри транзакции). */
export async function activeSubscription(tx: Tx, userId: string, now: Date) {
  const [sub] = await tx
    .select()
    .from(schema.subscriptions)
    .where(and(eq(schema.subscriptions.userId, userId), lte(schema.subscriptions.periodStart, now), gt(schema.subscriptions.periodEnd, now)))
    .orderBy(desc(schema.subscriptions.periodEnd))
    .limit(1)
    .for("update");
  return sub;
}

/**
 * Выдаёт то, за что заплачено. Вызывается ровно один раз для платежа: из обработчика события,
 * в той же транзакции, где платёж получил статус «оплачен».
 */
export async function fulfilPayment(tx: Tx, p: Payment, now = new Date()): Promise<void> {
  if (p.kind === "employee_access") {
    await tx.insert(schema.employeeAccess).values({ userId: p.userId, paymentId: p.id }).onConflictDoNothing();
  } else if (p.kind === "employer_subscription") {
    const meta = p.meta as SubscriptionMeta;
    const [last] = await tx
      .select({ periodEnd: schema.subscriptions.periodEnd })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.userId, p.userId))
      .orderBy(desc(schema.subscriptions.periodEnd))
      .limit(1);
    // Продление не «съедает» оплаченное время: новый период начинается после конца текущего.
    const start = last && last.periodEnd > now ? last.periodEnd : now;
    const end = new Date(start.getTime() + meta.days * 86_400_000);
    await tx.insert(schema.subscriptions).values({
      userId: p.userId,
      periodStart: start,
      periodEnd: end,
      priceKopecks: p.amountKopecks,
      includedContacts: meta.includedContacts,
      extraContactKopecks: meta.extraContactKopecks,
      paymentId: p.id,
    });
  } else if (p.kind === "extra_contact") {
    const candidateUserId = (p.meta as { candidateUserId?: string }).candidateUserId;
    const sub = await activeSubscription(tx, p.userId, now);
    if (!sub || !candidateUserId) {
      // Деньги получены, а выдать нечего (подписка закончилась, пока шла оплата): требуется ручной возврат.
      await tx.update(schema.payments).set({ meta: { ...p.meta, needsReview: true } }).where(eq(schema.payments.id, p.id));
      await tx.insert(schema.auditEvents).values({ actorUserId: p.userId, type: "payment.needs_review", meta: { paymentId: p.id } });
      return;
    }
    await tx
      .insert(schema.contactUnlocks)
      .values({ employerUserId: p.userId, candidateUserId, subscriptionId: sub.id, chargeKind: "paid", paymentId: p.id })
      .onConflictDoNothing();
  }
  await tx.insert(schema.auditEvents).values({ actorUserId: p.userId, type: "payment.succeeded", meta: { kind: p.kind, paymentId: p.id } });
}
