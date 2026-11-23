import { createGroq } from "@ai-sdk/groq";
import {
  APICallError,
  generateText,
  jsonSchema,
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
import { todayTemperature, todayTokenBudget } from "../today-content";
export const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
export const GROQ_MODEL = "openai/gpt-oss-120b";
export class GroqDraftError extends AppError {
  constructor(
    public reason: "truncated" | "schema" | "validation",
    public issues: {
      path: string;
      code: string;
      minimum?: number;
      maximum?: number;
    }[] = [],
  ) {
    super(
      "PLAN_GENERATION_FAILED",
      "Groq could not verify this draft after a repair. Please retry. No guided plan was substituted and your saved days are unchanged.",
    );
  }
}
// Groq's constrained decoder receives structural constraints only. Prose lengths
// remain hard application gates, with actionable field-level repair feedback.
export function groqWireSchema(schema: z.ZodType) {
  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(walk);
    if (!value || typeof value !== "object") return value;
    const object = value as Record<string, unknown>;
    const bounds = [
      "minLength",
      "maxLength",
      "minItems",
      "maxItems",
      "minimum",
      "maximum",
      "exclusiveMinimum",
      "exclusiveMaximum",
    ];
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(object))
      if (!bounds.includes(key) && key !== "$schema") result[key] = walk(item);
    const hints = bounds
      .filter((key) => key in object)
      .map((key) => `${key}: ${object[key]}`);
    if (hints.length)
      result.description = [object.description, ...hints]
        .filter(Boolean)
        .join("; ");
    return result;
  };
  return walk(z.toJSONSchema(schema)) as Parameters<typeof jsonSchema>[0];
}
function schemaIssues(error: z.ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    code: issue.code,
    ...("minimum" in issue ? { minimum: Number(issue.minimum) } : {}),
    ...("maximum" in issue ? { maximum: Number(issue.maximum) } : {}),
  }));
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
    if (NoObjectGeneratedError.isInstance(error)) {
      let cause: unknown = error.cause;
      let issues: GroqDraftError["issues"] = [];
      for (let i = 0; i < 5 && cause && typeof cause === "object"; i++) {
        if (cause instanceof z.ZodError) {
          issues = schemaIssues(cause);
          break;
        }
        cause = (cause as { cause?: unknown }).cause;
      }
      console.warn("[Still Groq schema]", {
        finishReason: error.finishReason,
        cause: error.cause instanceof Error ? error.cause.name : "unknown",
        issues,
      });
      throw new GroqDraftError(
        error.finishReason === "length" ? "truncated" : "schema",
        issues,
      );
    }
    if (error instanceof z.ZodError)
      throw new GroqDraftError("schema", schemaIssues(error));
    if (NoOutputGeneratedError.isInstance(error))
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
      const jsonRepair = request.repair?.reason === "schema";
      const planStage = stage === "outline" || stage === "devotional";
      const outputTokens = planStage
        ? todayTokenBudget(
            stage,
            stage === "outline" ? request.count : request.days.length,
          )
        : stage === "goals" || stage === "chat-retrieval"
          ? 512
          : 1600;
      for (;;) {
        try {
          if (options.signal?.aborted) throw options.signal.reason;
          if (Date.now() >= deadline) throw new GroqUnavailable("unavailable");
          const result = await generateText({
            model: model(),
            system:
              system +
              (jsonRepair
                ? ` Return a JSON object matching this schema exactly: ${JSON.stringify(groqWireSchema(schema))}.`
                : "") +
              " Return only the requested fields. Never use quotation-mark characters in commentary strings. Put canonical references only in the outline reference field, never in reflection, prayer, or context text.",
            prompt,
            output: jsonRepair
              ? Output.json()
              : Output.object({ schema: jsonSchema(groqWireSchema(schema)) }),
            // GPT-OSS reasoning shares the completion budget with JSON. A
            // length-limited repair gets headroom without replaying all days.
            maxOutputTokens:
              planStage && request.repair?.reason === "truncated"
                ? Math.min(5000, Math.ceil(outputTokens * 1.4))
                : outputTokens,
            ...(planStage ? { temperature: todayTemperature } : {}),
            maxRetries: 0,
            abortSignal: signal(stage),
            providerOptions: {
              // GPT-OSS rejects reasoning_format. The SDK keeps reasoning
              // separate; only validated final-answer text is ever displayed.
              groq: {
                reasoningEffort: "low",
                ...(jsonRepair ? { structuredOutputs: false } : {}),
              },
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
