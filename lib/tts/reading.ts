import { firstEngine, readingText, type SpeechEngine } from "./shared";

export type ReadingKind =
  "scripture" | "devotional" | "prayer" | "action" | "interpretation";
export type ReadingPayload = {
  kind: ReadingKind;
  text: string;
  reference?: string;
  title?: string;
};

export function buildSpokenText(payload: ReadingPayload) {
  // Preserve the existing Scripture bytes and reference behavior exactly.
  if (payload.kind === "scripture") return readingText(payload);
  const text = payload.text.trim();
  if (!text) return "";
  return payload.kind === "prayer"
    ? `A prayer inspired by today’s reading. This is not Scripture.\n\n${text}`
    : text;
}

export function engineForKind(
  kind: ReadingKind,
  preference: SpeechEngine,
  online: boolean,
) {
  if (preference === "device") return "device";
  return kind === "scripture" ? firstEngine(preference, online) : "kokoro";
}

export const readingAudioEvent = "still-reading-audio";
