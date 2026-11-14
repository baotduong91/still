import { test, expect } from "./fixtures";
import { installVoiceHarness } from "./helpers/sanity";
test.use({ stateOverrides: { speechEngine: "device", setupSeen: true } });
test("dock fits desktop, mobile and short landscape in both themes", async ({
  page,
}) => {
  await installVoiceHarness(page);
  for (const theme of ["light", "dark"]) {
    await page.goto("/settings");
    await page.getByLabel("Appearance").selectOption(theme);
    await page.goto("/today");
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
      { width: 320, height: 568 },
      { width: 844, height: 390 },
    ]) {
      await page.setViewportSize(viewport);
      const dock = page.locator(".today-player");
      await expect(dock).toBeVisible();
      const rect = (await dock.boundingBox())!;
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(viewport.width);
      expect(rect.height).toBeLessThan(viewport.width > 720 ? 120 : 170);
      expect(rect.y + rect.height).toBeLessThanOrEqual(viewport.height);
      const buttons = dock.locator("button:visible");
      for (const button of await buttons.all()) {
        const box = (await button.boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.x + box.width).toBeLessThanOrEqual(rect.x + rect.width);
      }
      if (viewport.width === 390 || viewport.width === 1440)
        await page.screenshot({
          path: `/tmp/still-dock-${theme}-${viewport.width}.png`,
        });
    }
  }
});

test("music shares narration controls, loops one decoded buffer and stops on navigation", async ({
  page,
}) => {
  await installVoiceHarness(page);
  await page.addInitScript(() => {
    const state = { starts: 0, stops: 0, loops: [] as boolean[], fetches: 0 };
    Object.assign(window, { ambientTest: state });
    const original = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function () {
      const source = original.call(this);
      const start = source.start.bind(source),
        stop = source.stop.bind(source);
      source.start = (...args) => {
        state.starts++;
        state.loops.push(source.loop);
        source.playbackRate.value = 16;
        start(...args);
      };
      source.stop = (...args) => {
        state.stops++;
        stop(...args);
      };
      return source;
    };
  });
  let downloads = 0;
  page.on("request", (request) => {
    if (request.url().includes("stillness-loop.mp3")) downloads++;
  });
  await page.goto("/today");
  await page.getByRole("button", { name: "Turn background music on" }).click();
  await page
    .getByRole("button", { name: "Play Scripture", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { ambientTest: { starts: number } }).ambientTest
            .starts,
      ),
    )
    .toBe(1);
  // At 16x playback this spans the actual decoded loop boundary (~2 seconds).
  await page.waitForTimeout(2300);
  expect(
    await page.evaluate(
      () =>
        (
          window as unknown as {
            ambientTest: { starts: number; loops: boolean[] };
          }
        ).ambientTest,
    ),
  ).toMatchObject({ starts: 1, loops: [true] });
  await page
    .getByRole("button", { name: "Pause Scripture", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { ambientTest: { stops: number } }).ambientTest
            .stops,
      ),
    )
    .toBe(1);
  await page
    .getByRole("button", { name: "Play Scripture", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { ambientTest: { starts: number } }).ambientTest
            .starts,
      ),
    )
    .toBe(2);
  await page.getByRole("button", { name: "Turn background music off" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { ambientTest: { stops: number } }).ambientTest
            .stops,
      ),
    )
    .toBe(2);
  expect(downloads).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Turn background music on" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { ambientTest: { starts: number } }).ambientTest
            .starts,
      ),
    )
    .toBe(3);
  await page.locator('a[href="/journal"]').first().click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { ambientTest: { stops: number } }).ambientTest
            .stops,
      ),
    )
    .toBe(3);
});
