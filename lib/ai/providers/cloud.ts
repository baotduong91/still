import { generateText, Output } from "ai";
import { AppError } from "@/lib/awp/errors";
import type { ModelProvider } from "./index";
export const cloudProvider: ModelProvider = {
  name: "cloud",
  async generate(schema, system, prompt) {
    if (!process.env.AI_GATEWAY_API_KEY || !process.env.CLOUD_MODEL)
      throw new AppError(
        "PROVIDER_UNAVAILABLE",
        "Set AI_GATEWAY_API_KEY and CLOUD_MODEL on the server.",
      );
    try {
      const { output } = await generateText({
        model: process.env.CLOUD_MODEL,
        system,
        prompt,
        output: Output.object({ schema }),
        maxOutputTokens: 12000,
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(90000),
      });
      return schema.parse(output);
    } catch {
      throw new AppError(
        "PROVIDER_UNAVAILABLE",
        "The cloud model request failed or returned an invalid result.",
      );
    }
  },
};
