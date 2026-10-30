import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { AiProviderError } from "../errors";
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

/** Реестр реализаций. Тесты подменяют их заглушками, не обращаясь к сети. */
export const providers: Record<ProviderId, Provider> = { anthropic, openai };
