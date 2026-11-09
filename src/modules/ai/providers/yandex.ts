import { providerKey } from "../config";
import { secureFetch } from "./http";
import type { Provider } from "./types";

/**
 * YandexGPT в старом API Yandex Cloud (foundationModels/v1/completion).
 * Оставлен для совместимости с уже настроенными кабинетами; новые настройки — в провайдере yandexai.
 */
const BASE_URL = "https://ai.api.cloud.yandex.net/foundationModels/v1/completion";

export const yandex: Provider = {
  async complete({ model, system, messages, maxTokens, signal }) {
    const folder = process.env.YANDEX_FOLDER_ID?.trim();
    const url = process.env.YANDEX_BASE_URL?.trim() || BASE_URL;
    const headers: Record<string, string> = { Authorization: `Api-Key ${providerKey("yandex")}`, "Content-Type": "application/json" };
    if (folder) headers["x-folder-id"] = folder;
    const res = await secureFetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        modelUri: model.startsWith("gpt://") ? model : `gpt://${folder}/${model}`,
        completionOptions: { stream: false, temperature: 0.3, maxTokens: String(maxTokens) },
        messages: [{ role: "system", text: system }, ...messages.map((m) => ({ role: m.role, text: m.content }))],
      }),
      signal,
    });
    if (!res.ok) throw Object.assign(new Error("yandex chat"), { status: res.status });
    type Body = { alternatives?: { message?: { text?: string } }[]; usage?: { inputTextTokens?: string; completionTokens?: string } };
    const raw = (await res.json()) as Body & { result?: Body };
    const j = raw.result ?? raw;
    return { text: j.alternatives?.[0]?.message?.text ?? "", inputTokens: Number(j.usage?.inputTextTokens ?? 0), outputTokens: Number(j.usage?.completionTokens ?? 0) };
  },
};
