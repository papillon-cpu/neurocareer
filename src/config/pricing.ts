// Стартовые параметры бизнес-модели. Рабочие значения хранятся в БД (admin_settings) и меняются администратором;
// эти — значения по умолчанию, пока администратор ничего не менял.
export const defaultPricing = {
  currency: "RUB",
  employeeAccessPriceRub: 500,
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

/** Деньги в системе хранятся в копейках. */
export const formatKopecks = (kopecks: number): string =>
  new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: kopecks % 100 === 0 ? 0 : 2 }).format(
    kopecks / 100,
  );
