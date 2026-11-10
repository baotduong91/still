import { test, expect } from "@playwright/test";
test("today opens at Day 1 and completes the guided sequence", async ({
  page,
}) => {
  await page.goto("/today");
  await expect(
    page.getByRole("heading", { name: "One day at a time" }),
  ).toBeVisible();
  await expect(page.getByText("Day 1 of 7", { exact: false })).toBeVisible();
  await expect(page.locator("blockquote")).toContainText("tomorrow");
  await page.getByRole("button", { name: "Continue to reflection" }).click();
  await page.getByRole("button", { name: "Continue to prayer" }).click();
  await expect(
    page.getByText("A personal prayer inspired", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue to practice" }).click();
  await page
    .getByRole("button", { name: "Complete today", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Day complete" }),
  ).toBeDisabled();
  await page.reload();
  await expect(page.getByText("Day 2 of 7", { exact: false })).toBeVisible();
});
test("natural language creates a differentiated real Day 1", async ({
  page,
}) => {
  await page.goto("/create");
  await page
    .getByLabel("I’d like to explore…")
    .fill("I am grieving a loss and want to make room for lament");
  await page.getByRole("button", { name: "Begin my journey" }).click();
  await expect(page).toHaveURL(/today/);
  await expect(
    page.getByRole("heading", { name: "Permission to lament" }),
  ).toBeVisible();
  await expect(page.getByText("Day 1 of 7", { exact: false })).toBeVisible();
});
test("Bible lookup validates references, highlights and saves a note", async ({
  page,
}) => {
  await page.goto("/scripture");
  await page.getByLabel("Search Scripture", { exact: true }).fill("John 3:16");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.locator(".verses")).toContainText(
    "For God so loved the world",
  );
  await page.getByLabel("Select verse 16").click();
  await page.getByRole("button", { name: "Highlight", exact: true }).click();
  await page.getByLabel("Your note").fill("A gift to receive.");
  await page.reload();
  await page.getByLabel("Search Scripture", { exact: true }).fill("John 3:16");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.locator(".highlighted")).toBeVisible();
  await expect(page.getByText("A gift to receive.")).toBeVisible();
  await page.getByLabel("Search Scripture", { exact: true }).fill("John 3:999");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.locator(".error-banner")).toBeVisible();
});
test("chat separates interpretation from exact citations", async ({ page }) => {
  await page.goto("/chat");
  await page
    .getByLabel("Your Bible question")
    .fill("What does Scripture say about anxiety?");
  await page.getByRole("button", { name: "Send question" }).click();
  await expect(page.locator(".answer details")).toHaveCount(3);
  await page.locator(".answer summary").first().click();
  await expect(page.locator(".answer blockquote").first()).toContainText(
    "Therefore I tell you",
  );
  await expect(page.locator(".answer .fine-print").first()).toContainText(
    "interpretation",
  );
});
test("saved Bible, plans and journal remain available offline across screens", async ({
  page,
  context,
}) => {
  await page.goto("/settings");
  await page.getByRole("button", { name: "Download for offline" }).click();
  await expect(page.getByRole("status")).toContainText("Ready offline", {
    timeout: 60000,
  });
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await context.setOffline(true);
  await page.getByRole("link", { name: "Today", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "One day at a time" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Scripture", exact: true }).click();
  await page
    .getByLabel("Search Scripture", { exact: true })
    .fill("Revelation 22:21");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.locator(".verses")).toContainText("grace");
  await page.getByRole("link", { name: "Journal", exact: true }).click();
  await page.getByLabel("Today, I’m noticing…").fill("A moment kept offline.");
  await page.getByRole("button", { name: "Save this moment" }).click();
  await page.reload();
  await expect(
    page.getByText("A moment kept offline.", { exact: true }),
  ).toBeVisible();
  await context.setOffline(false);
});
test("mobile and dark mode retain usable navigation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/settings");
  await page.getByLabel("Appearance").selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("link", { name: "Today", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "One day at a time" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("manifest is discoverable at both paths", async ({ request }) => {
  const a = await request.get("/agent.json"),
    b = await request.get("/.well-known/agent.json");
  expect(a.status()).toBe(200);
  expect(a.headers()["content-type"]).toContain("application/json");
  expect(await a.json()).toEqual(await b.json());
});

test("offline completion synchronizes its revision before later feedback", async ({
  page,
  context,
}) => {
  await page.goto("/settings");
  await page.getByRole("button", { name: "Download for offline" }).click();
  await expect(page.getByRole("status")).toContainText("Ready offline");
  await page.reload();
  await context.setOffline(true);
  await page.getByRole("link", { name: "Today", exact: true }).click();
  await page.getByRole("tab", { name: "04 Practice" }).click();
  await page
    .getByRole("button", { name: "Complete today", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Day complete" }),
  ).toBeDisabled();
  await context.setOffline(false);
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(
    page.getByText("0 changes waiting to sync.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Today", exact: true }).click();
  await page
    .getByLabel("What stood out today?")
    .fill("I need a slower pace for the remaining days");
  await page
    .getByRole("button", { name: "Save reflection and adapt remaining days" })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Saved. Future days gently updated.",
  );
});

test("verse artwork exports a real PNG", async ({ page }) => {
  await page.goto("/today");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Verse artwork" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("still-daily-verse.png");
  expect(await file.failure()).toBeNull();
});

test("a lost server session cannot prevent completion or lose the saved plan", async ({
  page,
}) => {
  await page.goto("/today");
  await expect(
    page.getByRole("heading", { name: "One day at a time" }),
  ).toBeVisible();
  await page.route("**/api/awp/plans/complete", (route) =>
    route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "NOT_FOUND",
          message: "No plan exists with that ID in this session.",
        },
      }),
    }),
  );
  await page.getByRole("tab", { name: "04 Practice" }).click();
  await page
    .getByRole("button", { name: "Complete today", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Day complete" }),
  ).toBeDisabled();
  await expect(page.locator(".error-banner")).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("Day 2 of 7", { exact: false })).toBeVisible();
  await page
    .getByLabel("What stood out today?")
    .fill("I need a gentle next step");
  await page
    .getByRole("button", { name: "Save reflection and adapt remaining days" })
    .click();
  await expect(page.getByRole("status")).toContainText("Saved.");
});

test("curated chat and journals survive unavailable server storage", async ({
  page,
}) => {
  await page.goto("/chat");
  await page.getByLabel("Your Bible question").waitFor();
  await page.route("**/api/awp/chat", (r) =>
    r.fulfill({
      status: 500,
      contentType: "application/json",
      body: '{"error":{"code":"INTERNAL_ERROR","message":"Unavailable"}}',
    }),
  );
  await page.getByLabel("Your Bible question").fill("Help me with anxiety");
  await page.getByRole("button", { name: "Send question" }).click();
  await expect(page.locator(".answer details")).toHaveCount(3);
  await page.goto("/journal");
  await page.getByLabel("Today, I’m noticing…").waitFor();
  await page.route("**/api/awp/journal", (r) =>
    r.fulfill({
      status: 500,
      contentType: "application/json",
      body: '{"error":{"code":"INTERNAL_ERROR","message":"Unavailable"}}',
    }),
  );
  await page
    .getByLabel("Today, I’m noticing…")
    .fill("Keep my words even if the server restarts.");
  await page.getByRole("button", { name: "Save this moment" }).click();
  await page.reload();
  await expect(
    page.getByText("Keep my words even if the server restarts.", {
      exact: true,
    }),
  ).toBeVisible();
});
