import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { POST as webhook } from "@/app/api/billing/webhook/[provider]/route";
import { hasEmployeeAccess, startEmployeePayment } from "@/modules/billing/access";
import {
  contactUsage,
  getActiveSubscription,
  isContactUnlocked,
  quoteContact,
  startExtraContactPayment,
  startSubscriptionPayment,
  unlockContact,
} from "@/modules/billing/contacts";
import { createPayment, processPaymentEvent } from "@/modules/billing/payments";
import { getProvider } from "@/modules/billing/provider";
import { SANDBOX_SIGNATURE_HEADER, signSandboxBody } from "@/modules/billing/providers/sandbox";
import { DEFAULT_PRICING, getPricing, setPricing } from "@/modules/billing/settings";
import { getDb, schema } from "@/server/db";

let n = 0;
async function user(role: "employee" | "employer" | "admin" = "employee") {
  const db = await getDb();
  const [u] = await db
    .insert(schema.users)
    .values({ email: `billing-${++n}@example.com`, passwordHash: "x", role })
    .returning({ id: schema.users.id });
  return u.id;
}

async function providerIdOf(paymentId: string) {
  const db = await getDb();
  const [p] = await db.select().from(schema.payments).where(eq(schema.payments.id, paymentId));
  return p;
}

async function settle(paymentId: string, status: "succeeded" | "failed" | "canceled" = "succeeded", eventId = `ev_${Math.random()}`) {
  const p = await providerIdOf(paymentId);
  return processPaymentEvent("sandbox", { eventId, providerPaymentId: p.providerPaymentId!, status, amountKopecks: p.amountKopecks });
}

async function buySubscription(employer: string) {
  const { redirectUrl } = await startSubscriptionPayment(employer);
  const db = await getDb();
  const [p] = await db.select().from(schema.payments).where(eq(schema.payments.userId, employer));
  void redirectUrl;
  return (await db.select().from(schema.payments).where(eq(schema.payments.userId, employer))).filter((x) => x.status === "pending" && x.kind === "employer_subscription").at(-1) ?? p;
}

beforeAll(async () => {
  await getDb();
});
beforeEach(async () => {
  delete process.env.BILLING_PROVIDER;
  const db = await getDb();
  await db.delete(schema.adminSettings);
});

describe("провайдер и подпись", () => {
  it("тестовый режим явный, а в production без провайдера оплаты нет", () => {
    expect(getProvider()?.isTest).toBe(true);
    const prev = process.env.NODE_ENV;
    (process.env as Record<string, string>).NODE_ENV = "production";
    expect(getProvider()).toBeNull();
    process.env.BILLING_PROVIDER = "sandbox";
    expect(getProvider()?.id).toBe("sandbox");
    (process.env as Record<string, string>).NODE_ENV = prev!;
  });

  it("проверка подписи webhook", () => {
    const provider = getProvider()!;
    const body = JSON.stringify({ eventId: "e1", providerPaymentId: "p1", status: "succeeded" });
    const ok = provider.verifyWebhook(body, new Headers({ [SANDBOX_SIGNATURE_HEADER]: signSandboxBody(body) }));
    expect(ok).toMatchObject({ eventId: "e1", status: "succeeded" });
    expect(provider.verifyWebhook(body + " ", new Headers({ [SANDBOX_SIGNATURE_HEADER]: signSandboxBody(body) }))).toBeNull();
    expect(provider.verifyWebhook(body, new Headers())).toBeNull();
    expect(provider.verifyWebhook(body, new Headers({ [SANDBOX_SIGNATURE_HEADER]: "zz" }))).toBeNull();
    const bad = JSON.stringify({ eventId: 1, providerPaymentId: "p", status: "succeeded" });
    expect(provider.verifyWebhook(bad, new Headers({ [SANDBOX_SIGNATURE_HEADER]: signSandboxBody(bad) }))).toBeNull();
  });
});

