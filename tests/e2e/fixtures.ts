import { test as base, expect } from "@playwright/test";
import { defaults } from "../../lib/client/store";
// Existing feature regressions run as a returning, pre-onboarding user. The
// separate onboarding suite uses clean storage and the real welcome flow.
export const test = base.extend({
  page: async ({ page }, use) => {
    const response = await page.request.post("/api/awp/plans/generate", {
      data: {
        prompt: "I want to find peace when I feel anxious",
        days: 7,
        translation: "WEB",
        provider: "curated",
      },
    });
    expect(response.ok()).toBe(true);
    const { plan } = await response.json();
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
      },
    );
    await use(page);
  },
});
export { expect };
