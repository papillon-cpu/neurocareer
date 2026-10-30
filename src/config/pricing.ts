// Стартовые параметры бизнес-модели. На этапе 8 станут настройками в БД (AdminSettings).
export const defaultPricing = {
  currency: "RUB",
  subscriptionPriceRub: 1000,
  subscriptionPeriodDays: 30,
  includedContacts: 50,
  extraContactPriceRub: 200,
} as const;

export function formatRub(value: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(value);
}
