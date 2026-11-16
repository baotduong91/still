import { assertPassageText } from "@/lib/bible/integrity";
import type { PassageType } from "@/lib/schemas";
export type SpeechEngine = "paradee" | "edge" | "device";
export function verseSpeech(passage: PassageType) {
  assertPassageText(passage);
  return {
    text: passage.verses.map((verse) => verse.text).join(" "),
    reference: passage.reference,
  };
}
export function readingText(input: { text: string; reference?: string }) {
  return input.reference ? `${input.text}\n\n${input.reference}` : input.text;
}
export function firstEngine(preference: SpeechEngine, online: boolean) {
  if (preference === "device") return "device";
  return online ? "edge" : "paradee";
}
