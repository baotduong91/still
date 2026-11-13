import { z } from "zod";
import type { Bible } from "@/lib/bible";
import { GenerateInput, type PlanType, type DayType } from "@/lib/schemas";
import { AppError } from "@/lib/awp/errors";
import { validatePlan } from "./orchestrator";
import { validateCommentary, type ModelProvider } from "./providers";
import { GroqDraftError, GroqUnavailable } from "./providers/groq";
import { themes } from "./themes";

const outlineDay = z.object({
  number: z.number().int().positive(),
  title: z.string().min(3).max(90),
  objective: z.string().min(20).max(280),
  reference: z.string().min(3).max(80),
  context: z.string().min(20).max(400),
  bridge: z.string().min(10).max(220),
});
const devotionalDay = z.object({
  number: z.number().int().positive(),
  // Match the final gate here, rather than accepting a 20-character draft
  // which can never pass validatePlan's 60-character reflection minimum.
  reflection: z.string().min(100).max(1200),
  connection: z.string().min(30).max(500),
  questions: z.array(z.string().min(15).max(200)).length(2),
  prayer: z.string().min(30).max(500),
  action: z.string().min(30).max(400),
  interpretation: z.string().min(20).max(250),
});

function checkText(values: string[]) {
  values.forEach((text) => validateCommentary(text));
}
function distinct(values: string[]) {
  return (
    new Set(
      values.map((text) => text.toLowerCase().replace(/\s+/g, " ").trim()),
    ).size === values.length
  );
}
class ReferenceRepair extends AppError {
  constructor(
    public corrections: {
      day: number;
      reference: string;
      issue: string;
      validReferences?: string[];
    }[],
    public validDays: z.infer<typeof outlineDay>[] = [],
  ) {
    super("SCRIPTURE_NOT_FOUND", "Outline references need correction.");
  }
}
function draftFailure() {
  return new GroqDraftError("validation");
}
function repairReason(error: unknown) {
  if (error instanceof GroqDraftError) return error.reason;
  if (error instanceof AppError && error.code === "SCRIPTURE_NOT_FOUND")
    return "reference";
  return "validation";
}

async function verified<T>(
  stage: "outline" | "devotional",
  provider: ModelProvider,
  schema: z.ZodType<T>,
  system: string,
  payload: Record<string, unknown>,
  check: (draft: T) => void,
): Promise<T> {
  let reason: string | undefined;
  let corrections: ReferenceRepair["corrections"] | undefined;
  let validDays: ReferenceRepair["validDays"] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      // Generation/parsing must be inside the repair boundary too: truncated
      // JSON fails before a draft exists. Only this outline/batch is repeated.
      const draft = schema.parse(
        await provider.generate(
          schema,
          system,
          JSON.stringify({
            ...payload,
            stage,
            ...(reason
              ? {
                  repair: {
                    reason,
                    ...(corrections
                      ? { corrections, preserveDays: validDays }
                      : {}),
                    instruction:
                      "The previous attempt failed verification. Return every requested day exactly once, with unique titles/practices, real short canonical references, and commentary without quotations or reference patterns. Keep prose concise and satisfy every field length.",
                  },
                }
              : {}),
          }),
        ),
      );
      if (stage === "outline" && validDays.length) {
        const outlined = draft as { days: z.infer<typeof outlineDay>[] };
        outlined.days = outlined.days.map(
          (day) =>
            validDays.find((valid) => valid.number === day.number) ?? day,
        );
      }
      check(draft);
      return draft;
    } catch (error) {
      if (
        error instanceof GroqUnavailable ||
        !(
          error instanceof z.ZodError ||
          (error instanceof AppError &&
            ["PLAN_GENERATION_FAILED", "SCRIPTURE_NOT_FOUND"].includes(
              error.code,
            ))
        )
      )
        throw error;
      reason = repairReason(error);
      corrections =
        error instanceof ReferenceRepair ? error.corrections : undefined;
      validDays = error instanceof ReferenceRepair ? error.validDays : [];
      // Operational metadata only. Never log the prompt, draft, passages, key,
      // raw SDK error, or provider response body.
      console.warn("[Still Groq plan]", {
        stage,
        attempt: attempt + 1,
        reason,
        outcome: attempt === 0 ? "repair" : "rejected",
      });
      if (attempt === 1) {
        if (error instanceof ReferenceRepair)
          throw new AppError(
            "PLAN_GENERATION_FAILED",
            "Groq Scripture verification: " +
              error.corrections
                .map((c) => `Day ${c.day}, ${c.reference}: ${c.issue}`)
                .join("; ") +
              " No guided plan was substituted. Retry generation.",
          );
        throw draftFailure();
      }
    }
  }
  throw draftFailure();
}

