import { createGroq } from "@ai-sdk/groq";
import { APICallError, generateText, Output, streamText } from "ai";
import { z } from "zod";
import { AppError } from "@/lib/awp/errors";
import type { ModelRunOptions, CloudStatus } from "../cloud-status";
import type { ModelProvider } from "./index";
export const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
export const GROQ_MODEL = "openai/gpt-oss-120b";
export class GroqUnavailable extends AppError {
  constructor(public status: Exclude<CloudStatus, "connected">) {
    super(
      "PROVIDER_UNAVAILABLE",
      status === "rate-limited"
        ? "Groq is rate limited. Guided study is available."
        : "Groq is unavailable. Guided study is available.",
    );
  }
}
export function createGroqProvider(
  options: ModelRunOptions = {},
): ModelProvider {
  const key = process.env.GROQ_API_KEY?.trim();
  const model = () => {
    if (!key) throw new GroqUnavailable("unavailable");
    return createGroq({ apiKey: key, baseURL: GROQ_BASE_URL })(GROQ_MODEL);
  };
  const signal = () =>
    AbortSignal.any([
      AbortSignal.timeout(30000),
      ...(options.signal ? [options.signal] : []),
    ]);
  const failed = (error: unknown): never => {
    if (options.signal?.aborted) throw error;
    if (error instanceof z.ZodError)
      throw new AppError(
        "PLAN_GENERATION_FAILED",
        "Groq returned an invalid devotional draft. No unvalidated content was used.",
      );
    const status =
      APICallError.isInstance(error) && error.statusCode === 429
        ? "rate-limited"
        : "unavailable";
    options.onCloudStatus?.(status);
    throw new GroqUnavailable(status);
  };
  return {
    name: "groq",
    async generate(schema, system, prompt) {
      try {
        // Compact staged requests fit the free tier more often; never retry into
        // a rate limit or silently route through AI Gateway/another vendor.
        const request = JSON.parse(prompt);
        const stage = request.stage;
        const { output } = await generateText({
          model: model(),
          system:
            system +
            " Keep every field concise. Reflections must be at least 60 characters. Use short passages of at most 8 verses. No extra prose.",
          prompt,
          output: Output.object({ schema }),
          maxOutputTokens:
            stage === "goals" || stage === "chat-retrieval"
              ? 512
              : stage === "outline"
                ? Math.max(1500, Math.min(4200, request.count * 280))
                : stage === "devotional"
                  ? Math.max(1800, Math.min(8000, request.days.length * 500))
                  : 1600,
          maxRetries: 0,
          abortSignal: signal(),
          providerOptions: {
            // GPT-OSS rejects reasoning_format. The SDK keeps reasoning
            // separate; only validated final-answer text is ever displayed.
            groq: { reasoningEffort: "low" },
          },
        });
        const parsed = schema.parse(output);
        options.onCloudStatus?.("connected");
        return parsed;
      } catch (error) {
        return failed(error);
      }
    },
    async *streamCommentary(system, prompt) {
      try {
        const result = streamText({
          model: model(),
          system,
          prompt,
          maxOutputTokens: 1600,
          maxRetries: 0,
          abortSignal: signal(),
          providerOptions: {
            groq: { reasoningEffort: "low" },
          },
          onError: () => {}, // Handled below; never log request bodies or keys.
        });
        for await (const part of result.fullStream) {
          if (part.type === "error") throw part.error;
          if (part.type === "text-delta") yield part.text;
        }
        options.onCloudStatus?.("connected");
      } catch (error) {
        failed(error);
      }
    },
  };
}

// Explicit metadata-only check. No personal prompt, profile, or journal is sent.
export async function checkGroq(): Promise<CloudStatus> {
  if (!process.env.GROQ_API_KEY?.trim()) return "unavailable";
  try {
    const response = await fetch(`${GROQ_BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY.trim()}` },
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (response.status === 429) return "rate-limited";
    if (!response.ok) return "unavailable";
    const body = await response.json();
    return body.data?.some((entry: { id: string }) => entry.id === GROQ_MODEL)
      ? "connected"
      : "unavailable";
  } catch {
    return "unavailable";
  }
}
