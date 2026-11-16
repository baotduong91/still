import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { Bible, type Corpus } from "@/lib/bible";
import { buildGuidedPlan } from "@/lib/ai/guided";
import {
  guidedQuietCopy,
  quietLenses,
  quietReflection,
  wordCount,
} from "@/lib/ai/today-content";
import { verseSpeech } from "@/lib/tts/shared";
import { assertPassageText } from "@/lib/bible/integrity";

const bible = new Bible(
  JSON.parse(readFileSync("public/bibles/WEB.json", "utf8")) as Corpus,
);

it("prevalidates every fallback lens and return variation without a network model", () => {
  for (const goal of [
    "Explore anxiety",
    "A secular mindfulness practice",
    "Grow closer to God in worship",
  ]) {
    const copies = Array.from({ length: 14 }, (_, i) =>
      guidedQuietCopy(goal, i),
    );
    expect(new Set(copies.map((copy) => copy.reflection)).size).toBe(14);
    expect(new Set(copies.map((copy) => copy.action)).size).toBe(14);
    for (const copy of copies) {
      expect(wordCount(copy.reflection)).toBeGreaterThanOrEqual(60);
      expect(wordCount(copy.reflection)).toBeLessThanOrEqual(80);
      expect(copy.reflection.split("\n\n")).toHaveLength(2);
      expect(quietReflection.safeParse(copy.reflection).success).toBe(true);
    }
  }
  expect(quietLenses).toHaveLength(7);
  expect(
    guidedQuietCopy("A secular mindfulness practice", 0).prayer,
  ).not.toContain("God");
  expect(guidedQuietCopy("Grow closer to God in worship", 0).prayer).toMatch(
    /^God, I/,
  );
});

it("rejects prose drift, stock phrases and long paragraphs", () => {
  const valid = guidedQuietCopy("prayer", 0).reflection;
  expect(quietReflection.safeParse("Too short.").success).toBe(false);
  expect(
    quietReflection.safeParse(valid + " Extra words.".repeat(20)).success,
  ).toBe(false);
  expect(
    quietReflection.safeParse(valid.replace(/^\S+\s+\S+/, "Let's dive in"))
      .success,
  ).toBe(false);
  expect(quietReflection.safeParse(valid.replace("\n\n", " ")).success).toBe(
    false,
  );
});

it("keeps every primary anchor exactly in the retrieved WEB registry and TTS payload", () => {
  const plan = buildGuidedPlan(
    { prompt: "Explore patience", days: 14, translation: "WEB" },
    bible,
  );
  for (const day of plan.days) {
    const retrieved = bible.lookup(day.passage.reference);
    expect(day.passage.text).toBe(retrieved.text);
    expect(day.passage.verses).toEqual(retrieved.verses);
    expect(verseSpeech(day.passage)).toEqual({
      text: retrieved.text,
      reference: retrieved.reference,
    });
  }
  const exact = plan.days[0].passage;
  expect(() =>
    verseSpeech({ ...exact, text: "A paraphrase of Scripture." }),
  ).toThrow();
  const fabricated = {
    ...exact,
    verses: exact.verses.map((v) => ({ ...v, text: "Invented source words." })),
  };
  expect(() => assertPassageText(fabricated)).toThrow();
  expect(
    bible.validate({
      ...fabricated,
      text: fabricated.verses.map((v) => v.text).join(" "),
    }),
  ).toBe(false);
});

it("offers an offline contemplative path without imposing a prayer vocabulary", () => {
  const plan = buildGuidedPlan(
    {
      prompt: "A secular mindfulness practice without God language",
      days: 7,
      translation: "WEB",
    },
    bible,
  );
  expect(plan.provider).toBe("curated");
  expect(plan.profile.themes).toContain("contemplation");
  expect(plan.days.every((day) => bible.validate(day.passage))).toBe(true);
  expect(plan.days.every((day) => !day.prayer.includes("God"))).toBe(true);
});
