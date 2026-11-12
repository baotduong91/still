import { createGroq } from "@ai-sdk/groq";
import {
  APICallError,
  generateText,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  Output,
  streamText,
} from "ai";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { AppError } from "@/lib/awp/errors";
import type { ModelRunOptions, CloudStatus } from "../cloud-status";
import type { ModelProvider } from "./index";
export const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
export const GROQ_MODEL = "openai/gpt-oss-120b";
export class GroqDraftError extends AppError {
  constructor(public reason: "truncated" | "schema" | "validation") {
    super(
      "PLAN_GENERATION_FAILED",
      "Groq returned a draft that needs verification. No unvalidated content was used.",
    );
  }
}
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
  const deadline = Date.now() + 240_000;
  let transientRetries = 2;
  const model = () => {
    if (!key) throw new GroqUnavailable("unavailable");
    return createGroq({ apiKey: key, baseURL: GROQ_BASE_URL })(GROQ_MODEL);
  };
  const signal = (stage?: string) =>
    AbortSignal.any([
      AbortSignal.timeout(
        Math.max(
          1,
          Math.min(
            deadline - Date.now(),
            stage === "outline" || stage === "devotional" ? 90_000 : 45_000,
          ),
        ),
      ),
      ...(options.signal ? [options.signal] : []),
    ]);
  const failed = (error: unknown): never => {
    if (options.signal?.aborted) throw error;
    if (NoObjectGeneratedError.isInstance(error))
      throw new GroqDraftError(
        error.finishReason === "length" ? "truncated" : "schema",
      );
    if (error instanceof z.ZodError || NoOutputGeneratedError.isInstance(error))
      throw new GroqDraftError("schema");
    if (APICallError.isInstance(error) && error.statusCode === 400) {
      try {
        const code = JSON.parse(error.responseBody ?? "{}").error?.code;
        if (code === "json_validate_failed") throw new GroqDraftError("schema");
      } catch (parseError) {
        if (parseError instanceof GroqDraftError) throw parseError;
      }
    }
    const status =
      APICallError.isInstance(error) && error.statusCode === 429
        ? "rate-limited"
        : "unavailable";
    console.warn("[Still Groq request]", {
      outcome: "unavailable",
      status: APICallError.isInstance(error) ? error.statusCode : undefined,
    });
    options.onCloudStatus?.(status);
    throw new GroqUnavailable(status);
  };
  return {
    name: "groq",
    async generate(schema, system, prompt) {
      const request = JSON.parse(prompt);
      const stage = request.stage;
      const planStage = stage === "outline" || stage === "devotional";
      const outputTokens =
        stage === "goals" || stage === "chat-retrieval"
          ? 512
          : stage === "outline"
            ? Math.max(2000, Math.min(5000, request.count * 300 + 600))
            : stage === "devotional"
              ? Math.max(1800, Math.min(8000, request.days.length * 650 + 600))
              : 1600;
      for (;;) {
        try {
          if (options.signal?.aborted) throw options.signal.reason;
          if (Date.now() >= deadline) throw new GroqUnavailable("unavailable");
          const result = await generateText({
            model: model(),
            system:
              system +
              " Keep every field concise. Reflections must be at least 60 characters. Use short passages of at most 8 verses. No extra prose. Never use quotation-mark characters in commentary strings. Put canonical references only in the outline reference field, never in reflection, prayer, or context text.",
            prompt,
            output: Output.object({ schema }),
            // GPT-OSS reasoning shares the completion budget with JSON. A
            // length-limited repair gets headroom without replaying all days.
            maxOutputTokens:
              planStage && request.repair?.reason === "truncated"
                ? Math.min(5000, Math.ceil(outputTokens * 1.4))
                : outputTokens,
            maxRetries: 0,
            abortSignal: signal(stage),
            providerOptions: {
              // GPT-OSS rejects reasoning_format. The SDK keeps reasoning
              // separate; only validated final-answer text is ever displayed.
              groq: { reasoningEffort: "low" },
            },
          });
          const parsed = schema.parse(result.output);
          if (planStage)
            console.info("[Still Groq request]", {
              stage,
              outcome: "generated",
              inputTokens: result.usage.inputTokens,
              outputTokens: result.usage.outputTokens,
            });
          options.onCloudStatus?.("connected");
          return parsed;
        } catch (error) {
          // One small retry boundary for network/5xx failures and short token
          // windows. Long/daily limits return the honest guided fallback. No
          // provider switching, and no retries after cancellation/deadline.
          if (!options.signal?.aborted && planStage && transientRetries > 0) {
            const status = APICallError.isInstance(error)
              ? error.statusCode
              : undefined;
            const retryAfter = APICallError.isInstance(error)
              ? error.responseHeaders?.["retry-after"]
              : undefined;
            const seconds = retryAfter ? Number(retryAfter) : NaN;
            const wait =
              status === 429 &&
              Number.isFinite(seconds) &&
              seconds >= 0 &&
              seconds <= 60
                ? Math.max(100, Math.ceil(seconds * 1000))
                : error instanceof TypeError ||
                    (status !== undefined && status >= 500)
                  ? 1000
                  : undefined;
            if (wait !== undefined && Date.now() + wait + 5000 < deadline) {
              transientRetries--;
              console.warn("[Still Groq request]", {
                stage,
                outcome: "retry",
                status,
                waitMs: wait,
              });
              await delay(wait, undefined, { signal: options.signal });
              continue;
            }
          }
          return failed(error);
        }
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
          abortSignal: signal("chat"),
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
