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

test("Groq is opt-in on mobile and streams only commentary beside exact retrieved Scripture", async ({
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
  await expect(page.getByLabel("Guide", { exact: true })).toHaveValue(
    "curated",
  );
  await page
    .getByRole("button", { name: "Check Groq connection", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Groq connected" }),
  ).toBeVisible();
  await expect(page.getByLabel("Guide", { exact: true })).toHaveValue(
    "curated",
  );
  expect(calls).toEqual([]);
  await page.getByLabel("Guide", { exact: true }).selectOption("cloud");
  await page.goto("/chat");
  await page.getByLabel("Your Bible question").fill("Why is there suffering?");
  await page
    .getByRole("button", { name: "Send question", exact: true })
    .click();
  await expect(page.locator(".error-banner")).toContainText(
    "Enable cloud sharing",
  );
  expect(calls).toEqual([]);
  await page.goto("/settings");
  await page.getByRole("checkbox", { name: /I choose to send/ }).check();
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
  await page.getByLabel("Guide", { exact: true }).selectOption("curated");
  await page.getByLabel("Guide", { exact: true }).selectOption("cloud");
  await expect(
    page.getByRole("checkbox", { name: /I choose to send/ }),
  ).not.toBeChecked();
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
  await page.getByLabel("Guide", { exact: true }).selectOption("cloud");
  await page.getByRole("checkbox", { name: /I choose to send/ }).check();
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
