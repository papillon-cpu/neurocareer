/** Ошибки AI-шлюза. userMessage безопасно показывать пользователю: в нём нет ключей и технических деталей. */
export class AiError extends Error {
  constructor(
    readonly code: string,
    readonly userMessage: string,
  ) {
    super(code);
  }
}

export class AiNotConfiguredError extends AiError {
  constructor(readonly missing: string[]) {
    super("not_configured", "AI пока не настроен администратором: не добавлены ключи провайдера.");
  }
}

export class AiConsentError extends AiError {
  constructor() {
    super("no_consent", "Чтобы использовать AI, нужно отдельное согласие на передачу данных внешним AI-провайдерам.");
  }
}

export class AiRateLimitError extends AiError {
  constructor() {
    super("rate_limited", "Слишком много запросов к AI. Попробуйте через некоторое время.");
  }
}

export class AiBudgetError extends AiError {
  constructor() {
    super("budget_exceeded", "Месячный лимит AI-запросов исчерпан. Он обновится в начале следующего месяца.");
  }
}

export class AiProviderError extends AiError {
  constructor(
    code: "timeout" | "provider_rate_limited" | "provider_unavailable" | "auth" | "bad_request" | "unknown",
    readonly transient: boolean,
  ) {
    super(code, "AI временно недоступен. Ничего не потеряно, попробуйте ещё раз чуть позже.");
  }
}

export class AiInvalidOutputError extends AiError {
  constructor() {
    super("invalid_output", "AI вернул ответ в неожиданном формате. Попробуйте ещё раз.");
  }
}
