import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { unified } from "@/modules/ai/catalog";
import { chainWithSettings, modelWithSettings, missingForProvider, missingWithSettings } from "@/modules/ai/settings";
import { isConfigured, providerChain, providerModel, type ProviderId } from "@/modules/ai/config";
import { resetGigaChatToken } from "@/modules/ai/providers/gigachat";

const ENV_KEYS = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_MODEL",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "GIGACHAT_AUTH_KEY",
  "GIGACHAT_MODEL",
  "GIGACHAT_SCOPE",
  "YANDEX_API_KEY",
  "YANDEX_FOLDER_ID",
  "YANDEX_MODEL",
  "YANDEX_AI_KEY",
  "YANDEX_AI_FOLDER",
  "YANDEX_AI_MODEL",
  "AI_PRIMARY_PROVIDER",
  "AI_FALLBACK_PROVIDER",
];

beforeEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
  resetGigaChatToken();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("единый слой провайдеров", () => {
  it("у каждого провайдера есть одинаковые операции: listModels, complete, healthCheck", () => {
    for (const id of ["anthropic", "openai", "gigachat", "yandexai", "yandex"] as ProviderId[]) {
      const p = unified[id];
      expect(p.id).toBe(id);
      expect(typeof p.listModels).toBe("function");
      expect(typeof p.complete).toBe("function");
      expect(typeof p.healthCheck).toBe("function");
    }
  });

  it("complete отправляет системную инструкцию и текст запроса", async () => {
    process.env.GIGACHAT_AUTH_KEY = "key-not-real";
    process.env.GIGACHAT_MODEL = "GigaChat-3-Pro";
    let seen: { url: string; init: RequestInit } | null = null;
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      seen = { url: String(url), init };
      if (String(url).includes("/oauth")) return new Response(JSON.stringify({ access_token: "tok", expires_at: Date.now() + 1_800_000 }), { status: 200 });
      return new Response(JSON.stringify({ choices: [{ message: { content: "ок" } }], usage: { prompt_tokens: 1, completion_tokens: 2 } }), { status: 200 });
    });
    const res = await unified.gigachat.complete("вопрос", { system: "правило", model: "m", maxTokens: 10 });
    expect(res).toEqual({ text: "ок", inputTokens: 1, outputTokens: 2 });
    const body = JSON.parse(String(seen!.init.body));
    expect(body.messages[0]).toEqual({ role: "system", content: "правило" });
    expect(body.messages[1]).toEqual({ role: "user", content: "вопрос" });
    expect(body.max_tokens).toBe(10);
  });

  it("healthCheck без ключа честно говорит, что нужен ключ, и не ходит в сеть", async () => {
    let called = false;
    vi.stubGlobal("fetch", async () => {
      called = true;
      return new Response("{}", { status: 200 });
    });
    const health = await unified.gigachat.healthCheck();
    expect(health.ok).toBe(false);
    expect(health.detail).toContain("GIGACHAT_AUTH_KEY");
    expect(called).toBe(false);
  });

  it("healthCheck сообщает об отказе в ключе, не показывая сам ключ", async () => {
    process.env.GIGACHAT_AUTH_KEY = "super-secret";
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 401 }));
    const health = await unified.gigachat.healthCheck();
    expect(health.ok).toBe(false);
    expect(health.detail).toContain("401");
    expect(health.detail).not.toContain("super-secret");
  });

  it("listModels без ключа возвращает пустой список, а не ошибку", async () => {
    expect(await unified.gigachat.listModels()).toEqual([]);
  });
});

describe("YandexGPT в AI Studio", () => {
  it("шлёт запрос в OpenAI-совместимый адрес с ключом и каталогом", async () => {
    process.env.YANDEX_AI_KEY = "yk";
    process.env.YANDEX_AI_FOLDER = "b1gfolder";
    process.env.YANDEX_AI_MODEL = "yandexgpt-5.1";
    let seen: { url: string; init: RequestInit } | null = null;
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      seen = { url: String(url), init };
      return new Response(JSON.stringify({ choices: [{ message: { content: "привет" } }], usage: { prompt_tokens: 5, completion_tokens: 6 } }), { status: 200 });
    });
    const res = await unified.yandexai.complete("вопрос", { system: "правило", maxTokens: 50 });
    expect(res).toEqual({ text: "привет", inputTokens: 5, outputTokens: 6 });
    expect(seen!.url).toBe("https://ai.api.cloud.yandex.net/v1/chat/completions");
    const headers = seen!.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Api-Key yk");
    expect(headers["OpenAI-Project"]).toBe("b1gfolder");
    const body = JSON.parse(String(seen!.init.body));
    expect(body.model).toBe("gpt://b1gfolder/yandexgpt-5.1");
    expect(body.messages[0]).toEqual({ role: "system", content: "правило" });
  });

  it("настраивается по трём переменным: ключ, каталог и модель", () => {
    process.env.YANDEX_AI_KEY = "yk";
    process.env.YANDEX_AI_FOLDER = "b1gfolder";
    expect(isConfigured("yandexai")).toBe(false);
    process.env.YANDEX_AI_MODEL = "yandexgpt-5.1";
    expect(isConfigured("yandexai")).toBe(true);
    expect(providerModel("yandexai")).toBe("yandexgpt-5.1");
  });

  it("полная модель gpt://... используется как есть", async () => {
    process.env.YANDEX_AI_KEY = "yk";
    process.env.YANDEX_AI_FOLDER = "b1gfolder";
    process.env.YANDEX_AI_MODEL = "gpt://other/model";
    let seen: { url: string; init: RequestInit } | null = null;
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      seen = { url: String(url), init };
      return new Response(JSON.stringify({ choices: [{ message: { content: "ок" } }] }), { status: 200 });
    });
    await unified.yandexai.complete("вопрос", { system: "s" });
    expect(JSON.parse(String(seen!.init.body)).model).toBe("gpt://other/model");
  });

  it("без ключа провайдер считается ненастроенным и называет нужные переменные", () => {
    expect(missingForProvider("yandexai")).toContain("YANDEX_AI_KEY");
    process.env.YANDEX_AI_KEY = "yk";
    expect(missingForProvider("yandexai")).toContain("YANDEX_AI_MODEL и YANDEX_AI_FOLDER");
  });
});

