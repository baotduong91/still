import type { Bible } from "@/lib/bible";
import { GenerateInput } from "@/lib/schemas";
import { parseWithServerTranslationDefault } from "@/lib/bible/default-translation-server";
import { guidedQuietCopy } from "./today-content";
import { buildGuidedPlan } from "./guided";
export function groqGuidedPlan(raw: unknown, bible: Bible) {
  const input = parseWithServerTranslationDefault(GenerateInput, raw);
  try {
    return buildGuidedPlan({ ...input, provider: "curated" }, bible);
  } catch {
    // An open-ended prompt may have no reviewed theme. Offer an explicitly
    // guided prayer beginning, rather than fabricate a personalized answer.
    const plan = buildGuidedPlan(
      { ...input, prompt: "A gentle practice of prayer", provider: "curated" },
      bible,
    );
    plan.profile.prompt = input.prompt;
    plan.profile.focus = input.prompt;
    plan.days = plan.days.map((day, i) => ({
      ...day,
      ...guidedQuietCopy(input.prompt, i),
    }));
    return plan;
  }
}
