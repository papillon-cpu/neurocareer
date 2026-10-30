import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { BillingProvider, PaymentEvent } from "../provider";

// ТЕСТОВЫЙ провайдер для разработки. Деньги не списываются, это не реальная оплата.
// Подтверждение идёт по тому же пути, что и у настоящего провайдера: подписанное событие → проверка подписи →
// единая обработка с защитой от повторов.

const g = globalThis as unknown as { __sandboxSecret?: string };

function secret(): string {
  const fromEnv = process.env.BILLING_WEBHOOK_SECRET?.trim();
  if (fromEnv) return fromEnv;
  return (g.__sandboxSecret ??= randomBytes(32).toString("hex"));
}

export function signSandboxBody(rawBody: string): string {
  return createHmac("sha256", secret()).update(rawBody).digest("hex");
}

export const SANDBOX_SIGNATURE_HEADER = "x-sandbox-signature";

export const sandboxProvider: BillingProvider = {
  id: "sandbox",
  label: "Тестовый режим",
  isTest: true,

  async createCheckout({ paymentId }) {
    return { providerPaymentId: `sbx_${randomUUID()}`, redirectUrl: `/pay/sandbox/${paymentId}` };
  },

  verifyWebhook(rawBody, headers): PaymentEvent | null {
    const given = headers.get(SANDBOX_SIGNATURE_HEADER) ?? "";
    const expected = signSandboxBody(rawBody);
    const a = Buffer.from(given, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    try {
      const e = JSON.parse(rawBody) as Partial<PaymentEvent>;
      if (
        typeof e.eventId !== "string" ||
        typeof e.providerPaymentId !== "string" ||
        !["succeeded", "failed", "canceled"].includes(String(e.status))
      ) {
        return null;
      }
      return {
        eventId: e.eventId,
        providerPaymentId: e.providerPaymentId,
        status: e.status as PaymentEvent["status"],
        amountKopecks: typeof e.amountKopecks === "number" ? e.amountKopecks : undefined,
      };
    } catch {
      return null;
    }
  },
};
