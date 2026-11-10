import { Bible } from "@/lib/bible";
import { AppError } from "@/lib/awp/errors";
import {
  GenerateInput,
  Plan,
  type PlanType,
  type DayType,
} from "@/lib/schemas";
import { themes, type Lesson } from "./themes";
const lenses: { pattern: RegExp; lesson: Lesson }[] = [
  {
    pattern: /\b(sleep|night|bedtime|insomnia)\b/i,
    lesson: {
      reference: "Psalms 4:8",
      title: "Rest with open hands",
      insight:
        "The psalm closes with a declaration of peaceful rest grounded in the Lord, after naming distress and seeking his attention.",
      action:
        "Before bed, write one concern you can leave unfinished tonight. Make space for a brief, honest prayer.",
    },
  },
  {
    pattern: /\b(work|career|job|interview|boss)\b/i,
    lesson: {
      reference: "Colossians 3:23-24",
      title: "Faithfulness in daily work",
      insight:
        "Paul addresses work in the setting of an ancient household code. Applying it today requires care: wholehearted service does not justify exploitation or unsafe working conditions.",
      action:
        "Identify one work responsibility you can fulfill with care, and one boundary that protects a sustainable pace.",
    },
  },
  {
    pattern: /\b(family|parent|child|children|marriage|spouse)\b/i,
    lesson: {
      reference: "Colossians 3:12-15",
      title: "Make room for one another",
      insight:
        "Paul calls the community to compassion, humility, patience, and love. These qualities can guide close relationships without excusing harm.",
      action:
        "In one safe family interaction, listen fully before offering your response. Name what you heard.",
    },
  },
  {
    pattern: /\b(conflict|argument|argue|angry)\b/i,
    lesson: {
      reference: "James 1:19-20",
      title: "Listen before responding",
      insight:
        "James links a readiness to listen with restraint in speech and anger. This invites self-examination rather than a way to control another person.",
      action:
        "Draft a difficult reply without sending it. Revisit it after a pause and remove language meant to wound.",
    },
  },
];
export function extractGoals(prompt: string) {
  const lower = prompt.toLowerCase();
  const ranked = Object.entries(themes)
    .map(([id, t]) => ({
      id,
      score: t.keywords.reduce(
        (n, k) => n + (new RegExp(`\\b${k}\\w*`, "i").test(lower) ? 1 : 0),
        0,
      ),
    }))
    .filter((t) => t.score > 0)
    .sort((a, b) => b.score - a.score);
  if (!ranked.length)
    throw new AppError(
      "PLAN_GENERATION_FAILED",
      "Tell us which area you want to explore: anxiety, grief, forgiveness, prayer, patience, decisions, healing, or gratitude.",
    );
  return {
    prompt,
    themes: ranked.slice(0, 3).map((t) => t.id),
    focus: prompt,
    pace: /gentle|overwhelmed|exhaust|tired|short|busy/i.test(prompt)
      ? ("gentle" as const)
      : ("standard" as const),
  };
}
export function designObjectives(
  profile: ReturnType<typeof extractGoals>,
  count: number,
) {
  return Array.from({ length: count }, (_, i) => {
    const theme = themes[profile.themes[i % profile.themes.length]];
    const position = Math.floor(i / profile.themes.length);
    const lens = lenses.find((l) => l.pattern.test(profile.prompt));
    const lesson =
      i === 1 && lens
        ? lens.lesson
        : theme.lessons[position % theme.lessons.length];
    const deepening = position >= theme.lessons.length;
    return {
      lesson,
      theme,
      title: deepening
        ? `Practice again: ${lesson.title.toLowerCase()}`
        : lesson.title,
      objective: `${deepening ? "Deepen" : "Explore"} ${lesson.title.toLowerCase()} in relation to your stated goal: ${profile.focus}`,
      deepening,
    };
  });
}
export function validatePlan(plan: PlanType, bible: Bible) {
  Plan.parse(plan);
  if (
    new Set(plan.days.map((d) => d.title)).size !== plan.days.length ||
    new Set(plan.days.map((d) => d.reflection)).size !== plan.days.length ||
    new Set(plan.days.map((d) => d.action)).size !== plan.days.length
  )
    throw new AppError(
      "PLAN_GENERATION_FAILED",
      "Repeated daily progression was rejected.",
    );
  for (const [i, day] of plan.days.entries())
    if (
      day.number !== i + 1 ||
      !bible.validate(day.passage) ||
      day.reflection.length < 60 ||
      day.questions.length !== 2
    )
      throw new AppError(
        "PLAN_GENERATION_FAILED",
        "The Scripture or devotional validation failed.",
      );
  return plan;
}
export function buildPlan(raw: unknown, bible: Bible): PlanType {
  const input = GenerateInput.parse(raw);
  const profile = extractGoals(input.prompt);
  const outline = designObjectives(profile, input.days);
  const days: DayType[] = outline.map((step, i) => {
    const passage = bible.lookup(step.lesson.reference, input.translation);
    return {
      number: i + 1,
      title: step.title,
      objective: step.objective,
      passage,
      context: `Read ${passage.verses[0].book} ${passage.verses[0].chapter} for the surrounding literary context. ${step.lesson.insight}`,
      explanation: step.lesson.insight,
      reflection: `You brought this intention: “${profile.focus}” ${step.lesson.insight} ${step.deepening ? "Return to your earlier notes. Notice what has changed through practice and what still needs patience." : "Let this passage meet that intention without requiring it to answer more than it says."}`,
      connection: `For your goal, consider this concrete practice: ${step.lesson.action}`,
      questions: [
        `What do you notice in ${passage.reference} that speaks to your stated goal?`,
        `As you ${step.title.toLowerCase()}, what is one honest response you can make today?`,
      ],
      prayer: `God, meet me as I ${step.title.toLowerCase()}. Help me attend to these words with honesty and humility. Give me courage for the next faithful step and patience with what remains unresolved. Amen.`,
      action: `${step.deepening ? "Review your earlier attempt and choose one adjustment. " : ""}${profile.pace === "gentle" ? "Keep this small; one minute is enough. " : ""}${step.lesson.action}`,
      journalPrompt: `What stood out as you explored ${step.title.toLowerCase()}?`,
      bridge:
        i === outline.length - 1
          ? "Carry one practice forward. You can revisit this journey at your own pace."
          : `Tomorrow: ${outline[i + 1].title.toLowerCase()}. Bring one observation from today.`,
      interpretation:
        "Devotional interpretation, not a quotation or a personal revelation. Christian traditions may read details differently. No promise of a particular outcome is implied.",
      completedAt: null,
      completedDate: null,
    };
  });
  return validatePlan(
    {
      id: crypto.randomUUID(),
      title:
        profile.themes.length === 1
          ? themes[profile.themes[0]].title
          : profile.themes
              .map((t) => t.replace("decision-making", "wisdom"))
              .join(" & "),
      profile,
      translation: input.translation,
      createdAt: new Date().toISOString(),
      revision: 0,
      provider: "curated",
      days,
      feedback: [],
    },
    bible,
  );
}
export function adaptPlan(
  plan: PlanType,
  dayNumber: number,
  feedback: string,
): PlanType {
  if (!plan.days[dayNumber - 1])
    throw new AppError("INVALID_INPUT", "Day is outside this plan.");
  const copy = structuredClone(plan);
  const gentle = /hard|tired|overwhelm|too much|short|slow|gentle/i.test(
    feedback,
  );
  copy.days = copy.days.map((d) =>
    d.number <= dayNumber || d.completedAt
      ? d
      : {
          ...d,
          reflection:
            d.reflection.split(" Your latest reflection:")[0] +
            ` Your latest reflection: “${feedback}” As you read, notice what this adds to your original goal.`,
          action: gentle
            ? `For now, take only the first small step. ${d.action.replace(/^For now, take only the first small step\. /, "")}`
            : d.action,
        },
  );
  copy.feedback.push({
    day: dayNumber,
    text: feedback,
    at: new Date().toISOString(),
  });
  copy.revision++;
  return copy;
}
