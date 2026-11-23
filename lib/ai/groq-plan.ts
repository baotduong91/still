import { z } from "zod";
import type { Bible } from "@/lib/bible";
import { GenerateInput, type PlanType, type DayType } from "@/lib/schemas";
import { AppError } from "@/lib/awp/errors";
import { validatePlan } from "./orchestrator";
import { validateCommentary, type ModelProvider } from "./providers";
import {
  GroqDraftError,
  GroqUnavailable,
  schemaIssues,
} from "./providers/groq";
import { themes } from "./themes";
import { todayDevotionalDay, validateQuietCopy } from "./today-content";

const outlineDay = z.object({
  number: z.number().int().positive(),
  title: z.string().min(3).max(90),
  objective: z.string().min(20).max(280),
  reference: z.string().min(3).max(80),
  context: z.string().min(20).max(400),
  bridge: z.string().min(10).max(220),
});
const devotionalDay = todayDevotionalDay;

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
// Five-word overlap catches lightly edited copies without penalizing shared
// biblical vocabulary or ordinary prayer openings.
function repeatedReflection(texts: string[]) {
  const previous: Set<string>[] = [];
  for (const text of texts) {
    const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
    const phrases = new Set(
      words.slice(4).map((_, i) => words.slice(i, i + 5).join(" ")),
    );
    for (const prior of previous) {
      let shared = 0;
      for (const phrase of phrases) if (prior.has(phrase)) shared++;
      if (shared > 0.8 * (prior.size + phrases.size - shared)) return true;
    }
    previous.push(phrases);
  }
  return false;
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
function draftFailure(code?: string, path = "days") {
  return new GroqDraftError("validation", code ? [{ path, code }] : []);
}
function repairReason(error: unknown) {
  if (error instanceof GroqDraftError) return error.reason;
  if (error instanceof AppError && error.code === "SCRIPTURE_NOT_FOUND")
    return "reference";
  return "validation";
}

async function repairDevotionalFields(
  provider: ModelProvider,
  system: string,
  payload: Record<string, unknown>,
  original: unknown,
  issues: GroqDraftError["issues"],
) {
  if (!issues.length || !original || !Array.isArray(payload.days)) return;
  const draft = structuredClone(original) as {
    days?: Record<string, unknown>[];
  };
  if (!Array.isArray(draft.days)) return;
  const edits = [];
  for (const issue of issues) {
    const match = /^days\.(\d+)\.(reflection|prayer|action)$/u.exec(issue.path);
    if (!match) return;
    const index = Number(match[1]);
    const field = match[2];
    const originalText = draft.days[index]?.[field];
    if (typeof originalText !== "string" || !payload.days[index]) return;
    const minimum = field === "action" ? 10 : field === "reflection" ? 130 : 35;
    const maximum = field === "action" ? 28 : field === "reflection" ? 180 : 55;
    const count = issue.actualWords;
    let quotation = issue.code === "quotation_or_reference";
    try {
      validateCommentary(originalText);
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      quotation = true;
    }
    const append =
      !quotation &&
      count !== undefined &&
      count >= (field === "reflection" ? 60 : 17) &&
      count < minimum;
    const rewrite =
      field === "action" ||
      quotation ||
      (count !== undefined && count > maximum);
    if (!append && !rewrite) return;
    const retainedWords = append ? count : 0;
    edits.push({
      index,
      day: payload.days[index],
      field,
      // A replacement must not echo rejected quotations back as a writing sample.
      originalText: quotation ? undefined : originalText,
      operation: append ? "append" : "replace",
      minimumNewWords: minimum - retainedWords,
      targetNewWords: Math.round((minimum + maximum) / 2) - retainedWords,
      maximumNewWords: maximum - retainedWords,
    });
  }
  const editSchema = z.object({
    additions: z.array(z.string().min(10)).length(edits.length),
  });
  const { additions } = await provider.generate(
    editSchema,
    system +
      " For this editing task, output only the edited strings requested below. Follow each item's explicit word bounds for the newly written text.",
    JSON.stringify({
      stage: "devotional",
      goal: payload.goal,
      days: edits,
      ...(edits.some((edit) => edit.field === "action")
        ? {
            previousPractices: payload.previousPractices,
            writingRule:
              "Replace the repeated invitation with one distinct open-ended question about a specific detail of this day’s passage.",
          }
        : {}),
      instruction:
        "Return one string per item in the same order. For append, write only a new paragraph that develops an observation or application without repeating the existing prose. For replace, rewrite the whole field in original words, retaining its insight and removing quotations and inline citations. Each new string must be within minimumNewWords and maximumNewWords. Use only the supplied passage.",
    }),
  );
  edits.forEach(({ index, field, operation, originalText }, i) => {
    const revisedText = additions[i].trim();
    draft.days![index][field] =
      operation === "append"
        ? `${originalText!.trim()}\n\n${revisedText}`
        : revisedText;
  });
  return draft;
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
  let fieldIssues: GroqDraftError["issues"] = [];
  let rejectedDraft: unknown;
  let skipFieldEdit = false;
  let corrections: ReferenceRepair["corrections"] | undefined;
  let validDays: ReferenceRepair["validDays"] = [];
  for (let attempt = 0; ; attempt++) {
    let parsedDraft: T | undefined;
    try {
      // Generation/parsing must be inside the repair boundary too: truncated
      // JSON fails before a draft exists. Only this outline/batch is repeated.
      const expanded =
        attempt > 0 && !skipFieldEdit && stage === "devotional"
          ? await repairDevotionalFields(
              provider,
              system,
              payload,
              rejectedDraft,
              fieldIssues,
            )
          : undefined;
      let draft: T;
      if (expanded) {
        const parsed = schema.safeParse(expanded);
        if (!parsed.success)
          throw new GroqDraftError(
            "schema",
            schemaIssues(parsed.error),
            expanded,
          );
        draft = parsed.data;
      } else {
        draft = schema.parse(
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
                      fieldIssues,
                      rejectedDraft,
                      wordEdits: fieldIssues.flatMap(
                        ({ path, actualWords, minimumWords, maximumWords }) => {
                          if (
                            actualWords === undefined ||
                            minimumWords === undefined ||
                            maximumWords === undefined
                          )
                            return [];
                          const target = Math.round(
                            (minimumWords + maximumWords) / 2,
                          );
                          const difference = target - actualWords;
                          return [
                            {
                              path,
                              edit:
                                difference > 0
                                  ? `Add about ${difference} words of new, passage-specific substance to this field. Keep its existing insight and develop it with full sentences.`
                                  : `Remove about ${-difference} words from this field by cutting filler and repetition.`,
                            },
                          ];
                        },
                      ),
                      ...(corrections
                        ? { corrections, preserveDays: validDays }
                        : {}),
                      instruction:
                        "The previous attempt failed verification. Return every requested day exactly once, with unique titles/practices, real short canonical references, and commentary without quotations or reference patterns. When rejectedDraft is present, revise it using each fieldIssues path and its actualWords as the baseline. Apply the explicit wordEdits to the supplied text. An underlength field needs new sentences, not a restatement of the same length. Copy all unaffected fields verbatim. For quotation_or_reference, rewrite just that string in original words and remove any inline Bible citations. For stock_phrase, replace the stock language with a specific observation. Rewrite any repeated reflections around different textual details and concrete applications. Check 130–180 reflection words, 35–55 prayer words and one writing invitation.",
                    },
                  }
                : {}),
            }),
          ),
        );
      }
      if (stage === "outline" && validDays.length) {
        const outlined = draft as { days: z.infer<typeof outlineDay>[] };
        outlined.days = outlined.days.map(
          (day) =>
            validDays.find((valid) => valid.number === day.number) ?? day,
        );
      }
      parsedDraft = draft;
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
      // A malformed edit response is not a replacement for the previous batch.
      // Keep that draft and retry once with the full schema repair path.
      if (
        attempt < 3 &&
        !skipFieldEdit &&
        stage === "devotional" &&
        rejectedDraft &&
        error instanceof GroqDraftError &&
        !error.rejectedDraft &&
        !parsedDraft &&
        (error.reason === "truncated" || error.reason === "schema")
      ) {
        skipFieldEdit = true;
        reason = "schema";
        continue;
      }
      skipFieldEdit = false;
      const previousReason = reason;
      reason = repairReason(error);
      rejectedDraft =
        stage === "devotional"
          ? ((error instanceof GroqDraftError
              ? error.rejectedDraft
              : undefined) ?? parsedDraft)
          : undefined;
      fieldIssues =
        error instanceof GroqDraftError
          ? error.issues
          : error instanceof z.ZodError
            ? error.issues.map((issue) => ({
                path: issue.path.join("."),
                code: issue.code,
              }))
            : [];
      corrections =
        error instanceof ReferenceRepair ? error.corrections : undefined;
      validDays = error instanceof ReferenceRepair ? error.validDays : [];
      // A complete devotional draft can receive bounded repairs.
      const canRetry =
        attempt === 0 ||
        (attempt === 1 &&
          ((stage === "devotional" &&
            rejectedDraft !== undefined &&
            fieldIssues.length > 0) ||
            (error instanceof ReferenceRepair &&
              previousReason !== "reference"))) ||
        (attempt === 2 &&
          stage === "devotional" &&
          rejectedDraft !== undefined &&
          fieldIssues.length > 0 &&
          fieldIssues.every(
            (issue) =>
              issue.code === "quotation_or_reference" ||
              issue.code === "repeated_writing_prompt" ||
              issue.actualWords !== undefined,
          ));
      // Operational metadata only. Never log the prompt, draft, passages, key,
      // raw SDK error, or provider response body.
      console.warn("[Still Groq plan]", {
        stage,
        attempt: attempt + 1,
        reason,
        fieldIssues,
        outcome: canRetry ? "repair" : "rejected",
      });
      if (!canRetry) {
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
}

