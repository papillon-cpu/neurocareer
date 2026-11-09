import OpenAI from "openai";
import { providerKey } from "../config";
import type { Provider } from "./types";

export const openai: Provider = {
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
