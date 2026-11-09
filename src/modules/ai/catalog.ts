import { providerKey, providerModel, type ProviderId } from "./config";
import { anthropic } from "./providers/anthropic";
import { gigachat, gigachatHealth, gigachatModels } from "./providers/gigachat";
import { openai } from "./providers/openai";
import { yandex } from "./providers/yandex";
import { yandexai, yandexAiHealth, yandexAiModels } from "./providers/yandexai";
import type { HealthStatus, ProviderModel, ProviderResult } from "./providers/types";

/**
 * Единый слой над провайдерами: у всех одинаковые операции — listModels, complete, healthCheck.
 * Транспортный уровень (providers/*) отвечает только за формат запроса; всё общее живёт здесь.
 */
export type UnifiedProvider = {
  id: ProviderId;
  label: string;
  /** Модели провайдера: живой запрос; пустой список, если ключа нет. */
  listModels(opts?: { signal?: AbortSignal }): Promise<ProviderModel[]>;
  /** Единая точка вызова: текст запроса и параметры. */
  complete(prompt: string, opts?: UnifiedCompleteOptions): Promise<ProviderResult>;
  /** Готовность провайдера: ключи на месте и провайдер отвечает. */
  healthCheck(opts?: { signal?: AbortSignal }): Promise<HealthStatus>;
};

export type UnifiedCompleteOptions = {
  /** Системная инструкция. */
  system?: string;
  /** Модель: если не задана, берётся из окружения. */
  model?: string;
  /** Лимит ответа. */
  maxTokens?: number;
  /** История диалога: сообщения идут в том же порядке. */
  messages?: { role: "user" | "assistant"; content: string }[];
  signal?: AbortSignal;
};

/** Провайдер не настроен: не хватает ключа или модели. */
const notConfigured = (what: string): HealthStatus => ({ ok: false, detail: `Не настроен: нет ${what}.` });

/** Провайдер ответил ошибкой — показываем только код, без текста ответа и ключей. */
const failed = (status: number): HealthStatus => ({
  ok: false,
  detail: status === 401 || status === 403 ? "Ключ отклонён провайдером (401/403)." : `Провайдер ответил ошибкой ${status}.`,
});

/** Ошибка сети или таймаут. */
const unreachable = (e: unknown): HealthStatus => ({
  ok: false,
  detail: `Провайдер недоступен: ${(e as { cause?: { code?: string } })?.cause?.code ?? (e as Error)?.message ?? "сетевая ошибка"}.`,
});

type Spec = {
  label: string;
  /** Что должно быть настроено, чтобы провайдер работал. */
  requires: (id: ProviderId) => string | undefined;
  models: (id: ProviderId, signal?: AbortSignal) => Promise<ProviderModel[]>;
  check?: (id: ProviderId, signal?: AbortSignal) => Promise<void>;
};

const SPECS: Record<ProviderId, Spec> = {
  anthropic: {
    label: "Anthropic (Claude)",
    requires: () => (providerKey("anthropic") ? undefined : "ANTHROPIC_API_KEY"),
    models: async () => [],
    check: async (id, signal) => {
      const res = await fetch("https://api.anthropic.com/v1/models?limit=1", {
        headers: { "x-api-key": providerKey(id) ?? "", "anthropic-version": "2023-06-01" },
        signal,
      });
      if (!res.ok) throw Object.assign(new Error("anthropic models"), { status: res.status });
    },
  },
  openai: {
    label: "OpenAI",
    requires: () => (providerKey("openai") ? undefined : "OPENAI_API_KEY"),
    models: async () => [],
    check: async (id, signal) => {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${providerKey(id) ?? ""}` },
        signal,
      });
      if (!res.ok) throw Object.assign(new Error("openai models"), { status: res.status });
    },
  },
  gigachat: {
    label: "GigaChat (Сбер)",
    requires: (id) => (providerKey(id) ? undefined : "GIGACHAT_AUTH_KEY"),
    models: (id, signal) => gigachatModels(signal),
    check: (id, signal) => gigachatHealth(signal),
  },
  yandexai: {
    label: "YandexGPT (AI Studio)",
    requires: (id) => {
      if (!providerKey(id)) return "YANDEX_AI_KEY";
      if (!process.env.YANDEX_AI_FOLDER?.trim()) return "YANDEX_AI_FOLDER";
      return undefined;
    },
    models: (id, signal) => yandexAiModels(signal),
    check: (id, signal) => yandexAiHealth(signal),
  },
  yandex: {
    label: "YandexGPT (старый API)",
    requires: (id) => (providerKey(id) ? undefined : "YANDEX_API_KEY"),
    models: async () => [],
  },
};

/** Транспорт конкретного провайдера: из него единый слой делает вызов. */
const TRANSPORT = { anthropic, openai, gigachat, yandexai, yandex } as const;

/** Список провайдеров с их названиями — для выпадающих списков в админке. */
export const PROVIDER_LABELS: { id: ProviderId; label: string }[] = (Object.keys(SPECS) as ProviderId[]).map((id) => ({ id, label: SPECS[id].label }));

/** Единый слой: один объект на провайдера с одинаковыми операциями. */
export const unified: Record<ProviderId, UnifiedProvider> = Object.fromEntries(
  (Object.keys(SPECS) as ProviderId[]).map((id) => {
    const spec = SPECS[id];
    const entry: UnifiedProvider = {
      id,
      label: spec.label,
      async listModels(opts) {
        const missing = spec.requires(id);
        if (missing) return [];
        try {
          return await spec.models(id, opts?.signal);
        } catch {
          return [];
        }
      },
      async complete(prompt, opts) {
        const model = opts?.model ?? providerModel(id);
        if (!model) throw new Error(`${id}: не задана модель`);
        const res = await TRANSPORT[id].complete({
          model,
          system: opts?.system ?? "",
          messages: opts?.messages?.length ? opts.messages : [{ role: "user", content: prompt }],
          maxTokens: opts?.maxTokens ?? 1200,
          signal: opts?.signal ?? new AbortController().signal,
        });
        return res;
      },
      async healthCheck(opts) {
        const missing = spec.requires(id);
        if (missing) return notConfigured(missing);
        if (!spec.check) return { ok: true, detail: "Ключ задан." };
        try {
          await spec.check(id, opts?.signal);
          return { ok: true, detail: "Провайдер отвечает." };
        } catch (e) {
          const status = (e as { status?: number }).status;
          return typeof status === "number" ? failed(status) : unreachable(e);
        }
      },
    };
    return [id, entry];
  }),
) as Record<ProviderId, UnifiedProvider>;
