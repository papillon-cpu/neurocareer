import { randomUUID } from "node:crypto";
import { providerKey } from "../config";
import { secureFetch } from "./http";
import type { Provider } from "./types";

/**
 * GigaChat (Сбер). Сначала по ключу авторизации получаем токен, затем обычный чат-запрос.
 * Токен живёт 30 минут: кэшируем его с запасом времени, чтобы не обходить OAuth на каждый запрос.
 * Адреса можно переопределить: GIGACHAT_BASE_URL, GIGACHAT_OAUTH_URL; доступ: GIGACHAT_SCOPE (по умолчанию для физлиц).
 */
const OAUTH_URL = "https://ngw.devices.sberbank.ru:9443/api/v2/oauth";
const BASE_URL = "https://api.giga.chat/v1";
/** Запас до истечения токена: запрос не должен упасть из-за секундной просрочки. */
const EXPIRY_MARGIN_MS = 60_000;
/** Если провайдер не прислал срок, считаем токен живым стандартные 25 минут. */
const FALLBACK_TTL_MS = 25 * 60_000;

type CachedToken = { value: string; expiresAt: number };

/** Кэш токена: ключ авторизации + область доступа. Смена ключа или области даёт новый токен. */
const tokenCache = new Map<string, CachedToken>();
/** Параллельные запросы не должны вместе ходить в OAuth: ждут один общий ответ. */
const inflight = new Map<string, Promise<string>>();

const cacheKey = () => `${providerKey("gigachat") ?? ""}|${process.env.GIGACHAT_SCOPE?.trim() || "GIGACHAT_API_PERS"}`;

/** Сбрасывает кэш токена (используется в тестах и при смене ключа). */
export function resetGigaChatToken(): void {
  tokenCache.clear();
  inflight.clear();
}

async function requestToken(key: string, scope: string, signal?: AbortSignal): Promise<string> {
  const res = await secureFetch(process.env.GIGACHAT_OAUTH_URL?.trim() || OAUTH_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${key}`,
      RqUID: randomUUID(),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({ scope }),
    signal,
  });
  if (!res.ok) throw Object.assign(new Error("gigachat oauth"), { status: res.status });
  const j = (await res.json()) as { access_token?: string; expires_at?: number };
  if (!j.access_token) throw Object.assign(new Error("gigachat oauth"), { status: 502 });
  // срок может прийти в секундах или миллисекундах; приводим к миллисекундам
  const raw = j.expires_at ?? 0;
  const expiresAt = raw > 0 ? (raw < 1e12 ? raw * 1000 : raw) : Date.now() + FALLBACK_TTL_MS;
  tokenCache.set(cacheKey(), { value: j.access_token, expiresAt });
  return j.access_token;
}

/** Токен доступа GigaChat: из кэша (с TTL) либо новый запрос в OAuth. */
export async function gigaChatAccessToken(signal?: AbortSignal): Promise<string> {
  const key = providerKey("gigachat");
  if (!key) throw Object.assign(new Error("gigachat: нет ключа авторизации"), { status: 401 });
  const scope = process.env.GIGACHAT_SCOPE?.trim() || "GIGACHAT_API_PERS";
  const ck = cacheKey();
  const cached = tokenCache.get(ck);
  if (cached && cached.expiresAt - Date.now() > EXPIRY_MARGIN_MS) return cached.value;
  const pending = inflight.get(ck);
  if (pending) return pending;
  const p = requestToken(key, scope, signal).finally(() => inflight.delete(ck));
  inflight.set(ck, p);
  return p;
}

const base = () => (process.env.GIGACHAT_BASE_URL?.trim() || BASE_URL).replace(/\/$/, "");

export const gigachat: Provider = {
  async complete({ model, system, messages, maxTokens, signal }) {
    const token = await gigaChatAccessToken(signal);
    const res = await secureFetch(`${base()}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: "system", content: system }, ...messages] }),
      signal,
    });
    if (res.status === 401) tokenCache.delete(cacheKey());
    if (!res.ok) throw Object.assign(new Error("gigachat chat"), { status: res.status });
    const j = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
    return { text: j.choices?.[0]?.message?.content ?? "", inputTokens: j.usage?.prompt_tokens ?? 0, outputTokens: j.usage?.completion_tokens ?? 0 };
  },
};

/** Модели GigaChat, доступные по текущему ключу (живой запрос к провайдеру). */
export async function gigachatModels(signal?: AbortSignal): Promise<{ id: string; label: string }[]> {
  const token = await gigaChatAccessToken(signal);
  const res = await secureFetch(`${base()}/models`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, signal });
  if (!res.ok) throw Object.assign(new Error("gigachat models"), { status: res.status });
  const j = (await res.json()) as { data?: { id?: string; name?: string }[] };
  return (j.data ?? []).map((m) => ({ id: m.id ?? m.name ?? "", label: m.name ?? m.id ?? "" })).filter((m) => m.id);
}

/** Проверка связи с GigaChat: токен получен и список моделей отдан. */
export async function gigachatHealth(signal?: AbortSignal): Promise<void> {
  await gigachatModels(signal);
}
