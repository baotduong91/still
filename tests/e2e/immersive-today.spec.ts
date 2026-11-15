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
  await page.getByRole("button", { name: "Read", exact: true }).click();
  await page.getByRole("button", { name: "Leave immersive view" }).click();
  await expect(page.locator("body")).toHaveClass(/still-listening/);
  await expect(page.locator("body")).not.toHaveClass(/still-reading/);
});

test("overview and reading reuse the scene, player and saved mix settings", async ({
  page,
}) => {
  await installVoiceHarness(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/today");
  await page
    .locator(".still-scene")
    .evaluate((el) => el.setAttribute("data-session", "same-scene"));
  await page.getByLabel("Listening options").click();
  const volume = page.getByLabel("Background music level");
  await volume.focus();
  await volume.press("End");
  await expect(volume).toHaveValue("1");
  await page.getByLabel("Reading speed").selectOption("1.2");
  await page.getByLabel("Listening options").click();
  await page.getByRole("button", { name: "Listen", exact: true }).click();
  await expect(page.locator("body")).toHaveClass(/still-reading/);
  await expect(
    page.getByRole("button", { name: "Pause Scripture", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Leave immersive view" }).click();
  await expect(page.locator(".still-scene")).toHaveAttribute(
    "data-session",
    "same-scene",
  );
  await expect(
    page.getByRole("button", { name: "Pause Scripture", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Listening options").click();
  await expect(page.getByLabel("Background music level")).toHaveValue("1");
  await expect(page.getByLabel("Reading speed")).toHaveValue("1.2");
  await page.setViewportSize({ width: 844, height: 390 });
  await page.getByLabel("Reading speed").scrollIntoViewIfNeeded();
  await expect(page.getByLabel("Reading speed")).toBeInViewport();
  const menu = (await page.locator(".listening-menu > div").boundingBox())!;
  expect(menu.y + menu.height).toBeLessThanOrEqual(390);
});
