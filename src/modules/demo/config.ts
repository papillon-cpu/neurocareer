import type { Role } from "@/server/db/schema";

/**
 * Демо-режим: кнопка быстрого переключения между админкой, кабинетом работодателя и кабинетом сотрудника.
 * Включён при разработке и на тестовом стенде с DEMO_MODE=1; в production без этой переменной его нет совсем,
 * потому что переключатель входит в чужие кабинеты без пароля.
 */
export const demoEnabled = (): boolean => process.env.NODE_ENV !== "production" || process.env.DEMO_MODE === "1";

/** Только эти заранее созданные демо-аккаунты (npm run db:seed -- --demo); произвольные адреса не принимаются. */
export const DEMO_ACCOUNTS: Record<Role, string> = {
  admin: "demo-admin@example.com",
  employer: "demo-employer@example.com",
  employee: "demo-employee@example.com",
};

export const DEMO_LABELS: Record<Role, string> = { admin: "Админ", employer: "Работодатель", employee: "Сотрудник" };
