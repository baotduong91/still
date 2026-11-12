import { ChatStreamEvent } from "@/lib/ai/chat-stream-contract";
import { cloudConsentHeader } from "@/lib/ai/cloud-status";
import { recordCloudStatus } from "./cloud-status";
import type { ChatType } from "@/lib/schemas";
import { ApiError } from "./store";
export async function readChatStream(
  input: unknown,
  consent: boolean,
  signal: AbortSignal,
  onEvent: (event: ChatStreamEvent) => void,
) {
  if (!consent)
    throw new Error(
      "Enable cloud sharing in Settings before sending a personal prompt.",
    );
  const response = await fetch("/api/chat/stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [cloudConsentHeader]: "true",
    },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok) {
    const error = (await response.json()).error;
    throw new ApiError(
      error?.message ?? "Cloud chat could not start.",
      error?.code ?? "UNKNOWN",
      response.status,
    );
  }
  if (
    !response.body ||
    !response.headers.get("content-type")?.includes("application/x-ndjson")
  )
    throw new Error("The cloud response was not a readable stream.");
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let buffer = "",
    result: ChatType | undefined;
  const consume = (line: string) => {
    if (!line.trim()) return;
    const event = ChatStreamEvent.parse(JSON.parse(line));
    if (event.type === "error") throw new Error(event.message);
    if (event.type === "status")
      recordCloudStatus(event.status, event.fallback);
    if (event.type === "result") {
      result = event.response;
      if (result.provider === "groq") recordCloudStatus("connected");
    }
    onEvent(event);
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      if (buffer.length > 200000)
        throw new Error("The cloud response was too large.");
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        consume(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
      }
    }
    buffer += decoder.decode();
    consume(buffer);
    if (!result)
      throw new Error(
        "The answer was interrupted before validation finished. Please try again.",
      );
    return result;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
