import { providerKey } from "../config";
import { secureFetch } from "./http";
import type { Provider } from "./types";

/**
 * YandexGPT в AI Studio: OpenAI-совместимый API https://ai.api.cloud.yandex.net/v1.
 * Ключ — API-ключ сервисного аккаунта (роль ai.languageModels.user), каталог — folder id.
 * Модель указывается полностью: gpt://<folder>/<model> (например gpt://<folder>/yandexgpt-5.1).
 */
const BASE_URL = "https://ai.api.cloud.yandex.net/v1";

const base = () => (process.env.YANDEX_AI_BASE_URL?.trim() || BASE_URL).replace(/\/$/, "");

/** Заголовки AI Studio: ключ в Api-Key, каталог в OpenAI-Project. */
function headers(folder: string | undefined): Record<string, string> {
  const h: Record<string, string> = { Authorization: `Api-Key ${providerKey("yandexai")}`, "Content-Type": "application/json" };
  if (folder) h["OpenAI-Project"] = folder;
  return h;
}

/** Идентификатор каталога из настроек. */
export function yandexAiFolder(): string | undefined {
  return process.env.YANDEX_AI_FOLDER?.trim() || undefined;
}

/**
 * Модель для запроса. Если задана полная (gpt://...), берём её; иначе собираем из каталога и названия.
 */
export function yandexAiModelUri(model: string): string {
  if (model.startsWith("gpt://")) return model;
  const folder = yandexAiFolder();
  return folder ? `gpt://${folder}/${model}` : model;
}

export const yandexai: Provider = {
  async complete({ model, system, messages, maxTokens, signal }) {
    const res = await secureFetch(`${base()}/chat/completions`, {
      method: "POST",
      headers: headers(yandexAiFolder()),
      body: JSON.stringify({
        model: yandexAiModelUri(model),
        messages: [{ role: "system", content: system }, ...messages],
        max_tokens: maxTokens,
        stream: false,
      }),
      signal,
    });
    if (!res.ok) throw Object.assign(new Error("yandexai chat"), { status: res.status });
    const j = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
    return { text: j.choices?.[0]?.message?.content ?? "", inputTokens: j.usage?.prompt_tokens ?? 0, outputTokens: j.usage?.completion_tokens ?? 0 };
  },
};

/** Модели AI Studio, доступные по текущему ключу (живой запрос к провайдеру). */
export async function yandexAiModels(signal?: AbortSignal): Promise<{ id: string; label: string }[]> {
  const res = await secureFetch(`${base()}/models`, {
    headers: { ...headers(yandexAiFolder()), Accept: "application/json" },
    signal,
  });
  if (!res.ok) throw Object.assign(new Error("yandexai models"), { status: res.status });
  const j = (await res.json()) as { data?: { id?: string; name?: string }[] };
  return (j.data ?? []).map((m) => ({ id: m.id ?? m.name ?? "", label: m.name ?? m.id ?? "" })).filter((m) => m.id);
}

/** Проверка связи с AI Studio: ключ принят и список моделей отдан. */
export async function yandexAiHealth(signal?: AbortSignal): Promise<void> {
  await yandexAiModels(signal);
}
