"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { endSession, getCurrentUser, requireRole } from "@/modules/auth/dal";
import { rateLimit } from "@/modules/auth/rate-limit";
import { echoValues, type FormState } from "@/modules/auth/schemas";
import { requireEmployeeAccess } from "@/modules/billing/access";
import * as service from "./service";

const MESSAGES: Record<string, string> = {
  no_consent: "Нужно поставить отметку согласия.",
  bad_version: "Выберите версию резюме из списка.",
  not_reviewed: "Эта версия резюме ещё не проверена. Откройте её в редакторе и подтвердите проверку.",
  no_headline: "Заполните «Специализацию» в профиле: без неё профиль нельзя опубликовать.",
};

/** Публикация и выбор контактов требуют оплаченного доступа (резюме создаётся там). */
export async function publishProfileAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireEmployeeAccess();
  const id = z.uuid().safeParse(form.get("resumeVersionId"));
  if (!id.success) return { error: MESSAGES.bad_version };
  const res = await service.publishProfile(user.id, { resumeVersionId: id.data, acceptPublication: form.get("acceptPublication") === "on" });
  revalidatePath("/me", "layout");
  return res.ok ? { ok: true } : { error: MESSAGES[res.error], values: echoValues(form) };
}

export async function saveSharingAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireEmployeeAccess();
  const res = await service.saveSharing(user.id, {
    shareEmail: form.get("shareEmail") === "on",
    sharePhone: form.get("sharePhone") === "on",
    acceptSharing: form.get("acceptSharing") === "on",
  });
  revalidatePath("/me", "layout");
  return res.ok ? { ok: true } : { error: MESSAGES.no_consent, values: echoValues(form) };
}

/* Скрытие, отзыв и удаление доступны всегда и от оплаты не зависят. */

export async function hideProfileAction(form: FormData): Promise<void> {
  const user = await requireRole("employee");
  await service.hideProfile(user.id, { revokeConsent: form.get("revoke") === "yes" });
  revalidatePath("/me", "layout");
}

export async function revokeSharingAction(): Promise<void> {
  const user = await requireRole("employee");
  await service.revokeSharing(user.id);
  revalidatePath("/me", "layout");
}

export async function deleteAccountAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "admin") return { error: "Аккаунт администратора удаляется отдельно." };
  if (!(await rateLimit(`delete:${user.id}`, 5, 15 * 60 * 1000)).ok) return { error: "Слишком много попыток. Подождите немного." };
  if (form.get("confirm") !== "УДАЛИТЬ") return { error: "Введите слово УДАЛИТЬ заглавными буквами." };

  const password = form.get("password");
  const res = await service.deleteAccount(user.id, typeof password === "string" ? password : "");
  if (!res.ok) return { error: res.error === "wrong_password" ? "Неверный пароль." : "Аккаунт не найден." };
  await endSession();
  redirect("/?deleted=1");
}
