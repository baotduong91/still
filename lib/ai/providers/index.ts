import { cloudVendor, modeConfiguration } from "../modes";
import type { ModelRunOptions } from "../cloud-status";
import { z } from "zod";
import { AppError } from "@/lib/awp/errors";
export interface ModelProvider {
  name: string;
  generate<T>(schema: z.ZodType<T>, system: string, prompt: string): Promise<T>;
  streamCommentary?(system: string, prompt: string): AsyncIterable<string>;
}
export async function getProvider(
  kind: "ollama" | "cloud",
  options?: ModelRunOptions,
): Promise<ModelProvider> {
  const config = modeConfiguration();
  if (!config[kind].configured)
    throw new AppError(
      kind === "ollama" ? "LOCAL_MODEL_UNAVAILABLE" : "PROVIDER_UNAVAILABLE",
      kind === "ollama"
        ? "Configure OLLAMA_MODEL on the Mac running Still. Hosted localhost cannot reach your Mac. No cloud request was made."
        : "Add GROQ_API_KEY on the server, or configure AI_GATEWAY_API_KEY and CLOUD_MODEL, before selecting cloud.",
    );
  if (kind === "ollama") return (await import("./ollama")).ollamaProvider;
  if (cloudVendor() === "groq")
    return (await import("./groq")).createGroqProvider(options);
  return (await import("./cloud")).cloudProvider;
}
export function sanitizeGroqCommentary(text: string) {
  return text
    .replace(/[“”«»"]/g, "")
    .replace(
      /\b(?:[1-3]\s+)?[A-Z][a-z]+(?:\s+of\s+[A-Z][a-z]+)?\s+\d+:\d+(?:\s*[-–]\s*(?:\d+:)?\d+)?/gu,
      "today's assigned passage",
    )
    .replace(/\s{2,}/g, " ")
    .trim();
}
export function validateCommentary(text: string, groq = false) {
  const value = groq ? sanitizeGroqCommentary(text) : text;
  // Quotation marks and reference-shaped text are disallowed in model commentary.
  // References and quotations belong exclusively to the independently retrieved passage fields.
  if (/[“”"«»]|\b(?:[1-3]\s+)?[A-Z][a-z]+\s+\d+:\d+/u.test(value))
    throw new AppError(
      "PLAN_GENERATION_FAILED",
      "Model commentary contained a quotation or an unapproved reference.",
    );
  return value;
}
