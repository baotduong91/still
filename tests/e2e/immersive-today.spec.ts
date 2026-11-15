import { test, expect } from "./fixtures";
import { installVoiceHarness, assertExactToday } from "./helpers/sanity";
test.use({ stateOverrides: { speechEngine: "device", setupSeen: true } });
test("immersive Today preserves Scripture, animates quietly and returns to regular navigation", async ({
  page,
}) => {
  await installVoiceHarness(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/today");
  await expect(page.locator("body")).toHaveClass(/still-listening/);
  await assertExactToday(page);
  await expect(page.locator(".still-scene-landscape")).toHaveCSS(
    "background-image",
    /still-dawn/,
  );
  await page.screenshot({ path: "/tmp/still-immersive-verse.png" });
  await page.getByRole("link", { name: "02 Reflection" }).click();
  await expect(page.locator(".daily-flow")).toHaveAttribute(
    "data-section",
    "1",
  );
  await expect
    .poll(() =>
      page
        .locator("#reflection-heading")
        .evaluate((el) => Math.round(el.getBoundingClientRect().top)),
    )
    .toBeLessThan(350);
  await page.waitForTimeout(800);
  await page.screenshot({ path: "/tmp/still-immersive-reflection.png" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".still-scene-landscape")).toHaveCSS(
    "animation-name",
    "none",
  );
  await page.getByRole("button", { name: "Leave immersive view" }).click();
  await expect(page.locator("body")).not.toHaveClass(/still-listening/);
  await expect(page.getByRole("button", { name: "Focus view" })).toBeVisible();
});
