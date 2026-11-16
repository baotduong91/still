import { Bible } from "@/lib/bible";
import { GenerateInput } from "@/lib/schemas";
import { parseWithServerTranslationDefault } from "@/lib/bible/default-translation-server";
import { guidedQuietCopy } from "./today-content";
import { buildPlan, validatePlan } from "./orchestrator";
const phases = [
  "Read slowly",
  "Read the surrounding chapter",
  "Notice the words",
  "Ask about meaning",
  "Respond honestly",
  "Pray with the passage",
  "Carry one practice forward",
];
export function buildGuidedPlan(raw: unknown, bible: Bible) {
  const input = parseWithServerTranslationDefault(GenerateInput, raw);
  const reference = input.prompt.match(
    /(?:[1-3]\s+)?[A-Za-z]+(?:\s+of\s+[A-Za-z]+)?\s+\d{1,3}(?::\d{1,3}(?:[-–]\d{1,3})?)?/,
  );
  if (!reference) return buildPlan(input, bible);
  const passage = bible.lookup(reference[0], input.translation);
  const chapter = bible.lookup(
    `${passage.verses[0].book} ${passage.verses[0].chapter}`,
    input.translation,
  );
  const plan = buildPlan(
    { ...input, prompt: "A gentle practice of prayer" },
    bible,
  );
  plan.title = `A closer reading: ${passage.reference}`;
  plan.profile = {
    prompt: input.prompt,
    focus: input.prompt,
    themes: ["reference study"],
    pace: "gentle",
  };
  plan.days = plan.days.map((d, i) => ({
    ...d,
    title: `${i + 1}. ${phases[i % 7]}`,
    objective: `${phases[i % 7]} in your chosen passage, ${passage.reference}.`,
    passage: i % 7 === 1 ? chapter : passage,
    context:
      "Read this passage within its surrounding chapter. This guided exercise offers observation questions rather than a generated historical explanation.",
    explanation:
      "Notice the speaker, audience, literary setting, and what the passage actually says before applying it.",
    questions: [
      "What does the passage actually say, and what am I bringing to it?",
      `As you ${phases[i % 7].toLowerCase()}, what do you want to understand more carefully?`,
    ],
    journalPrompt: "What did you notice in your chosen passage?",
    ...guidedQuietCopy(input.prompt, i),
    bridge:
      i === plan.days.length - 1
        ? "Keep one practice and return at your own pace."
        : `Next: ${phases[(i + 1) % 7].toLowerCase()}.`,
  }));
  return validatePlan(plan, bible);
}
