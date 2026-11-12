import { expect, it } from "vitest";
import { speechChunks } from "@/lib/tts/chunks";

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
