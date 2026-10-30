import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { requireRole } from "@/modules/auth/dal";
import type { SessionUser } from "@/modules/auth/session-store";
import { getDb, schema } from "@/server/db";
import { createPayment } from "./payments";
import { getPricing } from "./settings";

export async function hasEmployeeAccess(userId: string): Promise<boolean> {
  const db = await getDb();
  const [row] = await db.select({ userId: schema.employeeAccess.userId }).from(schema.employeeAccess).where(eq(schema.employeeAccess.userId, userId));
  return Boolean(row);
}

/**
 * Единая проверка платного доступа сотрудника: тесты, резюме, AI-консультант и всё, что за ними.
 * Вызывается в страницах и серверных действиях; без оплаты ведёт на страницу оплаты.
 */
export async function requireEmployeeAccess(): Promise<SessionUser> {
  const user = await requireRole("employee");
  if (!(await hasEmployeeAccess(user.id))) redirect("/me/pay");
  return user;
}

export async function startEmployeePayment(userId: string): Promise<{ already: true } | { already: false; redirectUrl: string }> {
  if (await hasEmployeeAccess(userId)) return { already: true };
  const { employeeAccessKopecks } = await getPricing();
  const { redirectUrl } = await createPayment({
    userId,
    kind: "employee_access",
    amountKopecks: employeeAccessKopecks,
    description: "Доступ к тестам, резюме и AI-консультанту",
    returnPath: "/me",
  });
  return { already: false, redirectUrl };
}
