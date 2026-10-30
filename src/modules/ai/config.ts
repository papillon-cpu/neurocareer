export type ProviderId = "anthropic" | "openai";
export type AiTask = "assistant" | "resume_parse" | "resume_rewrite";

/** Настройки по задачам: лимит ответа и таймаут. Провайдер и модель берутся из переменных окружения. */
export const TASKS: Record<AiTask, { maxOutputTokens: number; timeoutMs: number }> = {
  assistant: { maxOutputTokens: 1200, timeoutMs: 45_000 },
  resume_parse: { maxOutputTokens: 3500, timeoutMs: 60_000 },
  resume_rewrite: { maxOutputTokens: 800, timeoutMs: 30_000 },
};

const env = (name: string) => process.env[name]?.trim() || undefined;

/** Для OpenAI модель обязательна в окружении: названия моделей быстро устаревают, зашивать их в код нельзя. */
export function providerModel(p: ProviderId): string | undefined {
  return p === "anthropic" ? (env("ANTHROPIC_MODEL") ?? "claude-sonnet-5-5") : env("OPENAI_MODEL");
}

export function providerKey(p: ProviderId): string | undefined {
  return env(p === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY");
}

export function isConfigured(p: ProviderId): boolean {
  return Boolean(providerKey(p) && providerModel(p));
}

const isProvider = (v: string | undefined): v is ProviderId => v === "anthropic" || v === "openai";

/**
 * Цепочка провайдеров для задачи: основной, затем резервный (если задан и настроен).
 * Переопределение для задачи: AI_<ЗАДАЧА>_PROVIDER, например AI_RESUME_PARSE_PROVIDER=openai.
 */
export function providerChain(task: AiTask): ProviderId[] {
  const perTask = env(`AI_${task.toUpperCase()}_PROVIDER`);
  const primary = isProvider(perTask) ? perTask : isProvider(env("AI_PRIMARY_PROVIDER")) ? (env("AI_PRIMARY_PROVIDER") as ProviderId) : "anthropic";
  const fallbackRaw = env("AI_FALLBACK_PROVIDER");
  const chain: ProviderId[] = [primary];
  if (isProvider(fallbackRaw) && fallbackRaw !== primary) chain.push(fallbackRaw);
  return chain.filter(isConfigured);
}

/** Какие переменные нужно задать, чтобы AI заработал (для понятного сообщения администратору). */
export function missingConfig(task: AiTask): string[] {
  const perTask = env(`AI_${task.toUpperCase()}_PROVIDER`);
  const primary = isProvider(perTask) ? perTask : isProvider(env("AI_PRIMARY_PROVIDER")) ? (env("AI_PRIMARY_PROVIDER") as ProviderId) : "anthropic";
  const out: string[] = [];
  if (!providerKey(primary)) out.push(primary === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY");
  if (!providerModel(primary)) out.push(primary === "anthropic" ? "ANTHROPIC_MODEL" : "OPENAI_MODEL");
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
