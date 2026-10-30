/** Куда вернуть пользователя после оплаты. Адрес берётся только из разрешённого шаблона, произвольные адреса игнорируются. */
const CANDIDATE_PAGE = /^\/company\/vacancies\/[0-9a-f-]{36}\/candidates\/[0-9a-f-]{36}$/;

export const isSafeReturn = (v: unknown): v is string => typeof v === "string" && CANDIDATE_PAGE.test(v);

export function returnPathFor(p: { kind: "employee_access" | "employer_subscription" | "extra_contact"; meta: Record<string, unknown> }): string {
  if (p.kind === "employee_access") return "/me";
  if (p.kind === "extra_contact" && isSafeReturn(p.meta.returnTo)) return p.meta.returnTo;
  return "/company/billing";
}