describe("доступ сотрудника за 500 ₽", () => {
  it("по умолчанию 500 ₽; доступ выдаётся только после подтверждённой оплаты", async () => {
    expect((await getPricing()).employeeAccessKopecks).toBe(50_000);
    const u = await user();
    expect(await hasEmployeeAccess(u)).toBe(false);

    const started = await startEmployeePayment(u);
    expect(started).toMatchObject({ already: false });
    const db = await getDb();
    const [p] = await db.select().from(schema.payments).where(eq(schema.payments.userId, u));
    expect(p).toMatchObject({ status: "pending", kind: "employee_access", amountKopecks: 50_000, provider: "sandbox" });
    expect(await hasEmployeeAccess(u)).toBe(false); // создание платежа и переход на страницу оплаты ничего не дают

    expect(await settle(p.id, "failed")).toBe("applied");
    expect(await hasEmployeeAccess(u)).toBe(false);
  });

  it("успех выдаёт доступ один раз; повтор события, повторный успех и «провал» после оплаты ничего не меняют", async () => {
    const u = await user();
    await startEmployeePayment(u);
    const db = await getDb();
    const [p] = await db.select().from(schema.payments).where(eq(schema.payments.userId, u));

    expect(await settle(p.id, "succeeded", "evt-1")).toBe("applied");
    expect(await hasEmployeeAccess(u)).toBe(true);
    expect(await settle(p.id, "succeeded", "evt-1")).toBe("duplicate");
    expect(await settle(p.id, "succeeded", "evt-2")).toBe("ignored");
    expect(await settle(p.id, "failed", "evt-3")).toBe("ignored");
    expect((await providerIdOf(p.id)).status).toBe("succeeded");
    expect(await db.select().from(schema.employeeAccess).where(eq(schema.employeeAccess.userId, u))).toHaveLength(1);
    expect(await startEmployeePayment(u)).toEqual({ already: true });
  });

  it("несовпадение суммы или неизвестный платёж доступ не дают", async () => {
    const u = await user();
    await startEmployeePayment(u);
    const db = await getDb();
    const [p] = await db.select().from(schema.payments).where(eq(schema.payments.userId, u));
    expect(await processPaymentEvent("sandbox", { eventId: "m1", providerPaymentId: p.providerPaymentId!, status: "succeeded", amountKopecks: 100 })).toBe("amount_mismatch");
    expect(await hasEmployeeAccess(u)).toBe(false);
    expect((await providerIdOf(p.id)).status).toBe("failed");
    expect(await processPaymentEvent("sandbox", { eventId: "m2", providerPaymentId: "sbx_unknown", status: "succeeded" })).toBe("unknown_payment");
  });

  it("webhook: неверная подпись отклоняется, верная работает, повтор безопасен", async () => {
    const u = await user();
    await startEmployeePayment(u);
    const db = await getDb();
    const [p] = await db.select().from(schema.payments).where(eq(schema.payments.userId, u));
    const body = JSON.stringify({ eventId: "wh-1", providerPaymentId: p.providerPaymentId, status: "succeeded", amountKopecks: p.amountKopecks });
    const call = (b: string, sig: string) =>
      webhook(new Request("http://localhost/api/billing/webhook/sandbox", { method: "POST", body: b, headers: { [SANDBOX_SIGNATURE_HEADER]: sig } }), {
        params: Promise.resolve({ provider: "sandbox" }),
      });

    expect((await call(body, "00")).status).toBe(401);
    expect(await hasEmployeeAccess(u)).toBe(false);
    const good = await call(body, signSandboxBody(body));
    expect(good.status).toBe(200);
    expect(await good.json()).toEqual({ outcome: "applied" });
    expect(await hasEmployeeAccess(u)).toBe(true);
    expect(await (await call(body, signSandboxBody(body))).json()).toEqual({ outcome: "duplicate" });

    const other = await webhook(new Request("http://localhost/x", { method: "POST", body }), { params: Promise.resolve({ provider: "yookassa" }) });
    expect(other.status).toBe(404);
  });

  it("если администратор сделал функцию бесплатной, доступ выдаётся сразу и фиксируется", async () => {
    const admin = await user("admin");
    expect((await setPricing(admin, { ...DEFAULT_PRICING, employeeAccessKopecks: 0 })).ok).toBe(true);
    const u = await user();
    const res = await startEmployeePayment(u);
    expect(res).toMatchObject({ already: false, redirectUrl: "/me" });
    expect(await hasEmployeeAccess(u)).toBe(true);
    const db = await getDb();
    const [p] = await db.select().from(schema.payments).where(eq(schema.payments.userId, u));
    expect(p).toMatchObject({ provider: "free", status: "succeeded", amountKopecks: 0 });
  });
});

