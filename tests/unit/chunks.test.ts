import { expect, it } from "vitest";
import {
  speechChunks,
  joinAudio,
  guardSpeechTokenizer,
  SpeechInputTooLong,
} from "@/lib/tts/chunks";

it("reads short warmed passages as one segment", () => {
  const text = "The Lord is my shepherd. I shall not want.";
  expect(speechChunks(text, { warmed: true })).toEqual([text]);
});

it("keeps a modest cold first segment for faster time to first sound", () => {
  const words = Array.from({ length: 80 }, (_, i) => `word${i}`);
  const text = words.join(" ") + ".";
  const chunks = speechChunks(text);
  expect(chunks.join("")).toBe(text);
  expect(chunks[0].trim().split(/\s+/).length).toBeLessThanOrEqual(22);
});

it("retains all text when larger warmed chunks need word and character bounds", () => {
  const text =
    "  " + Array.from({ length: 280 }, (_, i) => `word${i}`).join(" ") + "\n\n";
  const chunks = speechChunks(text, { warmed: true });
  expect(chunks.join("")).toBe(text);
  expect(
    chunks.every(
      (c) => c.trim().split(/\s+/).length <= 96 && c.trim().length <= 600,
    ),
  ).toBe(true);
});
it("joins PCM losslessly by default, including empty segments", () => {
  expect([
    ...joinAudio([
      new Float32Array([1, 2]),
      new Float32Array(),
      new Float32Array([3]),
    ]),
  ]).toEqual([1, 2, 3]);
});
it("optional bounded crossfade softens discontinuities without extending audio", () => {
  const a = new Float32Array(480).fill(1),
    b = new Float32Array(480).fill(-1);
  const joined = joinAudio([a, b], 5);
  expect(joined.length).toBe(840);
  expect(joined[359]).toBe(1);
  expect(joined[480]).toBe(-1);
  expect(Math.abs(joined[419])).toBeLessThan(0.02);
  expect(joinAudio([a, b], Infinity).length).toBe(960);
  expect(joinAudio([a, b], 100).length).toBe(720);
});
it("disables tokenizer truncation and detects expanded input before inference", () => {
  let truncation: unknown;
  const tts = {
    tokenizer: (_text: string, options: { truncation: boolean }) => {
      truncation = options.truncation;
      return { input_ids: { dims: [1, 600] } };
    },
  };
  guardSpeechTokenizer(tts);
  expect(() =>
    tts.tokenizer("numbers expand during phonemization", { truncation: true }),
  ).toThrow(SpeechInputTooLong);
  expect(truncation).toBe(false);
});
