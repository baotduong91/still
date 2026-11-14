import { expect, it } from "vitest";
import { paradeeInput, paradeeTokenIds } from "@/lib/tts/paradee-phonemes";
import { toMisaki } from "@/lib/tts/vendor/paradee-misaki";
import { SpeechInputTooLong } from "@/lib/tts/chunks";
import tokenizer from "@/lib/tts/vendor/paradee-tokenizer.json";
import { engineForKind, buildSpokenText } from "@/lib/tts/reading";

it("keeps Paradee private content on-device and Edge limited to online Scripture", () => {
  for (const online of [true, false]) {
    for (const kind of [
      "devotional",
      "prayer",
      "action",
      "interpretation",
    ] as const)
      expect(engineForKind(kind, "paradee", online)).toBe("paradee");
    expect(engineForKind("scripture", "paradee", online)).toBe(
      online ? "edge" : "paradee",
    );
  }
  expect(engineForKind("devotional", "kokoro", true)).toBe("kokoro");
  expect(engineForKind("devotional", "device", true)).toBe("device");
});
it("converts eSpeak diphthongs, affricates and flaps to the trained Misaki vocabulary", () => {
  expect(toMisaki("aɪ oʊ aʊ eɪ ɔɪ dʒ tʃ ɾ iː")).toBe("I O W A Y ʤ ʧ T i");
  const ids = paradeeTokenIds("aɪ oʊ");
  expect([...ids]).toEqual([
    0n,
    BigInt(tokenizer.model.vocab.I),
    BigInt(tokenizer.model.vocab[" "]),
    BigInt(tokenizer.model.vocab.O),
    0n,
  ]);
  expect(() => paradeeTokenIds("a".repeat(511))).toThrow(SpeechInputTooLong);
});
it("phonemizes the exact retrieved Scripture and citation locally without truncation", async () => {
  const text = "Jesus wept.";
  const spoken = buildSpokenText({
    kind: "scripture",
    text,
    reference: "John 11:35",
  });
  expect(spoken).toBe("Jesus wept.\n\nJohn 11:35");
  const ids = await paradeeInput(spoken);
  expect(ids.length).toBeGreaterThan((await paradeeInput(text)).length);
  expect(ids[0]).toBe(0n);
  expect(ids.at(-1)).toBe(0n);
  expect(ids.length).toBeLessThanOrEqual(512);
});
