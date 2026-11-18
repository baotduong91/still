import { test, expect } from "./fixtures";
import { installVoiceHarness, assertTouchTarget } from "./helpers/sanity";

test("focus exit preserves the reading position and landscape keeps navigation", async ({
  page,
}) => {
  await installVoiceHarness(page);
  await page.goto("/today");
  await page.getByRole("button", { name: "Listen", exact: true }).click();
  await page.getByRole("link", { name: "03 Prayer", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Pause prayer", exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(1400);
  const before = await page
    .locator("#today-prayer")
    .evaluate((el) => el.getBoundingClientRect().top);
  await page.getByRole("button", { name: "Leave immersive view" }).click();
  const after = await page
    .locator("#today-prayer")
    .evaluate((el) => el.getBoundingClientRect().top);
  expect(Math.abs(after - before)).toBeLessThan(8);
  await expect(
    page.getByRole("button", { name: "Pause prayer", exact: true }),
  ).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  for (const tab of ["Scripture", "Bible chat", "Journal", "My journeys"]) {
    await nav.getByRole("link", { name: tab, exact: true }).click();
    await expect(page.locator("body")).not.toHaveClass(
      /still-reading|still-listening/,
    );
    await expect(page.locator(".today-player")).toHaveCount(0);
    await nav.getByRole("link", { name: "Today", exact: true }).click();
    await expect(page.locator(".daily-flow")).toHaveAttribute(
      "data-view",
      "overview",
    );
    await expect(
      page.getByRole("button", { name: "Play Scripture", exact: true }),
    ).toBeVisible();
  }
  await page.setViewportSize({ width: 874, height: 402 });
  await expect(nav).toBeVisible();
  await nav
    .getByRole("link", { name: "Journal", exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    nav.getByRole("link", { name: "Journal", exact: true }),
  ).toBeInViewport();
  await page.screenshot({ path: "/tmp/still-today-landscape-navigation.png" });
  await nav.getByRole("link", { name: "Journal", exact: true }).click();
  await expect(page).toHaveURL(/\/journal$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.locator(".daily-flow")).toHaveAttribute(
    "data-view",
    "overview",
  );
  await expect(
    page.getByRole("button", { name: "Play Scripture", exact: true }),
  ).toBeVisible();
});

test("listening options dismiss on Escape and outside tap; keyboard hides navigation", async ({
  page,
}) => {
  await installVoiceHarness(page);
  await page.goto("/today");
  const options = page.getByLabel("Listening options");
  await options.click();
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Reading speed")).not.toBeVisible();
  await expect(options).toBeFocused();
  await options.click();
  await page.locator(".today-welcome h1").click({ position: { x: 5, y: 5 } });
  await expect(page.getByLabel("Reading speed")).not.toBeVisible();
  await page.evaluate(() => {
    document.documentElement.dataset.keyboard = "open";
  });
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).not.toBeVisible();
});

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
            .locator(".bible-player-meta > span")
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
