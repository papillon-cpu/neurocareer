import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/server/db";
import { isConfigured, missingConfig, providerChain, providerModel, type AiTask, type ProviderId } from "./config";

/**
 * Настройки AI, которые выбирает администратор: провайдер и модель.
 * Ключи в базу не попадают: они остаются в переменных окружения на сервере.
 */
export const aiSettingsSchema = z.object({
  provider: z.enum(["anthropic", "openai", "gigachat", "yandexai", "yandex"]).optional(),
  model: z.string().trim().min(1).max(120).optional(),
});

export type AiSettings = z.infer<typeof aiSettingsSchema>;

const KEY = "ai";

export async function getAiSettings(): Promise<AiSettings> {
  const db = await getDb();
  const [row] = await db.select().from(schema.adminSettings).where(eq(schema.adminSettings.key, KEY));
  const parsed = aiSettingsSchema.safeParse((row?.value as object | undefined) ?? {});
  return parsed.success ? parsed.data : {};
}

export async function setAiSettings(adminId: string, input: unknown): Promise<{ ok: true; settings: AiSettings } | { ok: false; error: string }> {
  const parsed = aiSettingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Проверьте провайдера и название модели." };
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx
      .insert(schema.adminSettings)
      .values({ key: KEY, value: parsed.data, updatedBy: adminId })
      .onConflictDoUpdate({ target: schema.adminSettings.key, set: { value: parsed.data, updatedAt: new Date(), updatedBy: adminId } });
    await tx.insert(schema.auditEvents).values({ actorUserId: adminId, type: "ai.settings.updated", meta: parsed.data });
  });
  return { ok: true, settings: parsed.data };
}

/**
 * Цепочка провайдеров с учётом выбора администратора: выбранный провайдер идёт первым.
 * Если у выбранного провайдера нет ключей в окружении, выбор игнорируется и работает цепочка по умолчанию.
 */
export function chainWithSettings(task: AiTask, settings: AiSettings): ProviderId[] {
  const base = providerChain(task);
  const picked = settings.provider;
  if (!picked || !isConfigured(picked)) return base;
  return [picked, ...base.filter((p) => p !== picked)];
}

/** Модель провайдера: выбранная администратором, иначе из окружения. */
export function modelWithSettings(id: ProviderId, settings: AiSettings): string | undefined {
  if (settings.provider === id && settings.model) return settings.model;
  return providerModel(id);
}

/** Какие переменные окружения не хватает: с учётом выбранного администратором провайдера. */
export function missingWithSettings(task: AiTask, settings: AiSettings): string[] {
  const picked = settings.provider;
  if (picked && !isConfigured(picked)) {
    const missing = missingForProvider(picked);
    if (missing.length) return missing;
  }
  return missingConfig(task);
}

/** Провайдер и его недостающие переменные — для подсказок в админке. */
export function missingForProvider(p: ProviderId): string[] {
  const out: string[] = [];
  if (!providerKeyOf(p)) out.push(p === "yandexai" ? "YANDEX_AI_KEY" : p === "gigachat" ? "GIGACHAT_AUTH_KEY" : p === "yandex" ? "YANDEX_API_KEY" : p === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY");
  if (!providerModel(p)) {
    out.push(
      p === "yandexai" ? "YANDEX_AI_MODEL и YANDEX_AI_FOLDER" : p === "gigachat" ? "GIGACHAT_MODEL" : p === "yandex" ? "YANDEX_MODEL и YANDEX_FOLDER_ID" : p === "openai" ? "OPENAI_MODEL" : "ANTHROPIC_MODEL",
    );
  }
  return out;
}

const providerKeyOf = (p: ProviderId) =>
  p === "yandexai"
    ? process.env.YANDEX_AI_KEY?.trim()
    : p === "gigachat"
      ? process.env.GIGACHAT_AUTH_KEY?.trim()
      : p === "yandex"
        ? process.env.YANDEX_API_KEY?.trim()
        : p === "openai"
          ? process.env.OPENAI_API_KEY?.trim()
          : process.env.ANTHROPIC_API_KEY?.trim();
