"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { endSession, homeFor, startSession } from "./dal";
import { rateLimit } from "./rate-limit";
import { requestPasswordReset, resetPassword } from "./password-reset";
import { authenticate, EmailTakenError, registerUser } from "./service";
import { echoValues, forgotSchema, formToObject, loginSchema, resetSchema, registerSchema, zodState, type FormState } from "./schemas";

const WINDOW = 15 * 60 * 1000;

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

export async function registerAction(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = registerSchema.safeParse(formToObject(form, ["acceptService", "acceptMarketing"]));
  if (!parsed.success) return zodState(parsed.error, form);

  const limit = await rateLimit(`register:${await clientIp()}`, 10, 60 * 60 * 1000);
  if (!limit.ok) return { error: "Слишком много попыток регистрации. Попробуйте позже.", values: echoValues(form) };

  try {
    const user = await registerUser(parsed.data);
    await startSession(user.id);
    redirect(homeFor(user.role));
  } catch (e) {
    if (e instanceof EmailTakenError) {
      return { fieldErrors: { email: ["Этот email уже зарегистрирован. Попробуйте войти."] }, values: echoValues(form) };
    }
    throw e; // redirect() и непредвиденные ошибки обрабатывает Next.js
  }
}

export async function loginAction(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse(formToObject(form));
  if (!parsed.success) return zodState(parsed.error, form);

  const byEmail = await rateLimit(`login:${parsed.data.email}`, 5, WINDOW);
  const byIp = await rateLimit(`login-ip:${await clientIp()}`, 30, WINDOW);
  if (!byEmail.ok || !byIp.ok) {
    return { error: "Слишком много попыток входа. Подождите несколько минут и повторите.", values: echoValues(form) };
  }

  const user = await authenticate(parsed.data.email, parsed.data.password);
  if (!user) return { error: "Неверный email или пароль.", values: echoValues(form) };

  await startSession(user.id);
  redirect(homeFor(user.role));
}

export async function logoutAction(): Promise<void> {
  await endSession();
  redirect("/");
}


export async function forgotPasswordAction(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = forgotSchema.safeParse(formToObject(form));
  if (!parsed.success) return zodState(parsed.error, form);

  const byEmail = await rateLimit(`reset:${parsed.data.email}`, 3, 60 * 60 * 1000);
  const byIp = await rateLimit(`reset-ip:${await clientIp()}`, 10, 60 * 60 * 1000);
  if (!byEmail.ok || !byIp.ok) return { error: "Слишком много запросов. Попробуйте позже.", values: echoValues(form) };

  await requestPasswordReset(parsed.data.email);
  // Ответ одинаков для существующих и несуществующих адресов.
  return { ok: true };
}

export async function resetPasswordAction(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = resetSchema.safeParse(formToObject(form));
  if (!parsed.success) return zodState(parsed.error, form);

  const limit = await rateLimit(`reset-apply:${await clientIp()}`, 20, 60 * 60 * 1000);
  if (!limit.ok) return { error: "Слишком много попыток. Попробуйте позже." };

  const done = await resetPassword(parsed.data.token, parsed.data.password);
  if (!done) return { error: "Ссылка недействительна или устарела. Запросите восстановление ещё раз." };
  return { ok: true };
}
