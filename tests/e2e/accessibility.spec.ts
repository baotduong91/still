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
