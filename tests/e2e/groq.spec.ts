import { test, expect } from "./fixtures";
import { Bible } from "../../lib/bible";
import {
  todayReference,
  todayText,
  quoteText,
  webCorpus,
} from "./helpers/sanity";

test.use({
  viewport: { width: 390, height: 844 },
  stateOverrides: { setupSeen: true },
});
const response = {
  answer:
    "These passages invite patient attention and trust while leaving room for honest questions.",
  interpretation:
    "Interpretation of the separately retrieved text, not a Scripture quotation.",
  context: "A deterministic model fixture.",
  provider: "groq",
  limited: false,
  citations: [new Bible(webCorpus).lookup(todayReference)],
};
test.beforeEach(async ({ page }) => {
  await page.route(/\/api\/modes(?:\?.*)?$/, (route) =>
    route.fulfill({
      json: {
        modes: {
          guided: { configured: true },
          ollama: { configured: false, hostedLoopback: true },
          cloud: { configured: true, vendor: "groq" },
        },
        ollamaReachable: null,
        groqStatus: route.request().url().includes("check=groq")
          ? "connected"
          : null,
      },
    }),
  );
});

test("choosing Guided keeps Groq off; choosing Custom streams commentary beside exact Scripture", async ({
  page,
}) => {
  const calls: {
    consent: string | undefined;
    provider: string;
    question: string;
  }[] = [];
  await page.route("**/api/chat/stream", (route) => {
    const input = route.request().postDataJSON();
    calls.push({
      consent: route.request().headers()["x-still-cloud-consent"],
      provider: input.provider,
      question: input.question,
    });
    return route.fulfill({
      contentType: "application/x-ndjson",
      body:
        [
          { type: "citations", passages: response.citations },
          { type: "text", text: response.answer },
          { type: "result", response },
        ]
          .map((e) => JSON.stringify(e))
          .join("\n") + "\n",
    });
  });
  await page.goto("/settings");
  const guide = page.getByLabel("How should journeys be written?", {
    exact: true,
  });
  await expect(guide).toHaveValue("cloud");
  await guide.selectOption("curated");
  await page
    .getByRole("button", { name: "Check Groq connection", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Groq connected" }),
  ).toBeVisible();
  await expect(
    page.getByLabel("How should journeys be written?", { exact: true }),
  ).toHaveValue("curated");
  expect(calls).toEqual([]);
  await page.goto("/chat");
  await page.getByLabel("Your Bible question").fill("prayer");
  await page
    .getByRole("button", { name: "Send question", exact: true })
    .click();
  await expect(page.locator(".guide-limit")).toContainText("Guided study");
  expect(calls).toEqual([]);
  await page.goto("/settings");
  await page
    .getByLabel("How should journeys be written?", { exact: true })
    .selectOption("cloud");
  await page.goto("/chat");
  await page.getByLabel("Your Bible question").fill("Why is there suffering?");
  await page
    .getByRole("button", { name: "Send question", exact: true })
    .click();
  await expect(page.locator(".chat-answer")).toHaveText(response.answer);
  await expect(page.getByLabel("Interpretation in progress")).toHaveCount(0);
  await page.getByText("Read exact passage", { exact: true }).click();
  expect(await quoteText(page.locator(".chat-messages blockquote"))).toBe(
    todayText,
  );
  expect(calls).toEqual([
    { consent: "true", provider: "cloud", question: "Why is there suffering?" },
  ]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.goto("/settings");
  await page
    .getByLabel("How should journeys be written?", { exact: true })
    .selectOption("curated");
  await page.reload();
  await expect(
    page.getByLabel("How should journeys be written?", { exact: true }),
  ).toHaveValue("curated");
});

test("Groq rate limiting labels the guided response and never breaks a saved day", async ({
  page,
  savedPlan,
}) => {
  await page.route("**/api/chat/stream", (route) =>
    route.fulfill({
      contentType: "application/x-ndjson",
      body:
        [
          { type: "status", status: "rate-limited", fallback: true },
          {
            type: "result",
            response: { ...response, provider: "curated", limited: true },
          },
        ]
          .map((e) => JSON.stringify(e))
          .join("\n") + "\n",
    }),
  );
  await page.route("**/api/awp/plans/generate", (route) =>
    route.fulfill({
      headers: {
        "X-Still-Cloud-Status": "rate-limited",
        "X-Still-Fallback": "guided",
      },
      json: {
        plan: { ...savedPlan, id: crypto.randomUUID(), provider: "curated" },
      },
    }),
  );
  await page.goto("/settings");
  await page
    .getByLabel("How should journeys be written?", { exact: true })
    .selectOption("cloud");
  await page.goto("/chat");
  await page
    .getByLabel("Your Bible question")
    .fill("Help me understand prayer");
  await page
    .getByRole("button", { name: "Send question", exact: true })
    .click();
  await expect(page.locator(".guide-limit")).toContainText("Guided study");
  await expect(
    page.getByRole("status").filter({ hasText: /Using guided/ }),
  ).toBeVisible();
  await page.goto("/settings");
  await expect(
    page.getByRole("status").filter({ hasText: "Groq rate limited" }),
  ).toBeVisible();
  await page.goto("/create");
  await page.getByLabel("I’d like to explore…").fill("Grow through prayer");
  await page
    .getByRole("button", { name: "Begin my journey", exact: true })
    .click();
  await expect(page.locator("#today-scripture blockquote")).toContainText(
    todayText,
  );
  await expect(
    page.getByRole("status").filter({ hasText: /Using guided/ }),
  ).toBeVisible();
  await expect(page.locator(".error-banner")).toHaveCount(0);
});

test("a custom seven-day journey clears an earlier fallback and persists every day on mobile", async ({
  page,
  savedPlan,
}) => {
  const prompt = "A seven-day lament with room for unanswered questions";
  const plan = {
    ...savedPlan,
    id: crypto.randomUUID(),
    provider: "groq",
    title: "Room for honest lament",
    profile: { ...savedPlan.profile, prompt, focus: prompt },
    days: savedPlan.days.map((day) => ({
      ...day,
      reflection: `Lament day ${day.number}: attend to the supplied passage and make room for an honest unanswered question without demanding an easy answer.`,
    })),
  };
  await page.addInitScript(() => {
    if (sessionStorage.getItem("groq-e2e-fallback-seeded")) return;
    sessionStorage.setItem("groq-e2e-fallback-seeded", "1");
    sessionStorage.setItem(
      "still-cloud-status",
      JSON.stringify({ status: "unavailable", fallback: true }),
    );
  });
  const calls: unknown[] = [];
  await page.route("**/api/awp/plans/generate", (route) => {
    expect(route.request().headers()["x-still-cloud-consent"]).toBe("true");
    calls.push(route.request().postDataJSON());
    return route.fulfill({
      headers: { "X-Still-Cloud-Status": "connected" },
      json: { plan },
    });
  });
  await page.goto("/create");
  await page.getByLabel("I’d like to explore…").fill(prompt);
  await expect(page.getByLabel("Make a little space for")).toHaveValue("7");
  await page
    .getByRole("button", { name: "Begin my journey", exact: true })
    .click();
  await expect(page.getByText("Day 1 of 7", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: /Using guided/ }),
  ).toHaveCount(0);
  expect(calls).toEqual([
    { prompt, days: 7, translation: "WEB", provider: "cloud" },
  ]);
  await page.getByRole("button", { name: "Open day 7", exact: true }).click();
  await expect(page.getByText("Day 7 of 7", { exact: true })).toBeVisible();
  await expect(page.locator("#today-reflection")).toContainText("Lament day 7");
  expect(await quoteText(page.locator("#today-scripture blockquote"))).toBe(
    plan.days[6].passage.verses.at(-1)!.text,
  );
  await page.reload();
  // Today intentionally opens at the first incomplete day after a reload.
  await page.getByRole("button", { name: "Open day 7", exact: true }).click();
  await expect(page.locator("#today-reflection")).toContainText("Lament day 7");
  await expect(page.locator(".error-banner")).toHaveCount(0);
});
