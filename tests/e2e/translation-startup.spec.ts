import { test, expect } from "./fixtures";
import { Bible } from "../../lib/bible";
import { webCorpus } from "./helpers/sanity";
import { installVoiceHarness } from "./helpers/sanity";
const bible = new Bible(webCorpus);
test.use({
  serviceWorkers: "block",
  viewport: { width: 402, height: 874 },
  isMobile: true,
  hasTouch: true,
  stateOverrides: {
    setupSeen: true,
    translation: "CSB",
    translationPreferenceSet: true,
    onlineScripture: true,
  },
});

function licensed(reference: string, translation = "CSB") {
  const local = bible.lookup(reference);
  const verses = local.verses.map((v) => ({
    ...v,
    text: `Exact ${translation} response fixture ${v.verse}`,
  }));
  return {
    ...local,
    reference,
    requestedReference: reference,
    translation,
    requestedTranslation: translation,
    citationScheme: "edition",
    source: "api.bible",
    fallback: false,
    attribution: "Provider fixture",
    verses,
    text: verses.map((v) => v.text).join(" "),
  };
}

test.beforeEach(async ({ page }) => {
  await installVoiceHarness(page);
});

test("initial WEB fallback recovers to the selected CSB without a book search", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/awp/scripture?*", async (route) => {
    const reference = new URL(route.request().url()).searchParams.get(
      "reference",
    )!;
    calls++;
    await route.fulfill({
      json: {
        passage:
          calls === 1
            ? {
                ...bible.lookup(reference, "CSB"),
                notice: "Temporary connection problem. Exact WEB is available.",
              }
            : licensed(reference),
      },
    });
  });
  await page.goto("/scripture");
  await expect(page.getByLabel("Reading translation")).toHaveValue("CSB");
  await expect(page.locator(".translation-badge")).toHaveText("CSB");
  await expect(page.locator(".verse-row").first()).toContainText(
    "Exact CSB response fixture 1",
  );
  expect(calls).toBe(2);
});

test("edition choice survives Settings navigation, reload and an offline/reconnect cycle", async ({
  page,
  context,
}) => {
  const requests: string[] = [];
  await page.route("**/api/awp/scripture?*", async (route) => {
    const query = new URL(route.request().url()).searchParams;
    requests.push(query.get("translation")!);
    await route.fulfill({
      json: {
        passage: licensed(query.get("reference")!, query.get("translation")!),
      },
    });
  });
  await page.goto("/settings");
  await page.getByRole("link", { name: "Back to Today", exact: true }).click();
  await expect(page.locator(".daily-flow")).toBeVisible();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Scripture", exact: true })
    .click();
  await expect(page.locator(".translation-badge")).toHaveText("CSB");
  await page.getByLabel("Reading translation").selectOption("NLT");
  await expect(page.locator(".translation-badge")).toHaveText("NLT");
  await page.reload();
  await expect(page.getByLabel("Reading translation")).toHaveValue("NLT");
  await expect(page.locator(".translation-badge")).toHaveText("NLT");
  await context.setOffline(true);
  await expect(page.locator(".translation-badge")).toHaveText("WEB");
  await expect(page.getByLabel("Reading translation")).toHaveValue("NLT");
  await context.setOffline(false);
  await expect(page.locator(".translation-badge")).toHaveText("NLT");
  expect(requests).toContain("NLT");
});

test("a failed edition request offers retry and never presents inconsistent verse bytes", async ({
  page,
}) => {
  let healthy = false;
  await page.route("**/api/awp/scripture?*", async (route) => {
    const reference = new URL(route.request().url()).searchParams.get(
      "reference",
    )!;
    const passage = licensed(reference);
    if (!healthy)
      passage.text = "A paraphrase that does not match the retrieved verses.";
    await route.fulfill({ json: { passage } });
  });
  await page.goto("/scripture");
  await expect(
    page.getByRole("button", { name: "Retry CSB", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".translation-badge")).toHaveText("WEB");
  await expect(page.locator(".reader-paper")).not.toContainText("A paraphrase");
  healthy = true;
  await page.getByRole("button", { name: "Retry CSB", exact: true }).click();
  await expect(page.locator(".translation-badge")).toHaveText("CSB");
});

test("licensed chapter opens in bounded pages without a search", async ({
  page,
}) => {
  const requests: string[] = [];
  await page.context().route("**/api/awp/scripture?*", async (route) => {
    const reference = new URL(route.request().url()).searchParams.get(
      "reference",
    )!;
    requests.push(reference);
    const local = bible.lookup(reference);
    expect(local.verses.length).toBeLessThanOrEqual(20);
    await route.fulfill({
      json: {
        passage: {
          ...local,
          translation: "CSB",
          requestedTranslation: "CSB",
          requestedReference: reference,
          source: "api.bible",
          fallback: false,
          attribution: "Test provider",
          verses: local.verses.map((v) => ({
            ...v,
            text: `Exact response fixture ${v.verse}`,
          })),
          text: local.verses
            .map((v) => `Exact response fixture ${v.verse}`)
            .join(" "),
        },
      },
    });
  });
  await page.goto("/scripture");
  await expect(page.locator(".translation-badge")).toHaveText("CSB");
  await expect(page.locator(".verse-row")).toHaveCount(20);
  await expect(page.locator(".verse-row").first()).toContainText(
    "Exact response fixture 1",
  );
  expect(requests).toContain("John 1:1-20");
  await page.getByRole("button", { name: "Next verses", exact: true }).click();
  await expect(page.locator(".verse-row").first()).toContainText(
    "Exact response fixture 21",
  );
  await page.getByRole("button", { name: "Next verses", exact: true }).click();
  await expect(page.locator(".verse-row")).toHaveCount(11);
  await expect(page.locator(".verse-row").last()).toContainText(
    "Exact response fixture 51",
  );
  await expect(
    page.getByRole("button", { name: "Next verses", exact: true }),
  ).toBeDisabled();
});
