import type { PassageType } from "@/lib/schemas";
export type SpeechEngine = "auto" | "edge" | "kokoro" | "device";
export function verseSpeech(passage: PassageType) {
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
  return preference === "kokoro" || !online ? "kokoro" : "edge";
}
