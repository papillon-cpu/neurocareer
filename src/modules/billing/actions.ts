"use server";

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser, requireRole } from "@/modules/auth/dal";
import { rateLimit } from "@/modules/auth/rate-limit";
import type { FormState } from "@/modules/auth/schemas";
import { getDb, schema } from "@/server/db";
import { startEmployeePayment } from "./access";
import { startSubscriptionPayment } from "./contacts";
import { BillingUnavailableError, processPaymentEvent } from "./payments";
import { getProvider } from "./provider";
import { returnPathFor } from "./return";
import { setPricing } from "./settings";

const uuid = z.uuid();

function limited(userId: string) {
  return !rateLimit(`pay:${userId}`, 20, 60 * 60 * 1000).ok;
}

export async function startEmployeePaymentAction(): Promise<void> {
  const user = await requireRole("employee");
  if (limited(user.id)) redirect("/me/pay?error=limit");
  let target: string;
  try {
    const res = await startEmployeePayment(user.id);
    target = res.already ? "/me" : res.redirectUrl;
  } catch (e) {
    if (!(e instanceof BillingUnavailableError)) throw e;
    target = "/me/pay?error=unavailable";
  }
  redirect(target);
}

export async function startSubscriptionAction(): Promise<void> {
  const user = await requireRole("employer");
  if (limited(user.id)) redirect("/company/billing?error=limit");
  let target: string;
  try {
    target = (await startSubscriptionPayment(user.id)).redirectUrl;
  } catch (e) {
    if (!(e instanceof BillingUnavailableError)) throw e;
    target = "/company/billing?error=unavailable";
  }
  redirect(target);
}

/**
 * Только тестовый режим: имитирует решение платёжного провайдера. Подтверждение проходит тот же путь,
 * что и настоящее событие (обработчик событий с идемпотентностью), но без реальных денег.
 * В production без настроенного тестового режима действие ничего не делает.
 */
export async function sandboxResolveAction(form: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const id = uuid.safeParse(form.get("paymentId"));
  const outcome = z.enum(["succeeded", "failed", "canceled"]).safeParse(form.get("outcome"));
  const provider = getProvider();
  if (!id.success || !outcome.success || provider?.id !== "sandbox") redirect("/");

  const db = await getDb();
  const [p] = await db.select().from(schema.payments).where(eq(schema.payments.id, id.data));
  if (!p || p.userId !== user.id || p.provider !== "sandbox" || !p.providerPaymentId) redirect("/");

  await processPaymentEvent("sandbox", {
    eventId: randomUUID(),
    providerPaymentId: p.providerPaymentId,
    status: outcome.data,
    amountKopecks: p.amountKopecks,
  });
  redirect(returnPathFor(p));
}

const rub = z.coerce.number().min(0).max(100_000);

export async function savePricingAction(_prev: FormState, form: FormData): Promise<FormState> {
  const admin = await requireRole("admin");
  const f = z
    .object({
      employeeAccess: rub,
      subscription: rub,
      subscriptionDays: z.coerce.number().int(),
      includedContacts: z.coerce.number().int(),
      extraContact: rub,
    })
    .safeParse(Object.fromEntries(form.entries()));
  if (!f.success) return { error: "Проверьте значения: нужны числа в допустимых пределах." };
  const res = await setPricing(admin.id, {
    employeeAccessKopecks: Math.round(f.data.employeeAccess * 100),
    subscriptionKopecks: Math.round(f.data.subscription * 100),
    subscriptionDays: f.data.subscriptionDays,
    includedContacts: f.data.includedContacts,
    extraContactKopecks: Math.round(f.data.extraContact * 100),
  });
  return res.ok ? { ok: true } : { error: res.error };
}
