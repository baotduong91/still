import type { Bible } from "@/lib/bible";
import { GenerateInput } from "@/lib/schemas";
import { buildGuidedPlan } from "./guided";
export function groqGuidedPlan(raw: unknown, bible: Bible) {
  const input = GenerateInput.parse(raw);
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
    return plan;
  }
}
