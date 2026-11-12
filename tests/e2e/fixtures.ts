import { test as base, expect } from "@playwright/test";
import { defaults, type SavedState } from "../../lib/client/store";
import type { PlanType } from "../../lib/schemas";
// Existing feature regressions run as a returning, pre-onboarding user. The
// separate onboarding suite uses clean storage and the real welcome flow.
export const test = base.extend<{
  savedPlan: PlanType;
  stateOverrides: Partial<SavedState>;
}>({
  stateOverrides: [{}, { option: true }],
  savedPlan: async ({ context }, use) => {
    const response = await context.request.post("/api/awp/plans/generate", {
      data: {
        prompt: "I want to find peace when I feel anxious",
        days: 7,
        translation: "WEB",
        provider: "curated",
      },
    });
    expect(response.ok()).toBe(true);
    const { plan } = await response.json();
    await use(plan);
  },
  page: async ({ page, savedPlan: plan, stateOverrides }, use) => {
    await page.addInitScript(
      (saved) => {
        if (sessionStorage.getItem("still-e2e-returning")) return;
        localStorage.setItem("still-pending-save", JSON.stringify(saved));
        sessionStorage.setItem("still-e2e-returning", "1");
      },
      {
        ...defaults,
        journeyOnboarding: undefined,
        plans: [plan],
        activeId: plan.id,
        remoteIds: [plan.id],
        ...stateOverrides,
      },
    );
    await use(page);
  },
});
export { expect };