describe("тарифы", () => {
  it("значения по умолчанию, проверка границ и аудит", async () => {
    const admin = await user("admin");
    expect(await getPricing()).toEqual(DEFAULT_PRICING);
    expect(DEFAULT_PRICING).toMatchObject({ subscriptionKopecks: 100_000, includedContacts: 50, extraContactKopecks: 20_000 });
    expect((await setPricing(admin, { ...DEFAULT_PRICING, subscriptionKopecks: -1 })).ok).toBe(false);
    expect((await setPricing(admin, { ...DEFAULT_PRICING, subscriptionDays: 0 })).ok).toBe(false);
    expect((await setPricing(admin, { ...DEFAULT_PRICING, includedContacts: 1.5 })).ok).toBe(false);
    expect((await setPricing(admin, { ...DEFAULT_PRICING, subscriptionKopecks: 150_000 })).ok).toBe(true);
    expect((await getPricing()).subscriptionKopecks).toBe(150_000);
    const db = await getDb();
    const audit = await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.type, "pricing.updated"));
    expect(audit.length).toBeGreaterThan(0);
  });

  it("смена тарифа не меняет уже купленный период", async () => {
    const admin = await user("admin");
    const employer = await user("employer");
    const p = await buySubscription(employer);
    await settle(p.id);
    await setPricing(admin, { ...DEFAULT_PRICING, subscriptionKopecks: 500_000, includedContacts: 5, extraContactKopecks: 99_900 });
    const sub = (await getActiveSubscription(employer))!;
    expect(sub).toMatchObject({ priceKopecks: 100_000, includedContacts: 50, extraContactKopecks: 20_000 });
    const next = await buySubscription(employer);
    expect(next.amountKopecks).toBe(500_000);
  });
});