export async function generateGroqPlan(
  input: z.infer<typeof GenerateInput>,
  bible: Bible,
  provider: ModelProvider,
  system: string,
): Promise<PlanType> {
  const schema = z.object({
    title: z.string().min(5).max(100),
    themes: z
      .array(z.enum(Object.keys(themes) as [string, ...string[]]))
      .min(1)
      .max(3),
    pace: z.enum(["gentle", "standard"]),
    days: z.array(outlineDay).length(input.days),
  });
  const outline = await verified(
    "outline",
    provider,
    schema,
    system,
    {
      goal: input.prompt,
      count: input.days,
      installedBooks: bible.books(),
      instruction:
        "Extract only supported themes/pace and design a coherent progressive journey around this exact goal. Themes are metadata, not a restriction to a curated curriculum. Supply consecutive day numbers and distinct titles/objectives. Use canonical references in Book Chapter:Verse-Verse format within one chapter, at most 8 verses per passage. No quotes or reference patterns in commentary. Keep context to 1-2 sentences and bridge to one sentence.",
    },
    (draft) => {
      checkText([draft.title]);
      if (!distinct(draft.days.map((day) => day.title))) throw draftFailure();
      const refs: string[] = [];
      const corrections: ReferenceRepair["corrections"] = [];
      draft.days.forEach((day, index) => {
        if (day.number !== index + 1) throw draftFailure();
        checkText([day.title, day.objective, day.context, day.bridge]);
        try {
          const selection = bible.planReference(day.reference);
          const passage = bible.lookup(selection.reference, input.translation);
          if (passage.verses.length > 8) {
            corrections.push({
              day: day.number,
              reference: day.reference,
              issue: "Choose at most 8 consecutive verses within this chapter.",
            });
          } else {
            day.reference = passage.reference;
            refs.push(passage.reference);
          }
        } catch (error) {
          if (
            !(error instanceof AppError) ||
            error.code !== "SCRIPTURE_NOT_FOUND"
          )
            throw error;
          corrections.push({
            day: day.number,
            reference: day.reference,
            validReferences: bible.planReference(day.reference).candidates,
            issue:
              error.message +
              " Use an exact installedBooks name and a valid verse range; do not use abbreviations or cross-chapter ranges.",
          });
        }
      });
      if (corrections.length)
        throw new ReferenceRepair(
          corrections,
          structuredClone(
            draft.days.filter(
              (day) => !corrections.some((c) => c.day === day.number),
            ),
          ),
        );
      if (new Set(refs).size < Math.min(3, input.days)) throw draftFailure();
    },
  );
  const days: DayType[] = [];
  // Share the whole progression but only the current batch's exact WEB text.
  // Each passage is sent once, rather than as both `text` and `verses` plus
  // duplicated profile fields. Sequential batches preserve continuity and
  // avoid a burst of concurrent requests against the free token allowance.
  const journey = outline.days.map((day) => ({
    number: day.number,
    title: day.title,
    objective: day.objective,
  }));
  for (let start = 0; start < input.days; start += 3) {
    const batch = outline.days.slice(start, start + 3);
    const passages = batch.map((day) =>
      bible.lookup(day.reference, input.translation),
    );
    const content = await verified(
      "devotional",
      provider,
      z.object({ days: z.array(devotionalDay).length(batch.length) }),
      system,
      {
        goal: input.prompt,
        journey,
        days: batch.map((day, index) => ({
          number: day.number,
          objective: day.objective,
          context: day.context,
          passage: {
            reference: passages[index].reference,
            translation: "WEB",
            text: passages[index].text,
          },
        })),
        previousPractices: days.map((day) => day.action),
        instruction:
          "Write only these requested days, preserving their original numbers. Make each reflection and practice distinct, grounded in its supplied passage, and specific to the user's stated goal without inventing personal details. Reflection: 2-4 sentences, at least 100 characters. Connection, prayer, action, interpretation: 1-2 concise sentences each. Two short questions. All prose is interpretation: never quote or reproduce Scripture, use quotation marks, or add Bible reference patterns. Exact Scripture is attached separately.",
      },
      (draft) => {
        draft.days.forEach((day, index) => {
          if (day.number !== batch[index].number) throw draftFailure();
          checkText([
            day.reflection,
            day.connection,
            day.prayer,
            day.action,
            day.interpretation,
            ...day.questions,
          ]);
        });
        if (
          !distinct([
            ...days.map((day) => day.reflection),
            ...draft.days.map((day) => day.reflection),
          ]) ||
          !distinct([
            ...days.map((day) => day.action),
            ...draft.days.map((day) => day.action),
          ])
        )
          throw draftFailure();
      },
    );
    batch.forEach((day, index) => {
      const prose = content.days[index];
      days.push({
        ...day,
        ...prose,
        passage: passages[index],
        explanation: day.context,
        journalPrompt: prose.questions[0],
        completedAt: null,
        completedDate: null,
      });
    });
  }
  // No curated seed is validated or mixed into a generated journey. Only a
  // complete, independently verified model journey receives provider=groq.
  return validatePlan(
    {
      id: crypto.randomUUID(),
      title: outline.title,
      profile: {
        prompt: input.prompt,
        focus: input.prompt,
        themes: outline.themes,
        pace: outline.pace,
      },
      translation: input.translation,
      createdAt: new Date().toISOString(),
      revision: 0,
      provider: "groq",
      days,
      feedback: [],
    },
    bible,
  );
}
