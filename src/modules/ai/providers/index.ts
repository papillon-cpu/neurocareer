import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { AiProviderError } from "../errors";
import { randomUUID } from "node:crypto";
import { providerKey, type ProviderId } from "../config";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type ProviderRequest = {
  model: string;
  system: string;
  messages: ChatMessage[];
  maxTokens: number;
  signal: AbortSignal;
};

export type ProviderResult = { text: string; inputTokens: number; outputTokens: number };

export interface Provider {
  complete(req: ProviderRequest): Promise<ProviderResult>;
}

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

const anthropic: Provider = {
  async complete({ model, system, messages, maxTokens, signal }) {
    const client = new Anthropic({ apiKey: providerKey("anthropic"), maxRetries: 0 });
    const res = await client.messages.create({ model, max_tokens: maxTokens, system, messages }, { signal });
    const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    return { text, inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens };
  },
};

const openai: Provider = {
  async complete({ model, system, messages, maxTokens, signal }) {
    const client = new OpenAI({ apiKey: providerKey("openai"), maxRetries: 0 });
    const res = await client.chat.completions.create(
      { model, max_completion_tokens: maxTokens, messages: [{ role: "system", content: system }, ...messages] },
      { signal },
    );
    return {
      text: res.choices[0]?.message?.content ?? "",
      inputTokens: res.usage?.prompt_tokens ?? 0,
      outputTokens: res.usage?.completion_tokens ?? 0,
    };
  },
};

/**
 * GigaChat (Сбер). Сначала по ключу авторизации получаем токен на 30 минут (кэшируем), затем обычный чат-запрос.
 * Адреса можно переопределить: GIGACHAT_BASE_URL, GIGACHAT_OAUTH_URL; доступ: GIGACHAT_SCOPE (по умолчанию для физлиц).
 */
let gigaToken: { value: string; expiresAt: number } | null = null;

async function gigaAccessToken(signal: AbortSignal): Promise<string> {
  if (gigaToken && gigaToken.expiresAt - Date.now() > 60_000) return gigaToken.value;
  const url = process.env.GIGACHAT_OAUTH_URL?.trim() || "https://ngw.devices.sberbank.ru:9443/api/v2/oauth";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${providerKey("gigachat")}`,
      RqUID: randomUUID(),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({ scope: process.env.GIGACHAT_SCOPE?.trim() || "GIGACHAT_API_PERS" }),
    signal,
  });
  if (!res.ok) throw Object.assign(new Error("gigachat oauth"), { status: res.status });
  const j = (await res.json()) as { access_token?: string; expires_at?: number };
  if (!j.access_token) throw Object.assign(new Error("gigachat oauth"), { status: 502 });
  // срок может прийти в секундах или миллисекундах; приводим к миллисекундам
  const raw = j.expires_at ?? 0;
  const expiresAt = raw > 0 ? (raw < 1e12 ? raw * 1000 : raw) : Date.now() + 25 * 60_000;
  gigaToken = { value: j.access_token, expiresAt };
  return j.access_token;
}

const gigachat: Provider = {
  async complete({ model, system, messages, maxTokens, signal }) {
    const token = await gigaAccessToken(signal);
    const base = (process.env.GIGACHAT_BASE_URL?.trim() || "https://gigachat.devices.sberbank.ru/api/v1").replace(/\/$/, "");
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: "system", content: system }, ...messages] }),
      signal,
    });
    if (res.status === 401) gigaToken = null;
    if (!res.ok) throw Object.assign(new Error("gigachat chat"), { status: res.status });
    const j = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
    return { text: j.choices?.[0]?.message?.content ?? "", inputTokens: j.usage?.prompt_tokens ?? 0, outputTokens: j.usage?.completion_tokens ?? 0 };
  },
};

/** Реестр реализаций. Тесты подменяют их заглушками, не обращаясь к сети. */
export const providers: Record<ProviderId, Provider> = { anthropic, openai, gigachat };