describe("подписка и контакты", () => {
  it("без подписки контакты закрыты", async () => {
    const employer = await user("employer");
    const candidate = await user();
    expect(await quoteContact(employer, candidate)).toEqual({ state: "no_subscription" });
    expect(await unlockContact(employer, candidate)).toEqual({ state: "no_subscription" });
    expect(await isContactUnlocked(employer, candidate)).toBe(false);
  });

  it("неоплаченная подписка не активна; оплаченная действует 30 дней; продление идёт после конца текущего периода", async () => {
    const employer = await user("employer");
    const first = await buySubscription(employer);
    expect(await getActiveSubscription(employer)).toBeNull();
    await settle(first.id);
    const sub1 = (await getActiveSubscription(employer))!;
    expect(sub1.periodEnd.getTime() - sub1.periodStart.getTime()).toBe(30 * 86_400_000);

    const second = await buySubscription(employer);
    await settle(second.id);
    const db = await getDb();
    const periods = (await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.userId, employer))).sort(
      (a, b) => a.periodStart.getTime() - b.periodStart.getTime(),
    );
    expect(periods).toHaveLength(2);
    expect(periods[1].periodStart.getTime()).toBe(periods[0].periodEnd.getTime());
    expect((await getActiveSubscription(employer))!.id).toBe(periods[0].id);
  });

  it("первые 50 уникальных контактов включены, 51-й требует оплаты; повторное открытие бесплатно; параллельные запросы лимит не превышают", async () => {
    const employer = await user("employer");
    await settle((await buySubscription(employer)).id);
    const candidates = await Promise.all(Array.from({ length: 55 }, () => user()));

    const results = await Promise.all(candidates.map((c) => unlockContact(employer, c)));
    expect(results.filter((r) => r.state === "unlocked")).toHaveLength(50);
    const blocked = results.filter((r) => r.state === "payment_required");
    expect(blocked).toHaveLength(5);
    expect(blocked[0]).toMatchObject({ priceKopecks: 20_000 });

    const usage = (await contactUsage(employer))!;
    expect(usage.includedUsed).toBe(50);

    const opened = candidates.filter((_, i) => results[i].state === "unlocked")[0];
    expect(await unlockContact(employer, opened)).toEqual({ state: "already" });
    expect((await contactUsage(employer))!.includedUsed).toBe(50);

    const closed = candidates.filter((_, i) => results[i].state === "payment_required")[0];
    expect(await isContactUnlocked(employer, closed)).toBe(false);
    expect(await quoteContact(employer, closed)).toEqual({ state: "payment_required", priceKopecks: 20_000 });
  });

  it("контакт сверх лимита открывается только после подтверждённой оплаты 200 ₽ и не дублируется", async () => {
    const admin = await user("admin");
    await setPricing(admin, { ...DEFAULT_PRICING, includedContacts: 1 });
    const employer = await user("employer");
    await settle((await buySubscription(employer)).id);
    const [a, b] = await Promise.all([user(), user()]);
    expect((await unlockContact(employer, a)).state).toBe("unlocked");

    const started = await startExtraContactPayment(employer, b);
    expect(started).toMatchObject({ state: "redirect" });
    expect(await isContactUnlocked(employer, b)).toBe(false); // деньги ещё не подтверждены

    const db = await getDb();
    const pending = (await db.select().from(schema.payments).where(eq(schema.payments.userId, employer))).find((p) => p.kind === "extra_contact")!;
    expect(pending).toMatchObject({ amountKopecks: 20_000, status: "pending" });
    await settle(pending.id, "failed");
    expect(await isContactUnlocked(employer, b)).toBe(false);

    await startExtraContactPayment(employer, b);
    const again = (await db.select().from(schema.payments).where(eq(schema.payments.userId, employer))).filter((p) => p.kind === "extra_contact" && p.status === "pending").at(-1)!;
    await settle(again.id, "succeeded", "extra-1");
    await settle(again.id, "succeeded", "extra-1");
    expect(await isContactUnlocked(employer, b)).toBe(true);
    const unlocks = await db.select().from(schema.contactUnlocks).where(eq(schema.contactUnlocks.employerUserId, employer));
    expect(unlocks.map((u) => u.chargeKind).sort()).toEqual(["included", "paid"]);

    expect(await startExtraContactPayment(employer, b)).toEqual({ state: "already" });
    expect(await startExtraContactPayment(employer, a)).toEqual({ state: "already" });
  });

  it("просроченная подписка закрывает новые контакты; оплата после истечения не теряется молча", async () => {
    const admin = await user("admin");
    await setPricing(admin, { ...DEFAULT_PRICING, includedContacts: 0 });
    const employer = await user("employer");
    const cand = await user();
    await settle((await buySubscription(employer)).id);
    expect(await startExtraContactPayment(employer, cand)).toMatchObject({ state: "redirect" });
    const db = await getDb();
    const pay = (await db.select().from(schema.payments).where(eq(schema.payments.userId, employer))).find((p) => p.kind === "extra_contact")!;

    await db.update(schema.subscriptions).set({ periodEnd: new Date(Date.now() - 1000), periodStart: new Date(Date.now() - 86_400_000) }).where(eq(schema.subscriptions.userId, employer));
    expect(await getActiveSubscription(employer)).toBeNull();
    expect(await unlockContact(employer, cand)).toEqual({ state: "no_subscription" });

    await settle(pay.id);
    expect(await isContactUnlocked(employer, cand)).toBe(false);
    expect((await providerIdOf(pay.id)).meta).toMatchObject({ needsReview: true });
  });
});

describe("создание платежа без провайдера", () => {
  it("в production без настроенного провайдера платёж не создаётся", async () => {
    const prev = process.env.NODE_ENV;
    (process.env as Record<string, string>).NODE_ENV = "production";
    const u = await user();
    await expect(createPayment({ userId: u, kind: "employee_access", amountKopecks: 50_000, description: "x", returnPath: "/me" })).rejects.toThrow("billing_unavailable");
    (process.env as Record<string, string>).NODE_ENV = prev!;
    const db = await getDb();
    expect(await db.select().from(schema.payments).where(eq(schema.payments.userId, u))).toHaveLength(0);
  });
});
