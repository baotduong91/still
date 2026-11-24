import { test, expect } from "./fixtures";
import { Bible } from "../../lib/bible";
import {
  todayReference,
  todayText,
  quoteText,
  webCorpus,
} from "./helpers/sanity";

// These API fixtures must reach Playwright routing rather than the installed SW.
test.use({
  serviceWorkers: "block",
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
  await page.context().route(/\/api\/modes(?:\?.*)?$/, (route) =>
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
  await page.context().route("**/api/chat/stream", (route) => {
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
  await page.context().route("**/api/chat/stream", (route) =>
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
  await page.context().route("**/api/awp/plans/generate", (route) =>
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
  await expect(page.getByLabel("I’d like to explore…")).toHaveValue("Grow through prayer");
  await expect(page.getByRole("button", { name: "Retry Groq" })).toBeVisible();
  await page.getByRole("button", { name: "Use guided study" }).click();
  await expect(page.locator("#today-scripture blockquote")).toBeVisible();
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
      devotionalFormat: "baptist-daily",
      action: `What might you write about the passage for day ${day.number}?`,
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
  await page.context().route("**/api/awp/plans/generate", (route) => {
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
  await expect(page.locator("#reflection-heading")).toHaveText("Reflection");
  await expect(page.locator("#today-reflection .question-box")).toHaveCount(0);
  await expect(page.locator("#practice-heading")).toHaveText("Write It Down");
  await expect(page.locator("#today-practice")).toContainText(plan.days[6].action);
  expect(await quoteText(page.locator("#today-scripture blockquote"))).toBe(
    plan.days[6].passage.verses.at(-1)!.text,
  );
  await page.reload();
  // Today intentionally opens at the first incomplete day after a reload.
  await page.getByRole("button", { name: "Open day 7", exact: true }).click();
  await expect(page.locator("#today-reflection")).toContainText("Lament day 7");
  await expect(page.locator("#reflection-heading")).toHaveText("Reflection");
  await expect(page.locator("#today-reflection .question-box")).toHaveCount(0);
  await expect(page.locator("#practice-heading")).toHaveText("Write It Down");
  await expect(page.locator("#today-practice")).toContainText(plan.days[6].action);
  await expect(page.locator(".error-banner")).toHaveCount(0);
});

test("generation modal freezes the prompt and releases it after failure", async ({
  page,
}) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  await page.route("**/api/awp/plans/generate", async (route) => {
    calls++;
    await pending;
    await route.fulfill({
      status: 400,
      json: {
        error: {
          code: "INVALID_INPUT",
          message: "Try again with your saved prompt.",
        },
      },
    });
  });
  await page.goto("/create");
  const prompt = page.getByLabel("I’d like to explore…");
  await prompt.fill("Trust God in everyday moments");
  await page
    .getByRole("button", { name: "Begin my journey", exact: true })
    .click();
  const modal = page.getByRole("dialog", { name: "Preparing your journey" });
  await expect(modal).toBeVisible();
  await expect(prompt).toBeDisabled();
  await expect(page.getByLabel("Make a little space for")).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(modal).toBeVisible();
  await page.keyboard.press("Tab");
  expect(
    await page.evaluate(() => !!document.activeElement?.closest("dialog")),
  ).toBe(true);
  await page.screenshot({ path: "/tmp/still-generation-modal.png" });
  release();
  await expect(modal).not.toBeVisible();
  await expect(prompt).toBeEnabled();
  await expect(prompt).toHaveValue("Trust God in everyday moments");
  expect(calls).toBe(1);
});

test("receiving an answer preserves a follow-up question typed while waiting", async ({
  page,
}) => {
  const followUp = "How can I practice this today?";
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/chat/stream", async (route) => {
    await pending;
    await route.fulfill({
      contentType: "application/x-ndjson",
      body: JSON.stringify({ type: "result", response }) + "\n",
    });
  });
  await page.goto("/chat");
  const question = page.getByLabel("Your Bible question");
  await question.fill("Help me understand prayer.");
  const sent = page.waitForRequest("**/api/chat/stream");
  await page.getByRole("button", { name: "Send question" }).click();
  await sent;
  await question.fill(followUp);
  release();
  await expect(page.locator(".chat-answer")).toHaveText(response.answer);
  await expect(question).toHaveValue(followUp);
});

test("leaving Chat cancels a pending guided answer", async ({ page }) => {
  await page.goto("/settings");
  await page
    .getByLabel("How should journeys be written?", { exact: true })
    .selectOption("curated");
  await page.goto("/chat");
  await page.evaluate(() => {
    const original = window.fetch;
    window.fetch = function (input, init) {
      if (String(input) !== "/api/awp/chat")
        return original.call(this, input, init);
      sessionStorage.setItem("chat-request-state", "pending");
      return new Promise<Response>((_, reject) =>
        init?.signal?.addEventListener(
          "abort",
          () => {
            sessionStorage.setItem("chat-request-state", "aborted");
            reject(new DOMException("Aborted", "AbortError"));
          },
          { once: true },
        ),
      );
    };
  });
  await page
    .getByLabel("Your Bible question")
    .fill("How can I practice patience?");
  await page.getByRole("button", { name: "Send question" }).click();
  const requestState = () =>
    page.evaluate(() => sessionStorage.getItem("chat-request-state"));
  await expect.poll(requestState).toBe("pending");
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Journal", exact: true })
    .click();
  await expect.poll(requestState).toBe("aborted");
  await expect(page.locator(".error-banner")).toHaveCount(0);
});
