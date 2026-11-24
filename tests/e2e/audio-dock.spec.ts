import { test, expect } from "./fixtures";
import { installVoiceHarness } from "./helpers/sanity";
test.use({
  serviceWorkers: "block",
  stateOverrides: { speechEngine: "device", setupSeen: true },
});
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
      { width: 1100, height: 800 },
      { width: 980, height: 800 },
      { width: 390, height: 844 },
      { width: 320, height: 568 },
      { width: 844, height: 390 },
    ]) {
      await page.setViewportSize(viewport);
      const dock = page.locator(".today-player");
      await expect(dock).toBeVisible();
      const rect = (await dock.boundingBox())!;
      const column = (await page.locator(".daily-flow").boundingBox())!;
      expect(
        Math.abs(rect.x + rect.width / 2 - column.x - column.width / 2),
      ).toBeLessThan(2);
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(viewport.width);
      expect(rect.height).toBeLessThan(viewport.width > 720 ? 120 : 170);
      expect(rect.y + rect.height).toBeLessThanOrEqual(viewport.height);
      if (viewport.width === 1440) {
        const actions = (await page
          .locator(".overview-actions")
          .boundingBox())!;
        expect(actions.y + actions.height).toBeLessThan(rect.y);
      }
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
    const state = {
      starts: 0,
      rms: 0,
      stops: 0,
      loops: [] as boolean[],
      fetches: 0,
    };
    Object.assign(window, { ambientTest: state });
    const original = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function () {
      const source = original.call(this);
      const start = source.start.bind(source),
        stop = source.stop.bind(source);
      source.start = (...args) => {
        state.starts++;
        const pcm = source.buffer!.getChannelData(0);
        state.rms = Math.sqrt(
          pcm.reduce((sum, value) => sum + value * value, 0) / pcm.length,
        );
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
    if (request.url().includes("angelic-pad-loop.mp3")) downloads++;
  });
  await page.goto("/today");
  const musicToggle = page.getByRole("button", { name: "Background music" });
  await expect(musicToggle).toHaveText("Off");
  const icon = await musicToggle.locator("svg").getAttribute("class");
  await musicToggle.click();
  await expect(musicToggle).toHaveAttribute("aria-pressed", "true");
  await expect(musicToggle).toHaveText("On");
  await expect(musicToggle.locator("svg")).toHaveAttribute("class", icon!);
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
  await page
    .getByRole("button", { name: "Background music", pressed: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { ambientTest: { stops: number } }).ambientTest
            .stops,
      ),
    )
    .toBe(2);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { ambientTest: { rms: number } }).ambientTest.rms,
    ),
  ).toBeGreaterThan(0.05);
  expect(downloads).toBeGreaterThan(0);
  await page
    .getByRole("button", { name: "Background music", pressed: false })
    .click();
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

test("an unavailable music asset reports a quiet error without blocking narration", async ({
  page,
}) => {
  await installVoiceHarness(page);
  await page.route("**/angelic-pad-loop.mp3", (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await page.goto("/today");
  await page
    .getByRole("button", { name: "Background music", pressed: false })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Music could not start" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Play Scripture", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Pause Scripture", exact: true }),
  ).toBeVisible();
});

test("music has an audible output signal while the online-voice audio element plays", async ({
  page,
}) => {
  const { wavBytes } = await import("../../lib/tts/chunks");
  const samples = Float32Array.from(
    { length: 24000 * 12 },
    (_, i) => Math.sin((i / 24000) * 2 * Math.PI * 370) * 0.18,
  );
  await page.route("**/api/tts", (route) =>
    route.request().method() === "HEAD"
      ? route.fulfill({ status: 204 })
      : route.fulfill({
          contentType: "audio/wav",
          body: Buffer.from(wavBytes(samples)),
        }),
  );
  await page.route("**/huggingface.co/**", (route) => route.abort());
  await page.addInitScript(() => {
    const original = AudioContext.prototype.createGain;
    AudioContext.prototype.createGain = function () {
      const gain = original.call(this),
        meter = this.createAnalyser();
      meter.fftSize = 2048;
      gain.connect(meter);
      Object.assign(window, { mixMeter: meter });
      return gain;
    };
  });
  await page.goto("/settings");
  await page.getByLabel("Reading voice engine").selectOption("edge");
  await page.goto("/today");
  await page
    .getByRole("button", { name: "Background music", pressed: false })
    .click();
  await page
    .getByRole("button", { name: "Play Scripture", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Pause Scripture", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const meter = (window as unknown as { mixMeter: AnalyserNode })
          .mixMeter;
        if (!meter || meter.context.state !== "running") return 0;
        const pcm = new Float32Array(meter.fftSize);
        meter.getFloatTimeDomainData(pcm);
        return Math.sqrt(pcm.reduce((sum, x) => sum + x * x, 0) / pcm.length);
      }),
    )
    .toBeGreaterThan(0.008);
  await expect(
    page.getByRole("button", { name: "Pause Scripture", exact: true }),
  ).toBeVisible();
});

test("pads continue after all four sections and stop explicitly", async ({
  page,
}) => {
  await installVoiceHarness(page);
  await page.addInitScript(() => {
    const counts = { starts: 0, stops: 0 };
    Object.assign(window, { padCounts: counts });
    const original = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function () {
      const source = original.call(this);
      const start = source.start.bind(source),
        stop = source.stop.bind(source);
      source.start = (...args) => {
        counts.starts++;
        start(...args);
      };
      source.stop = (...args) => {
        counts.stops++;
        stop(...args);
      };
      return source;
    };
  });
  await page.goto("/today");
  await page
    .getByRole("button", { name: "Background music", pressed: false })
    .click();
  await page
    .getByRole("button", { name: "Play Scripture", exact: true })
    .click();
  for (const name of ["Scripture", "reflection", "prayer", "action"]) {
    await expect(
      page.getByRole("button", { name: `Pause ${name}`, exact: true }),
    ).toBeVisible();
    await page.evaluate(() =>
      (
        window as unknown as { finishDeviceVoice: () => void }
      ).finishDeviceVoice(),
    );
  }
  await expect(
    page.getByRole("button", { name: "Read action aloud", exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(600);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { padCounts: { starts: number; stops: number } })
          .padCounts,
    ),
  ).toEqual({ starts: 1, stops: 0 });
  await page.getByRole("button", { name: "Stop action", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { padCounts: { stops: number } }).padCounts
            .stops,
      ),
    )
    .toBe(1);
});

test("muting narration keeps the enabled pad playing with its own pause and play controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await installVoiceHarness(page);
  await page.goto("/today");
  await page
    .getByRole("button", { name: "Background music", pressed: false })
    .click();
  await page
    .getByRole("button", { name: "Play Scripture", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Pause Scripture", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Turn voice reading off" }).click();
  await page.getByRole("button", { name: "Pause background music" }).click();
  await page.getByRole("button", { name: "Play background music" }).click();
  await expect(
    page.getByRole("button", { name: "Pause background music" }),
  ).toBeEnabled();
});
