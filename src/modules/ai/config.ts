export type ProviderId = "anthropic" | "openai" | "gigachat" | "yandex";
const ORDER: ProviderId[] = ["anthropic", "gigachat", "yandex", "openai"];
export type AiTask = "assistant" | "resume_parse" | "resume_rewrite" | "report_commentary" | "open_feedback" | "vacancy_analysis" | "match_explain";

/** Настройки по задачам: лимит ответа и таймаут. Провайдер и модель берутся из переменных окружения. */
export const TASKS: Record<AiTask, { maxOutputTokens: number; timeoutMs: number }> = {
  assistant: { maxOutputTokens: 1200, timeoutMs: 45_000 },
  resume_parse: { maxOutputTokens: 3500, timeoutMs: 60_000 },
  resume_rewrite: { maxOutputTokens: 800, timeoutMs: 30_000 },
  report_commentary: { maxOutputTokens: 1500, timeoutMs: 45_000 },
  open_feedback: { maxOutputTokens: 1500, timeoutMs: 45_000 },
  vacancy_analysis: { maxOutputTokens: 1500, timeoutMs: 45_000 },
  match_explain: { maxOutputTokens: 1000, timeoutMs: 45_000 },
};

const env = (name: string) => process.env[name]?.trim() || undefined;

/** Для OpenAI и GigaChat модель обязательна в окружении: названия моделей быстро устаревают, зашивать их в код нельзя. */
export function providerModel(p: ProviderId): string | undefined {
  if (p === "anthropic") return env("ANTHROPIC_MODEL") ?? "claude-sonnet-5-5";
  if (p === "yandex") {
    // модель задаётся именем (например yandexgpt/latest) вместе с каталогом, либо целиком в виде gpt://...
    const m = env("YANDEX_MODEL");
    return m && (m.startsWith("gpt://") || env("YANDEX_FOLDER_ID")) ? m : undefined;
  }
  return env(p === "openai" ? "OPENAI_MODEL" : "GIGACHAT_MODEL");
}

/** Для GigaChat «ключ» — это ключ авторизации из личного кабинета Сбера (Client ID:Secret в base64). */
export function providerKey(p: ProviderId): string | undefined {
  return env(p === "anthropic" ? "ANTHROPIC_API_KEY" : p === "openai" ? "OPENAI_API_KEY" : p === "yandex" ? "YANDEX_API_KEY" : "GIGACHAT_AUTH_KEY");
}

const KEY_NAME: Record<ProviderId, string> = { anthropic: "ANTHROPIC_API_KEY", openai: "OPENAI_API_KEY", gigachat: "GIGACHAT_AUTH_KEY", yandex: "YANDEX_API_KEY" };
const MODEL_NAME: Record<ProviderId, string> = { anthropic: "ANTHROPIC_MODEL", openai: "OPENAI_MODEL", gigachat: "GIGACHAT_MODEL", yandex: "YANDEX_MODEL и YANDEX_FOLDER_ID" };

export function isConfigured(p: ProviderId): boolean {
  return Boolean(providerKey(p) && providerModel(p));
}

const isProvider = (v: string | undefined): v is ProviderId => v === "anthropic" || v === "openai" || v === "gigachat" || v === "yandex";

/**
 * Цепочка провайдеров для задачи: основной, затем резервный (если задан и настроен).
 * Переопределение для задачи: AI_<ЗАДАЧА>_PROVIDER, например AI_RESUME_PARSE_PROVIDER=openai.
 */
export function providerChain(task: AiTask): ProviderId[] {
  const perTask = env(`AI_${task.toUpperCase()}_PROVIDER`);
  const explicit = isProvider(perTask) ? perTask : isProvider(env("AI_PRIMARY_PROVIDER")) ? (env("AI_PRIMARY_PROVIDER") as ProviderId) : undefined;
  const fallbackRaw = env("AI_FALLBACK_PROVIDER");
  // без явного выбора берётся первый настроенный провайдер: Anthropic, затем GigaChat, затем OpenAI
  const primary = explicit ?? ORDER.find(isConfigured) ?? ORDER.find(providerKey) ?? "anthropic";
  const chain: ProviderId[] = [primary];
  if (isProvider(fallbackRaw) && fallbackRaw !== primary) chain.push(fallbackRaw);
  return chain.filter(isConfigured);
}

/** Какие переменные нужно задать, чтобы AI заработал (для понятного сообщения администратору). */
export function missingConfig(task: AiTask): string[] {
  const perTask = env(`AI_${task.toUpperCase()}_PROVIDER`);
  const explicit = isProvider(perTask) ? perTask : isProvider(env("AI_PRIMARY_PROVIDER")) ? (env("AI_PRIMARY_PROVIDER") as ProviderId) : undefined;
  const primary = explicit ?? ORDER.find(isConfigured) ?? ORDER.find(providerKey) ?? "anthropic";
  const out: string[] = [];
  if (!providerKey(primary)) out.push(KEY_NAME[primary]);
  if (!providerModel(primary)) out.push(MODEL_NAME[primary]);
  return out;
}

export function aiAvailable(task: AiTask): boolean {
  return providerChain(task).length > 0;
}

const num = (name: string, fallback: number) => {
  const v = Number(env(name));
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

export const limits = () => ({
  requestsPerHour: num("AI_REQUESTS_PER_HOUR", 30),
  tokensPerMonth: num("AI_MONTHLY_TOKENS_PER_USER", 300_000),
});
