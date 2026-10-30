import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import { fulfilPayment, type Payment } from "./fulfil";
import { getProvider, type PaymentEvent } from "./provider";

export class BillingUnavailableError extends Error {
  constructor() {
    super("billing_unavailable");
  }
}

export const BILLING_UNAVAILABLE_MESSAGE = "Оплата пока не подключена. Попробуйте позже или напишите в поддержку.";

type NewPayment = {
  userId: string;
  kind: Payment["kind"];
  amountKopecks: number;
  description: string;
  meta?: Record<string, unknown>;
  /** Куда вернуть пользователя, если оплата не потребовалась (сумма 0). */
  returnPath: string;
};

/** Создаёт платёж в статусе «ожидает» и просит у провайдера страницу оплаты. Оплаченным он станет только по событию провайдера. */
export async function createPayment(input: NewPayment): Promise<{ paymentId: string; redirectUrl: string }> {
  const db = await getDb();

  if (input.amountKopecks === 0) {
    // Администратор сделал функцию бесплатной: выдаём сразу, без провайдера, но с записью о платеже.
    const paymentId = await db.transaction(async (tx) => {
      const [p] = await tx
        .insert(schema.payments)
        .values({ userId: input.userId, kind: input.kind, amountKopecks: 0, status: "succeeded", provider: "free", meta: input.meta ?? {}, paidAt: new Date() })
        .returning();
      await fulfilPayment(tx, p);
      return p.id;
    });
    return { paymentId, redirectUrl: input.returnPath };
  }

  const provider = getProvider();
  if (!provider) throw new BillingUnavailableError();

  const [p] = await db
    .insert(schema.payments)
    .values({ userId: input.userId, kind: input.kind, amountKopecks: input.amountKopecks, provider: provider.id, meta: input.meta ?? {} })
    .returning();
  try {
    const checkout = await provider.createCheckout({ paymentId: p.id, amountKopecks: p.amountKopecks, description: input.description });
    await db.update(schema.payments).set({ providerPaymentId: checkout.providerPaymentId }).where(eq(schema.payments.id, p.id));
    return { paymentId: p.id, redirectUrl: checkout.redirectUrl };
  } catch {
    await db.update(schema.payments).set({ status: "failed" }).where(eq(schema.payments.id, p.id));
    throw new BillingUnavailableError();
  }
}

export type EventOutcome = "applied" | "duplicate" | "unknown_payment" | "amount_mismatch" | "ignored";

/**
 * Единственное место, где платёж меняет статус. Идемпотентно: событие с уже виденным id ничего не меняет,
 * поэтому повторная доставка webhook не выдаёт доступ и не списывает деньги второй раз.
 */
export async function processPaymentEvent(providerId: string, event: PaymentEvent): Promise<EventOutcome> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [payment] = await tx
      .select()
      .from(schema.payments)
      .where(and(eq(schema.payments.provider, providerId), eq(schema.payments.providerPaymentId, event.providerPaymentId)))
      .limit(1)
      .for("update");

    const seen = await tx
      .insert(schema.paymentEvents)
      .values({ provider: providerId, eventId: event.eventId, paymentId: payment?.id ?? null, status: event.status })
      .onConflictDoNothing()
      .returning({ id: schema.paymentEvents.id });
    if (seen.length === 0) return "duplicate";

    if (!payment) return "unknown_payment";
    if (payment.status !== "pending") return "ignored"; // оплаченный платёж нельзя «провалить» позднее событием
    if (event.amountKopecks !== undefined && event.amountKopecks !== payment.amountKopecks) {
      await tx.update(schema.payments).set({ status: "failed", meta: { ...payment.meta, amountMismatch: event.amountKopecks } }).where(eq(schema.payments.id, payment.id));
      return "amount_mismatch";
    }

    if (event.status !== "succeeded") {
      await tx.update(schema.payments).set({ status: event.status }).where(eq(schema.payments.id, payment.id));
      return "applied";
    }
    const [paid] = await tx
      .update(schema.payments)
      .set({ status: "succeeded", paidAt: new Date() })
      .where(eq(schema.payments.id, payment.id))
      .returning();
    await fulfilPayment(tx, paid);
    return "applied";
  });
}

export async function listPayments(userId: string) {
  const db = await getDb();
  return db.select().from(schema.payments).where(eq(schema.payments.userId, userId)).orderBy(schema.payments.createdAt);
}
