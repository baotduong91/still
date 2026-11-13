import { ChatInput } from "@/lib/schemas";
import { parseWithServerTranslationDefault } from "@/lib/bible/default-translation-server";
import { identify } from "@/lib/awp/auth";
import { rateLimit } from "@/lib/awp/rate-limit";
import { AppError, errors } from "@/lib/awp/errors";
import { requireCloudConsent } from "@/lib/ai/consent";
import { cloudVendor, modeConfiguration } from "@/lib/ai/modes";
import { streamGroqChat } from "@/lib/ai/chat-stream";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    const identity = await identify(request);
    await rateLimit(identity.owner);
    const body = await request.text();
    if (body.length > 16000)
      throw new AppError(
        "INVALID_INPUT",
        "Choose a shorter question or conversation.",
      );
    const input = parseWithServerTranslationDefault(
      ChatInput,
      JSON.parse(body),
    );
    requireCloudConsent(request, input, true);
    if (
      input.provider !== "cloud" ||
      cloudVendor() !== "groq" ||
      !modeConfiguration().cloud.configured
    )
      throw new AppError(
        "PROVIDER_UNAVAILABLE",
        "Choose configured Groq in Settings before starting cloud chat.",
      );
    const abort = new AbortController();
    const signal = AbortSignal.any([request.signal, abort.signal]);
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (data: unknown) => {
          if (!signal.aborted)
            controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
        };
        try {
          for await (const event of streamGroqChat(input, { signal }))
            send(event);
        } catch (error) {
          send({
            type: "error",
            message:
              error instanceof AppError
                ? error.message
                : "The answer could not be validated. Try guided study or a specific passage.",
          });
        } finally {
          if (!signal.aborted) controller.close();
        }
      },
      cancel() {
        abort.abort();
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no",
        ...(identity.cookie ? { "Set-Cookie": identity.cookie } : {}),
      },
    });
  } catch (error) {
    const app =
      error instanceof AppError
        ? error
        : new AppError(
            "INVALID_INPUT",
            "Choose a supported question and mode.",
          );
    return Response.json(
      {
        error: {
          code: app.code,
          message: app.message,
          recovery: errors[app.code].recovery,
        },
      },
      {
        status: errors[app.code].status,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
