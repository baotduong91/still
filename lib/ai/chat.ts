import type { Bible } from "@/lib/bible";
import { ChatInput, type ChatType } from "@/lib/schemas";
import { parseWithServerTranslationDefault } from "@/lib/bible/default-translation-server";
import { themes } from "./themes";
export function answerQuestion(raw: unknown, bible: Bible): ChatType {
  const input = parseWithServerTranslationDefault(ChatInput, raw);
  const direct = input.question.match(
    /(?:[1-3]\s+)?[A-Za-z]+(?:\s+of\s+[A-Za-z]+)?\s+\d{1,3}(?::\d{1,3}(?:[-–]\d{1,3})?)?/,
  );
  if (direct) {
    const passage = bible.lookup(direct[0], input.translation);
    const lesson = Object.values(themes)
      .flatMap((t) => t.lessons)
      .find((l) => l.reference === passage.reference);
    return {
      answer:
        lesson?.insight ??
        "Here is the passage you requested. Read the surrounding chapter before drawing a conclusion; the local guide has no reviewed commentary for this passage.",
      citations: [passage],
      context: `Read ${passage.verses[0].book} ${passage.verses[0].chapter} in full.`,
      interpretation:
        "Commentary is interpretation. The separately displayed passage is exact retrieved Scripture.",
      provider: "curated",
      limited: !lesson,
    };
  }
  const lower = input.question.toLowerCase();
  const theme = Object.values(themes)
    .map((t) => ({
      t,
      score: t.keywords.filter((k) =>
        new RegExp(`\\b${k}\\w*`, "i").test(lower),
      ).length,
    }))
    .sort((a, b) => b.score - a.score)[0];
  if (!theme.score)
    return {
      answer:
        "Guided study has no reviewed passage match for this question. For an open-ended answer, choose Local Mac · Ollama or an explicitly enabled cloud model in Settings. You can also enter a specific reference or a guided topic such as grief, prayer, or anxiety.",
      citations: [],
      context:
        "No matching passage was selected; no biblical claim is being made.",
      interpretation:
        "Local guide limitation. Enable an optional model in Settings for a richer explanation of retrieved passages.",
      provider: "curated",
      limited: true,
    };
  const lessons = theme.t.lessons.slice(0, 3);
  return {
    answer: lessons.map((l) => `${l.insight} (${l.reference})`).join("\n\n"),
    citations: lessons.map((l) => bible.lookup(l.reference, input.translation)),
    context:
      "These are thematic starting points, not an exhaustive answer. Open each chapter to read the surrounding argument or narrative.",
    interpretation:
      "Devotional interpretation. Traditions may differ; these texts do not establish a guaranteed personal outcome.",
    provider: "curated",
    limited: true,
  };
}
