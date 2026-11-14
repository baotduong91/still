import { phonemize } from "./vendor/kokoro-phonemize";
import { toMisaki } from "./vendor/paradee-misaki";
import tokenizer from "./vendor/paradee-tokenizer.json";
import { SpeechInputTooLong } from "./chunks";
const vocab: Record<string, number> = tokenizer.model.vocab;
export function paradeeTokenIds(phonemes: string) {
  // Same whitelist as the pinned tokenizer. Never truncate at the model limit:
  // the worker splits the original text and retries instead.
  const ids = [...toMisaki(phonemes)]
    .filter((c) => c in vocab)
    .map((c) => vocab[c]);
  if (ids.length > 510) throw new SpeechInputTooLong();
  if (!ids.length) throw new Error("No pronounceable text");
  return BigInt64Array.from([0, ...ids, 0], BigInt);
}
export async function paradeeInput(text: string) {
  return paradeeTokenIds(await phonemize(text, "a"));
}
