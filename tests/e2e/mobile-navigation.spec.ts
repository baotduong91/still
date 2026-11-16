import { test, expect } from "./fixtures";
import { installVoiceHarness, assertTouchTarget } from "./helpers/sanity";

test.use({
  viewport: { width: 402, height: 874 },
  isMobile: true,
  hasTouch: true,
  stateOverrides: {
    setupSeen: true,
    speechEngine: "device",
    translation: "WEB",
    translationPreferenceSet: true,
  },
});

test("iPhone 16 Pro navigation keeps settings exit, reader tools and saved Practice reachable", async ({
  page,
}, testInfo) => {
  await installVoiceHarness(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const theme of ["light", "dark"]) {
    await page.goto("/settings");
    await page.getByLabel("Appearance").selectOption(theme);
    await page
      .getByRole("link", { name: "Bible edition", exact: true })
      .click();
    const selectedEdition = await page
      .getByLabel("Preferred translation")
      .boundingBox();
    const exitBar = await page.locator(".settings-exit-bar").boundingBox();
    expect(selectedEdition!.y).toBeGreaterThanOrEqual(
      exitBar!.y + exitBar!.height,
    );
    await page.evaluate(() =>
      scrollTo(0, document.documentElement.scrollHeight),
    );
    const exit = page.getByRole("link", { name: "Back to Today", exact: true });
    await expect(exit).toBeInViewport();
    await assertTouchTarget(exit);
    await exit.click();
    await expect(page.locator(".daily-flow")).toBeVisible();
    for (const name of [
      "Scripture",
      "Bible chat",
      "Journal",
      "My journeys",
      "Today",
    ]) {
      await page
        .getByRole("navigation", { name: "Main navigation" })
        .getByRole("link", { name, exact: true })
        .click();
      if (name === "Today")
        await expect(page.locator("body")).toHaveClass(/still-listening/);
      else
        await expect(page.locator("body")).not.toHaveClass(/still-listening/);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(402);
      if (name === "Scripture") {
        for (const label of ["Book", "Chapter", "Reading translation"])
          await assertTouchTarget(page.getByLabel(label, { exact: true }));
        await page.screenshot({
          path: testInfo.outputPath(`reader-overview-iphone16pro-${theme}.png`),
        });
        await page
          .getByRole("button", { name: "Select verse 1", exact: true })
          .click();
        await assertTouchTarget(
          page.getByRole("button", { name: "Select verse 1", exact: true }),
        );
        await page
          .getByLabel("Your note", { exact: true })
          .fill("An iPhone-sized reading note.");
        expect(
          await page
            .locator(".verse-tools .audio-status")
            .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
        ).toBeLessThanOrEqual(14);
        expect(
          await page
            .getByLabel("Your note", { exact: true })
            .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
        ).toBeGreaterThanOrEqual(16);
        await page.screenshot({
          path: testInfo.outputPath(`reader-iphone16pro-${theme}.png`),
        });
      }
    }
    await page.getByRole("link", { name: "04 Practice", exact: true }).click();
    await page
      .getByLabel("My response for today")
      .fill(`One small act of care in ${theme} mode.`);
    await page
      .getByRole("button", { name: "Save my response", exact: true })
      .click();
    await expect(page.locator(".practice-form [role=status]")).toContainText(
      "saved with Day 1",
    );
    await page.reload();
    await page.getByRole("link", { name: "04 Practice", exact: true }).click();
    await expect(page.getByLabel("My response for today")).toHaveValue(
      `One small act of care in ${theme} mode.`,
    );
  }
  expect(errors).toEqual([]);
});
