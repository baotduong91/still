import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    class TestAudio {
      active = false;
      playbackRate = 1;
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;
      async play() {
        if (!this.active) {
          this.active = true;
          (window as unknown as { activeReaders: number }).activeReaders++;
        }
      }
      pause() {
        if (this.active) {
          this.active = false;
          (window as unknown as { activeReaders: number }).activeReaders--;
        }
      }
      load() {}
      removeAttribute() {}
    }
    (window as unknown as { activeReaders: number }).activeReaders = 0;
    (window as unknown as { workerReplies: number }).workerReplies = 0;
    Object.defineProperty(window, "Audio", { value: TestAudio });
    HTMLMediaElement.prototype.play = async function () {
      this.dispatchEvent(new Event("playing"));
    };
    HTMLMediaElement.prototype.pause = function () {
      this.dispatchEvent(new Event("pause"));
    };
    class LocalWorker extends EventTarget {
      constructor() {
        super();
      }
      postMessage(data: { id: number; text?: string }) {
        (
          window as unknown as { localReading: string | undefined }
        ).localReading = data.text;
        setTimeout(
          () => {
            (window as unknown as { workerReplies: number }).workerReplies++;
            this.dispatchEvent(
              new MessageEvent("message", {
                data: {
                  id: data.id,
                  type: "audio",
                  backend: "WASM",
                  wav: new ArrayBuffer(100),
                },
              }),
            );
          },
          (window as unknown as { readingDelay?: number }).readingDelay ?? 20,
        );
      }
      terminate() {}
    }
    Object.defineProperty(window, "Worker", { value: LocalWorker });
  });
});
test("only Play sends exact Scripture to Edge; controls and navigation stop audio", async ({
  page,
}) => {
  let sent: { text: string; reference: string } | null = null;
  await page.route("**/api/tts", (route) => {
    sent = route.request().postDataJSON();
    return route.fulfill({
      contentType: "audio/mpeg",
      body: Buffer.from([0xff, 0xfb, 0x90, 0x00]),
    });
  });
  await page.goto("/today");
  await expect(
    page.getByRole("button", { name: "Play Scripture" }),
  ).toBeVisible();
  expect(sent).toBeNull();
  const exact = await page
    .locator("blockquote span")
    .first()
    .evaluate((el) => el.textContent!.replace(/^\d+/, "").trim());
  await page.getByRole("button", { name: "Play Scripture" }).click();
  await expect(
    page.getByRole("button", { name: "Pause Scripture" }),
  ).toBeVisible();
  expect(sent!.text).toBe(exact);
  expect(sent!.reference).toBe("Matthew 6:34");
  await page.getByLabel("Reading speed").selectOption("1.2");
  await page.getByRole("button", { name: "Pause Scripture" }).click();
  await page.getByRole("button", { name: "Play Scripture" }).click();
  await page.getByRole("button", { name: "Stop Scripture" }).click();
  await expect(
    page.getByRole("button", { name: "Stop Scripture" }),
  ).toBeDisabled();
  await page.getByRole("link", { name: "Create Image", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Play Scripture" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("private Kokoro choice does not call Edge and survives reload", async ({
  page,
}) => {
  let edgeCalls = 0;
  await page.route("**/api/tts", (r) => {
    edgeCalls++;
    return r.abort();
  });
  await page.goto("/settings#reading-voice");
  await page.getByLabel("Reading voice engine").selectOption("kokoro");
  await page.reload();
  await expect(page.getByLabel("Reading voice engine")).toHaveValue("kokoro");
  await page.goto("/today");
  await page.getByRole("button", { name: "Play Scripture" }).click();
  await expect(
    page.getByRole("button", { name: "Pause Scripture" }),
  ).toBeVisible();
  await expect(page.locator(".audio-engine")).toContainText(
    "Kokoro · Bella · WASM",
  );
  expect(edgeCalls).toBe(0);
  expect(
    await page.evaluate(
      () => (window as unknown as { localReading: string }).localReading,
    ),
  ).toContain("\n\nMatthew 6:34");
});
test("Edge failure falls back to local Kokoro with no cloud model request", async ({
  page,
}) => {
  let cloudCalls = 0;
  await page.route("**/api/tts", (r) =>
    r.fulfill({
      status: 503,
      contentType: "application/json",
      body: '{"error":"Unavailable"}',
    }),
  );
  await page.route("**/api/ai", (r) => {
    cloudCalls++;
    return r.abort();
  });
  await page.goto("/today");
  await page.getByRole("button", { name: "Play Scripture" }).click();
  await expect(
    page.getByRole("button", { name: "Pause Scripture" }),
  ).toBeVisible();
  await expect(page.locator(".audio-engine")).toContainText("Kokoro");
  expect(cloudCalls).toBe(0);
});

test("Today curated steps stay local with Auto online and never read personal fields", async ({
  page,
}) => {
  let edgeCalls = 0;
  await page.route("**/api/tts", (route) => {
    edgeCalls++;
    return route.abort();
  });
  await page.goto("/today");
  await page.getByRole("tab", { name: "02 Reflection" }).click();
  const reflection = (await page
    .locator(".devotional-prose > p:not(.eyebrow):not(.fine-print)")
    .first()
    .textContent())!.trim();
  await page.getByRole("button", { name: "Read reflection aloud" }).click();
  await expect(
    page.getByRole("button", { name: "Pause reflection" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { localReading: string }).localReading,
    ),
  ).toBe(reflection);
  await page.getByRole("button", { name: "Pause reflection" }).click();
  await page.getByRole("button", { name: "Read reflection aloud" }).click();
  await page.getByRole("tab", { name: "03 Prayer" }).click();
  await expect(
    page.getByRole("button", { name: "Read prayer aloud" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { activeReaders: number }).activeReaders,
    ),
  ).toBe(0);
  const prayer = (await page.locator(".prayer-text").textContent())!.trim();
  await page
    .locator("#personal-prayer")
    .fill("Private personal prayer must never be spoken.");
  const personalPrayer = page
    .locator("section")
    .filter({ has: page.locator("#personal-prayer") });
  await expect(
    personalPrayer.getByRole("button", { name: /Play|Read .*aloud/ }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Read prayer aloud" }).click();
  await expect(
    page.getByRole("button", { name: "Pause prayer" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { localReading: string }).localReading,
    ),
  ).toBe(
    `A prayer inspired by today’s reading. This is not Scripture.\n\n${prayer}`,
  );
  await page.getByRole("tab", { name: "04 Practice" }).click();
  await expect(
    page.getByRole("button", { name: "Read action aloud" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { activeReaders: number }).activeReaders,
    ),
  ).toBe(0);
  const action = (await page
    .locator(".devotional-prose > p:not(.eyebrow)")
    .first()
    .textContent())!.trim();
  await page
    .getByLabel("My response for today")
    .fill("My private typed worry.");
  await page.getByRole("button", { name: "Read action aloud" }).click();
  await expect(
    page.getByRole("button", { name: "Pause action" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { localReading: string }).localReading,
    ),
  ).toBe(action);
  await page.getByRole("button", { name: "Stop action" }).click();
  await page.getByRole("link", { name: "Journal", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Play|Read .*aloud/ }),
  ).toHaveCount(0);
  expect(edgeCalls).toBe(0);
});

test("changing step cancels a pending local reader before its audio arrives", async ({
  page,
}) => {
  await page.goto("/today");
  await page.evaluate(
    () => ((window as unknown as { readingDelay: number }).readingDelay = 300),
  );
  await page.getByRole("tab", { name: "02 Reflection" }).click();
  await page.getByRole("button", { name: "Read reflection aloud" }).click();
  await page.getByRole("tab", { name: "03 Prayer" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { workerReplies: number }).workerReplies,
      ),
    )
    .toBeGreaterThan(0);
  expect(
    await page.evaluate(
      () => (window as unknown as { activeReaders: number }).activeReaders,
    ),
  ).toBe(0);
  await expect(
    page.getByRole("button", { name: "Read prayer aloud" }),
  ).toBeEnabled();
});

test("chat interpretation is local and starting a Scripture citation stops it", async ({
  page,
}) => {
  let edgeCalls = 0;
  await page.route("**/api/tts", (route) => {
    edgeCalls++;
    return route.fulfill({
      contentType: "audio/mpeg",
      body: Buffer.from([0xff, 0xfb, 0x90, 0x00]),
    });
  });
  await page.goto("/chat");
  await page
    .getByLabel("Your Bible question")
    .fill("What does Scripture say about anxiety?");
  await page.getByRole("button", { name: "Send question" }).click();
  await expect(
    page.getByRole("button", { name: "Read interpretation aloud" }),
  ).toBeVisible();
  const interpretation = (await page
    .locator(".answer > .fine-print")
    .textContent())!.trim();
  await page.getByRole("button", { name: "Read interpretation aloud" }).click();
  await expect(
    page.getByRole("button", { name: "Pause interpretation" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { localReading: string }).localReading,
    ),
  ).toBe(interpretation);
  expect(edgeCalls).toBe(0);
  await page.locator(".answer summary").first().click();
  await page.getByRole("button", { name: "Play Scripture" }).click();
  await expect(
    page.getByRole("button", { name: "Pause Scripture" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Read interpretation aloud" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { activeReaders: number }).activeReaders,
    ),
  ).toBe(1);
  expect(edgeCalls).toBe(1);
});

test("locking the PIN boundary stops a curated reader", async ({ page }) => {
  await page.goto("/settings#privacy");
  await page.locator("#new-pin").fill("284691");
  await page.locator("#confirm-pin").fill("284691");
  await page.getByRole("button", { name: "Enable PIN screen lock" }).click();
  await expect(
    page.getByText("Your PIN screen lock is ready on this device."),
  ).toBeVisible();
  await page.getByRole("link", { name: "Today", exact: true }).click();
  await page.getByRole("tab", { name: "02 Reflection" }).click();
  await page.getByRole("button", { name: "Read reflection aloud" }).click();
  await expect(
    page.getByRole("button", { name: "Pause reflection" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Lock", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A little privacy." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { activeReaders: number }).activeReaders,
    ),
  ).toBe(0);
});
