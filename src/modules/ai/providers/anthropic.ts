import Anthropic from "@anthropic-ai/sdk";
import { providerKey } from "../config";
import type { Provider } from "./types";

export const anthropic: Provider = {
  async complete({ model, system, messages, maxTokens, signal }) {
    const client = new Anthropic({ apiKey: providerKey("anthropic"), maxRetries: 0 });
    const res = await client.messages.create({ model, max_tokens: maxTokens, system, messages }, { signal });
    const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    return { text, inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens };
  },
};
