import { sandboxProvider } from "./providers/sandbox";

export type CheckoutRequest = {
  paymentId: string;
  amountKopecks: number;
  description: string;
};

export type CheckoutResult = { providerPaymentId: string; redirectUrl: string };

export type PaymentEvent = {
  eventId: string;
  providerPaymentId: string;
  status: "succeeded" | "failed" | "canceled";
  amountKopecks?: number;
};

/**
 * Контракт платёжного провайдера. Реальный провайдер (ЮKassa, CloudPayments и т. п.) подключается реализацией
 * этого интерфейса: создать платёж и проверить подпись webhook. Платёж считается оплаченным ТОЛЬКО по событию,
 * прошедшему verifyWebhook; редирект пользователя с сайта провайдера доказательством оплаты не является.
 */
export interface BillingProvider {
  id: string;
  label: string;
  /** Тестовый режим: деньги не списываются. Интерфейс обязан это показывать. */
  isTest: boolean;
  createCheckout(req: CheckoutRequest): Promise<CheckoutResult>;
  /** Возвращает событие, если подпись верна, иначе null. */
  verifyWebhook(rawBody: string, headers: Headers): PaymentEvent | null;
}

/**
 * BILLING_PROVIDER=sandbox включает тестовый режим явно. Если переменная не задана, тестовый режим работает
 * только вне production. В production без настроенного провайдера оплата недоступна, а не имитируется.
 */
export function getProvider(): BillingProvider | null {
  const id = process.env.BILLING_PROVIDER?.trim();
  if (id === "sandbox") return sandboxProvider;
  if (!id && process.env.NODE_ENV !== "production") return sandboxProvider;
  return null; // сюда добавляются реальные провайдеры
}