export async function generateGroqPlan(
  input: z.infer<typeof GenerateInput>,
  bible: Bible,
  provider: ModelProvider,
  system: string,
): Promise<PlanType> {
  const schema = z.object({
    title: z.string().min(5).max(100),
    themes: z.array(z.string()),
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
      allowedThemes: Object.keys(themes),
      instruction:
        "Extract only supported themes/pace and design a coherent progressive journey around this exact goal. Choose one to three entries from allowedThemes as metadata, not a restriction to a curated curriculum. Supply consecutive day numbers and distinct titles/objectives. Use canonical references in Book Chapter:Verse-Verse format within one chapter, choose 1–3 consecutive verses per passage. Give each day a distinct passage-supported insight in its objective; vary application across the journey. No quotes or reference patterns in commentary. Keep context to 1-2 sentences and bridge to one sentence.",
    },
    (draft) => {
      checkText([draft.title]);
      if (
        !distinct(draft.days.map((day) => day.title)) ||
        !distinct(draft.days.map((day) => day.objective))
      )
        throw draftFailure();
      const refs: string[] = [];
      const corrections: ReferenceRepair["corrections"] = [];
      draft.days.forEach((day, index) => {
        if (day.number !== index + 1) throw draftFailure();
        checkText([day.title, day.objective, day.context, day.bridge]);
        try {
          const selection = bible.planReference(day.reference, 3);
          const passage = bible.lookup(selection.reference, input.translation);
          if (passage.verses.length > 3) {
            corrections.push({
              day: day.number,
              reference: day.reference,
              issue: "Choose at most 3 consecutive verses within this chapter.",
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
            validReferences: bible.planReference(day.reference, 3).candidates,
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
          passage: {
            reference: passages[index].reference,
            translation: passages[index].translation,
            text: passages[index].text,
          },
        })),
        previousOpenings: days.map((day) =>
          day.reflection.split(/\s+/u).slice(0, 12).join(" "),
        ),
        previousPractices: days.map((day) => day.action),
        instruction:
          "Write only these requested days, preserving their original numbers. Use only the retrieved WEB passage to support the daily objective. Vary openings, insights and applications across this batch and earlier days. For each reflection write four developed paragraphs of about 40 words each: notice a concrete detail, explain its setting, develop its meaning, and make one ordinary application. For the prayer aim for 44–48 words across three full sentences addressed to God. Count each day separately before submitting. Put the single Write It Down invitation in action. Exact Scripture is attached separately.",
      },
      (draft) => {
        const commentaryIssues: GroqDraftError["issues"] = [];
        draft.days.forEach((day, index) => {
          if (day.number !== batch[index].number)
            throw draftFailure("wrong_day", `days.${index}.number`);
          try {
            validateQuietCopy(day);
          } catch (error) {
            if (!(error instanceof AppError)) throw error;
            throw draftFailure("stock_phrase", `days.${index}`);
          }
          for (const [field, value] of Object.entries(day)) {
            if (typeof value === "number") continue;
            try {
              checkText(Array.isArray(value) ? value : [value]);
            } catch (error) {
              if (!(error instanceof AppError)) throw error;
              commentaryIssues.push({
                code: "quotation_or_reference",
                path: `days.${index}.${field}`,
              });
            }
          }
        });
        if (commentaryIssues.length)
          throw new GroqDraftError("validation", commentaryIssues);
        if (
          repeatedReflection([
            ...days.map((day) => day.reflection),
            ...draft.days.map((day) => day.reflection),
          ])
        )
          throw draftFailure("repeated_reflection");
        const actions = days.map((day) => day.action);
        const repeatedActions: GroqDraftError["issues"] = [];
        draft.days.forEach((day, index) => {
          actions.push(day.action);
          if (!distinct(actions)) {
            actions.pop();
            repeatedActions.push({
              path: `days.${index}.action`,
              code: "repeated_writing_prompt",
            });
          }
        });
        if (repeatedActions.length)
          throw new GroqDraftError("validation", repeatedActions);
      },
    );
    batch.forEach((day, index) => {
      const prose = content.days[index];
      days.push({
        ...day,
        ...prose,
        passage: passages[index],
        explanation: day.context,
        connection: day.objective,
        interpretation: "",
        questions: ["What stands out in today’s Scripture?", prose.action],
        devotionalFormat: "baptist-daily",
        journalPrompt: prose.action,
        completedAt: null,
        completedDate: null,
      });
    });
  }
  const supportedThemes = [
    ...new Set(outline.themes.map((theme) => theme.trim().toLowerCase())),
  ]
    .filter((theme) => Object.hasOwn(themes, theme))
    .slice(0, 3);
  // No curated seed is validated or mixed into a generated journey. Only a
  // complete, independently verified model journey receives provider=groq.
  return validatePlan(
    {
      id: crypto.randomUUID(),
      title: outline.title,
      profile: {
        prompt: input.prompt,
        focus: input.prompt,
        // Theme ranking is metadata, not Scripture verification. Extra valid
        // themes must not discard an otherwise complete, verified journey.
        themes: supportedThemes.length ? supportedThemes : ["contemplation"],
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
