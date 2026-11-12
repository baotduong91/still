import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("Today and dark settings meet automated WCAG AA checks", async ({
  page,
}) => {
  await page.goto("/today");
  await expect(
    page.getByRole("heading", { name: "One day at a time" }),
  ).toBeVisible();
  const light = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(light.violations).toEqual([]);
  await page.goto("/settings");
  await page.getByLabel("Appearance").selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const dark = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(dark.violations).toEqual([]);
});

test("mobile Today keeps its verse, section controls and player readable in both themes", async ({
  page,
}, testInfo) => {
  for (const theme of ["dark", "light"]) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/settings");
    await page.getByLabel("Appearance").selectOption(theme);
    await page.getByRole("link", { name: "Today", exact: true }).click();
    await expect(page.locator("#today-scripture")).toBeInViewport();
    await expect(
      page.getByRole("button", { name: "Play Scripture" }),
    ).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    // The immersive card opens above the player, with no horizontal overflow.
    const layout = await page.evaluate(() => ({
      top: document.querySelector("#today-scripture")!.getBoundingClientRect()
        .top,
      verse: document.querySelector("blockquote")!.getBoundingClientRect()
        .bottom,
      player: document.querySelector(".today-player")!.getBoundingClientRect()
        .top,
      width: document.documentElement.scrollWidth,
    }));
    expect(layout.top).toBeLessThan(180);
    expect(layout.verse).toBeLessThan(layout.player);
    expect(layout.width).toBeLessThanOrEqual(390);
    const screenshot = testInfo.outputPath(`today-${theme}.png`);
    await page.screenshot({ path: screenshot });
    await testInfo.attach(`Today ${theme}`, {
      path: screenshot,
      contentType: "image/png",
    });
    await page.getByRole("button", { name: "Continue to reflection" }).click();
    await expect(
      page.getByRole("button", { name: "Read reflection aloud" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Continue to prayer" }).click();
    await page.getByRole("button", { name: "Continue to practice" }).click();
    await expect(page.getByLabel("My response for today")).toBeInViewport();
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(result.violations).toEqual([]);
  }
});