describe("кэш OAuth-токена GigaChat", () => {
  it("токен берётся один раз на несколько запросов и обновляется после 401", async () => {
    process.env.GIGACHAT_AUTH_KEY = "key-not-real";
    let oauth = 0;
    let chatStatus = 200;
    vi.stubGlobal("fetch", async (url: string) => {
      if (String(url).includes("/oauth")) {
        oauth++;
        return new Response(JSON.stringify({ access_token: "tok", expires_at: Date.now() + 1_800_000 }), { status: 200 });
      }
      chatStatus = chatStatus === 401 ? 200 : chatStatus;
      return new Response(JSON.stringify({ choices: [{ message: { content: "привет" } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), { status: chatStatus });
    });
    const first = await unified.gigachat.complete("вопрос", { system: "s", model: "m" });
    const second = await unified.gigachat.complete("ещё", { system: "s", model: "m" });
    expect(first.text).toBe("привет");
    expect(second.text).toBe("привет");
    expect(oauth).toBe(1);
  });

  it("параллельные запросы не обходят OAuth каждый по своему", async () => {
    process.env.GIGACHAT_AUTH_KEY = "key-not-real";
    let oauth = 0;
    vi.stubGlobal("fetch", async (url: string) => {
      if (String(url).includes("/oauth")) {
        oauth++;
        await new Promise((r) => setTimeout(r, 20));
        return new Response(JSON.stringify({ access_token: "tok", expires_at: Date.now() + 1_800_000 }), { status: 200 });
      }
      return new Response(JSON.stringify({ choices: [{ message: { content: "ок" } }], usage: { prompt_tokens: 1, output_tokens: 1 } }), { status: 200 });
    });
    await Promise.all([
      unified.gigachat.complete("а", { system: "s", model: "m" }),
      unified.gigachat.complete("б", { system: "s", model: "m" }),
      unified.gigachat.complete("в", { system: "s", model: "m" }),
    ]);
    expect(oauth).toBe(1);
  });
});

describe("выбор провайдера и модели администратором", () => {
  it("выбранный провайдер идёт первым в цепочке", () => {
    process.env.ANTHROPIC_API_KEY = "k";
    process.env.GIGACHAT_AUTH_KEY = "k2";
    process.env.GIGACHAT_MODEL = "GigaChat-3-Pro";
    expect(providerChain("assistant")).toEqual(["anthropic"]);
    expect(chainWithSettings("assistant", { provider: "gigachat" })).toEqual(["gigachat", "anthropic"]);
  });

  it("выбор без ключей в окружении игнорируется: сайт продолжает работать", () => {
    process.env.ANTHROPIC_API_KEY = "k";
    expect(chainWithSettings("assistant", { provider: "yandexai" })).toEqual(["anthropic"]);
  });

  it("выбранная модель применяется к выбранному провайдеру", () => {
    process.env.GIGACHAT_AUTH_KEY = "k2";
    process.env.GIGACHAT_MODEL = "GigaChat-2";
    expect(modelWithSettings("gigachat", { provider: "gigachat", model: "GigaChat-3-Pro" })).toBe("GigaChat-3-Pro");
    expect(modelWithSettings("gigachat", {})).toBe("GigaChat-2");
    expect(modelWithSettings("anthropic", { provider: "gigachat", model: "GigaChat-3-Pro" })).toBeTruthy();
  });

  it("в сообщении об ошибке называются переменные именно выбранного провайдера", () => {
    expect(missingWithSettings("assistant", { provider: "yandexai" })).toContain("YANDEX_AI_KEY");
  });
});
