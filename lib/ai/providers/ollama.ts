import { z } from "zod";
import { AppError } from "@/lib/awp/errors";
import type { ModelProvider } from "./index";
export const ollamaProvider: ModelProvider = {
  name: "ollama",
  async generate(schema, system, prompt) {
    try {
      const url = new URL(
        "/api/chat",
        process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434",
      );
      const model = process.env.OLLAMA_MODEL;
      if (!model) throw new Error("Configure OLLAMA_MODEL");
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          stream: false,
          format: z.toJSONSchema(schema),
          messages: [
            { role: "system", content: system },
            { role: "user", content: prompt },
          ],
        }),
        signal: AbortSignal.timeout(90000),
      });
      if (!response.ok) throw new Error("Model unavailable");
      const data = await response.json();
      return schema.parse(JSON.parse(data.message.content));
    } catch {
      throw new AppError(
        "LOCAL_MODEL_UNAVAILABLE",
        "Ollama could not produce a valid response. No cloud request was made.",
      );
    }
  },
};
