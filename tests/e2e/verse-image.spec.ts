import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("mobile verse image preserves Scripture through every format and native sharing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "canShare", {
      value: () => true,
      configurable: true,
    });
    Object.defineProperty(navigator, "share", {
      value: async (data: ShareData) => {
        const file = data.files![0];
        (window as unknown as { sharedImage: object }).sharedImage = {
          name: file.name,
          type: file.type,
          size: file.size,
        };
      },
      configurable: true,
    });
  });
  await page.goto("/today");
  await page.getByRole("link", { name: "Create Image", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Create Image", exact: true }),
  ).toBeVisible();
  const save = page.getByRole("button", { name: "Save to device" });
  await expect(save).toBeEnabled();
  const canvas = page.locator("canvas");
  const exact = await canvas.getAttribute("aria-label");
  expect(exact).toContain("Matthew 6:34 · WEB");
  expect(exact).toContain("Therefore don’t be anxious for tomorrow");
  for (const [name, w, h] of [
    ["Story", 1080, 1920],
    ["Square", 1080, 1080],
    ["Portrait", 1080, 1350],
    ["Wallpaper", 1440, 3120],
  ] as const) {
    await page
      .getByRole("group", { name: "Image format" })
      .getByRole("button", { name: new RegExp(name) })
      .click();
    await expect(save).toBeEnabled();
    await expect(canvas).toHaveAttribute("width", String(w));
    await expect(canvas).toHaveAttribute("height", String(h));
    await expect(canvas).toHaveAttribute("aria-label", exact!);
  }
  for (const name of ["Editorial", "Ink", "Dawn", "Stillwater", "Classic"]) {
    await page
      .getByRole("group", { name: "Image style" })
      .getByRole("button", { name: new RegExp(name) })
      .click();
    await expect(save).toBeEnabled();
    await expect(canvas).toHaveAttribute("aria-label", exact!);
  }
  for (const name of ["Quiet water", "Sage hills", "Mountain hush"]) {
    await page.getByRole("button", { name }).click();
    await expect(save).toBeEnabled();
  }
  const downloadEvent = page.waitForEvent("download");
  await save.click();
  expect((await downloadEvent).suggestedFilename()).toContain(
    "WEB-wallpaper.png",
  );
  await page.getByRole("button", { name: "Share", exact: true }).click();
  const shared = await page.evaluate(
    () =>
      (window as unknown as { sharedImage: { type: string; size: number } })
        .sharedImage,
  );
  expect(shared.type).toBe("image/png");
  expect(shared.size).toBeGreaterThan(10000);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/create-image-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("image workspace switches themes immediately and retains exact artwork and accessible mobile controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/create-image?ref=John%203%3A16&translation=WEB");
  const save = page.getByRole("button", { name: "Save to device" });
  await expect(save).toBeEnabled();
  await page
    .getByRole("group", { name: "Image format" })
    .getByRole("button", { name: /Square/ })
    .click();
  await page
    .getByRole("group", { name: "Image style" })
    .getByRole("button", { name: "Editorial" })
    .click();
  await expect(save).toBeEnabled();
  const artwork = await page
    .locator("canvas")
    .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  const surfaces: string[] = [];
  for (const theme of ["light", "dark"]) {
    await page.getByLabel("Workspace appearance").selectOption(theme);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    surfaces.push(
      await page
        .locator(".image-preview-panel")
        .evaluate((el) => getComputedStyle(el).backgroundColor),
    );
    await expect(
      page
        .getByRole("group", { name: "Image format" })
        .getByRole("button", { name: /Square/ }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      await page
        .locator("canvas")
        .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL()),
    ).toBe(artwork);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const result = await new AxeBuilder({ page })
      .include(".image-maker")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(result.violations).toEqual([]);
    await page.locator("h1").click();
    await page.screenshot({
      path: `test-results/create-image-${theme}.png`,
      fullPage: true,
    });
  }
  expect(surfaces[0]).not.toBe(surfaces[1]);
});
test("verse entry, translation fallback and WEB image export work offline", async ({
  page,
  context,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "canShare", {
      value: () => false,
      configurable: true,
    }),
  );
  await page.goto("/scripture?ref=John%203%3A16");
  await page.getByLabel("Select verse 16").click();
  await page.getByRole("link", { name: "Create Image", exact: true }).click();
  await expect(page.locator("canvas")).toHaveAttribute(
    "aria-label",
    /John 3:16 · WEB/,
  );
  await page.goto("/settings");
  await page.getByRole("button", { name: "Download for offline" }).click();
  await expect(page.getByRole("status")).toContainText("Ready offline", {
    timeout: 60000,
  });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await context.setOffline(true);
  await page.goto("/create-image?ref=John%203%3A16&translation=CSB");
  await expect(
    page.getByText("CSB needs an online connection.", { exact: false }),
  ).toBeVisible();
  await expect(page.locator("canvas")).toHaveAttribute(
    "aria-label",
    /John 3:16 · WEB/,
  );
  await expect(
    page.getByRole("button", { name: "Save to device" }),
  ).toBeEnabled();
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Share", exact: true }).click();
  expect((await event).suggestedFilename()).toContain("WEB-story.png");
});
