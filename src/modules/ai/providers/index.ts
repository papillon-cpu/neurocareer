import { AiProviderError } from "../errors";
import type { ProviderId } from "../config";
import { anthropic } from "./anthropic";
import { gigachat } from "./gigachat";
import { openai } from "./openai";
import { yandex } from "./yandex";
import { yandexai } from "./yandexai";
import type { Provider } from "./types";

export type { ChatMessage, Provider, ProviderModel, ProviderRequest, ProviderResult, HealthStatus } from "./types";

/** Переводит любую ошибку SDK в нашу: что повторять можно, что нельзя. Ключи и тексты в ошибку не попадают. */
export function classifyError(e: unknown): AiProviderError {
  if (e instanceof AiProviderError) return e;
  const err = e as { status?: number; name?: string; code?: string };
  if (err?.name === "AbortError" || err?.name === "APIUserAbortError" || err?.name === "APIConnectionTimeoutError" || err?.code === "ETIMEDOUT") {
    return new AiProviderError("timeout", true);
  }
  const s = err?.status;
  if (s === 429) return new AiProviderError("provider_rate_limited", true);
  if (typeof s === "number" && s >= 500) return new AiProviderError("provider_unavailable", true);
  if (s === 401 || s === 403) return new AiProviderError("auth", false);
  if (typeof s === "number" && s >= 400) return new AiProviderError("bad_request", false);
  if (err?.name?.includes("Connection")) return new AiProviderError("provider_unavailable", true);
  return new AiProviderError("unknown", false);
}

/** Реестр реализаций. Тесты подменяют их заглушками, не обращаясь к сети. */
export const providers: Record<ProviderId, Provider> = { anthropic, openai, gigachat, yandexai, yandex };
