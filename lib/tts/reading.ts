import type { DayType } from "@/lib/schemas";
import { firstEngine, readingText, type SpeechEngine } from "./shared";

export type ReadingKind =
  "scripture" | "devotional" | "prayer" | "action" | "interpretation";
export type ReadingPayload = {
  kind: ReadingKind;
  text: string;
  reference?: string;
  title?: string;
};

/** Matches Today reflection section: prose, questions, and closing line. */
export function devotionReflectionText(
  day: Pick<DayType, "reflection" | "questions" | "interpretation">,
) {
  return [day.reflection, ...day.questions, day.interpretation]
    .map((part) => part.trim())
    .filter(Boolean)
    .join("\n\n");
}

/** Reflection + questions only — interpretation stays on screen, not in voice. */
export function devotionReflectionSpokenText(
  day: Pick<DayType, "reflection" | "questions">,
) {
  return [day.reflection, ...day.questions]
    .map((part) => part.trim())
    .filter(Boolean)
    .join("\n\n");
}

export function buildSpokenText(payload: ReadingPayload) {
  // Preserve the existing Scripture bytes and reference behavior exactly.
  if (payload.kind === "scripture") return readingText(payload);
  return payload.text.trim();
}

export function engineForKind(
  kind: ReadingKind,
  preference: SpeechEngine,
  online: boolean,
) {
  if (preference === "device") return "device";
  return kind === "scripture" ? firstEngine(preference, online) : "paradee";
}

export const readingAudioEvent = "still-reading-audio";
