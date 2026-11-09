"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/modules/auth/dal";
import type { FormState } from "@/modules/auth/schemas";
import { unified, PROVIDER_LABELS } from "./catalog";
import { setAiSettings } from "./settings";
import type { ProviderId } from "./config";

/** Сохраняет выбранные администратором провайдера и модель. */
export async function saveAiSettingsAction(_prev: FormState, form: FormData): Promise<FormState> {
  const admin = await requireRole("admin");
  const provider = String(form.get("provider") ?? "");
  const model = String(form.get("model") ?? "").trim();
  if (!PROVIDER_LABELS.some((p) => p.id === provider)) return { error: "Выберите провайдера из списка." };
  const res = await setAiSettings(admin.id, { provider: provider as ProviderId, model: model || undefined });
  if (!res.ok) return { error: res.error };
  revalidatePath("/admin/ai");
  return { ok: true };
}

/** Модели выбранного провайдера: живой запрос, поэтому делается по кнопке, а не при рендере. */
export async function loadProviderModelsAction(providerId: string): Promise<{ ok: true; models: { id: string; label: string }[] } | { ok: false; error: string }> {
  await requireRole("admin");
  const entry = unified[providerId as ProviderId];
  if (!entry) return { ok: false, error: "Неизвестный провайдер." };
  const models = await entry.listModels();
  if (!models.length) {
    const health = await entry.healthCheck();
    return { ok: false, error: health.detail };
  }
  return { ok: true, models };
}

/** Проверка связи с провайдером по его ключу из окружения. */
export async function checkProviderAction(providerId: string): Promise<{ ok: boolean; detail: string }> {
  await requireRole("admin");
  const entry = unified[providerId as ProviderId];
  if (!entry) return { ok: false, detail: "Неизвестный провайдер." };
  return entry.healthCheck();
}
