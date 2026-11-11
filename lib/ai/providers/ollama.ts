import { z } from "zod";
import { AppError } from "@/lib/awp/errors";
import type { ModelProvider } from "./index";
const capabilities = new Map<string, boolean>();
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
      const identity = `${url.origin}/${model}`;
      if (!capabilities.has(identity)) {
        try {
          const probe = await fetch(new URL("/api/show", url), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model }),
            signal: AbortSignal.timeout(5000),
          });
          if (probe.ok) {
            const info = await probe.json();
            capabilities.set(
              identity,
              Array.isArray(info.capabilities) &&
                info.capabilities.includes("thinking"),
            );
          }
        } catch {}
      }
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          stream: false,
          ...(capabilities.get(identity) ? { think: false } : {}),
          format: z.toJSONSchema(schema),
          messages: [
            { role: "system", content: system },
            { role: "user", content: prompt },
          ],
        }),
        signal: AbortSignal.timeout(90000),
      });
      if (!response.ok)
        throw new Error(`Ollama returned HTTP ${response.status}.`);
      const data = await response.json();
      return schema.parse(JSON.parse(data.message.content));
    } catch (error) {
      throw new AppError(
        "LOCAL_MODEL_UNAVAILABLE",
        error instanceof Error && error.name === "TimeoutError"
          ? "Ollama timed out while producing a response. Try a shorter question or smaller model. No cloud request was made."
          : error instanceof z.ZodError
            ? "Ollama returned content that did not match the required response schema. No cloud request was made."
            : error instanceof Error &&
                error.message.startsWith("Ollama returned HTTP")
              ? `${error.message} Check the installed model. No cloud request was made.`
              : "Ollama could not produce a valid response. No cloud request was made.",
      );
    }
  },
};
