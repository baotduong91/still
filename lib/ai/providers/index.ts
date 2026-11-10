import { z } from "zod";
import { AppError } from "@/lib/awp/errors";
export interface ModelProvider {
  name: string;
  generate<T>(schema: z.ZodType<T>, system: string, prompt: string): Promise<T>;
}
export async function getProvider(
  kind: "ollama" | "cloud",
): Promise<ModelProvider> {
  if (kind === "ollama") return (await import("./ollama")).ollamaProvider;
  return (await import("./cloud")).cloudProvider;
}
export function validateCommentary(text: string) {
  // Quotation marks and reference-shaped text are disallowed in model commentary.
  // References and quotations belong exclusively to the independently retrieved passage fields.
  if (/[“”"«»]|\b(?:[1-3]\s+)?[A-Z][a-z]+\s+\d+:\d+/u.test(text))
    throw new AppError(
      "PLAN_GENERATION_FAILED",
      "Model commentary contained a quotation or an unapproved reference.",
    );
  return text;
}
