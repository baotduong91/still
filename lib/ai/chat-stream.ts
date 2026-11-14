import { ChatInput, ChatAnswer } from "@/lib/schemas";
import { parseWithServerTranslationDefault } from "@/lib/bible/default-translation-server";
import { resolvePassage } from "@/lib/bible/api-bible";
import { AppError } from "@/lib/awp/errors";
import { getProvider, validateCommentary } from "./providers";
import { GroqUnavailable } from "./providers/groq";
import {
  compactHistory,
  guidedChatFallback,
  interpretationSystem,
  prepareChat,
} from "./server";
import type { ModelRunOptions } from "./cloud-status";
import { cloudVendor } from "./modes";
import type { ChatStreamEvent } from "./chat-stream-contract";
import { z } from "zod";

export async function* streamGroqChat(
  raw: unknown,
  options: ModelRunOptions = {},
): AsyncGenerator<ChatStreamEvent> {
  const input = parseWithServerTranslationDefault(ChatInput, raw);
  try {
    const base = await prepareChat(input, options);
    if (!base.citations.length) {
      yield { type: "result", response: base };
      return;
    }
    const provider = await getProvider("cloud", options);
    if (provider.name !== "groq" || !provider.streamCommentary)
      throw new AppError(
        "PROVIDER_UNAVAILABLE",
        "Choose configured Groq before using this chat stream.",
      );
    const citations = await Promise.all(
      base.citations.map((p) => resolvePassage(p.reference, input.translation)),
    );
    yield { type: "citations", passages: citations };
    let answer = "",
      pending = "";
    for await (const text of provider.streamCommentary(
      interpretationSystem +
        " Write a short plain-text answer in complete sentences, not JSON. Acknowledge limitations and differing interpretations. Do not quote Scripture or name references; citations are displayed separately.",
      JSON.stringify({
        question: input.question,
        history: compactHistory(input.history, "groq"),
        passages: base.citations,
      }),
    )) {
      if (options.signal?.aborted) return;
      pending += text;
      if (answer.length + pending.length > 8000)
        throw new AppError(
          "PLAN_GENERATION_FAILED",
          "The commentary was too long to validate.",
        );
      // Never expose raw provider deltas. Validate each complete sentence and
      // the cumulative answer so split quotation/reference tokens cannot bypass
      // the same gate used by non-streaming chat. Incomplete text stays private.
      let match: RegExpExecArray | null;
      while ((match = /[.!?](?:\s+|$)|\n{2,}/.exec(pending))) {
        const end = match.index + match[0].length;
        const sentence = pending.slice(0, end);
        const checked =
          validateCommentary(sentence, true) +
          (sentence.endsWith(" ") || sentence.endsWith("\n") ? " " : "");
        validateCommentary(answer + checked);
        answer += checked;
        pending = pending.slice(end);
        yield { type: "text", text: checked };
      }
    }
    if (pending) {
      const checked = validateCommentary(pending, true);
      validateCommentary(answer + checked);
      answer += checked;
      yield { type: "text", text: checked };
    }
    const validatedAnswer = z.string().min(20).max(8000).parse(answer.trim());
    yield {
      type: "result",
      response: ChatAnswer.parse({
        ...base,
        answer: validatedAnswer,
        citations,
        provider: "groq",
        limited: false,
        interpretation:
          "This is interpretation of the separately retrieved passages, not Scripture. Christian traditions may differ.",
      }),
    };
  } catch (error) {
    if (options.signal?.aborted) return;
    const groqCloud = input.provider === "cloud" && cloudVendor() === "groq";
    const recoverable =
      groqCloud &&
      (error instanceof GroqUnavailable ||
        (error instanceof AppError && error.code === "PLAN_GENERATION_FAILED"));
    if (!recoverable) throw error;
    const status =
      error instanceof GroqUnavailable ? error.status : "unavailable";
    yield { type: "status", status, fallback: true };
    yield {
      type: "result",
      response: await guidedChatFallback(
        input,
        error instanceof GroqUnavailable
          ? error
          : new GroqUnavailable("unavailable"),
        options,
      ),
    };
  }
}
