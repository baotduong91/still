import { test, expect } from "./fixtures";
import { Bible } from "../../lib/bible";
import { webCorpus } from "./helpers/sanity";
const bible = new Bible(webCorpus);
test.use({
  stateOverrides: {
    setupSeen: true,
    translation: "CSB",
    translationPreferenceSet: true,
    onlineScripture: true,
  },
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
