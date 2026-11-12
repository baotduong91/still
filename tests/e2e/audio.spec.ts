import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { kokoroAutoExtends, kokoroTimeouts } from "../../lib/tts/kokoro-client";
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    class TestAudio {
      constructor() {
        const state = window as unknown as { testPlayers: TestAudio[] };
        (state.testPlayers ??= []).push(this);
      }
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
    (window as unknown as { kokoroJobs: object[] }).kokoroJobs = [];
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
      postMessage(data: {
        id: number;
        text?: string | null;
        mode?: string;
        prepare?: boolean;
      }) {
        if (["cancel", "clear"].includes(data.mode ?? "")) return;
        (window as unknown as { kokoroJobs: object[] }).kokoroJobs.push({
          mode: data.mode,
          text: data.text ?? null,
          prepare: data.prepare,
        });
        (
          window as unknown as { localReading: string | undefined }
        ).localReading = data.text ?? undefined;
        if (data.mode === "warm" || (data.prepare && data.text == null)) {
          queueMicrotask(() =>
            this.dispatchEvent(
              new MessageEvent("message", {
                data: {
                  id: data.id,
                  type: "ready",
                  backend: "WASM",
                  modelWarmed: true,
                },
              }),
            ),
          );
          return;
        }
        if (data.mode === "prime") {
          setTimeout(
            () =>
              this.dispatchEvent(
                new MessageEvent("message", {
                  data: {
                    id: data.id,
                    type: "primed",
                    backend: "WASM",
                    modelWarmed: true,
                    wav: new ArrayBuffer(100),
                  },
                }),
              ),
            (window as unknown as { readingDelay?: number }).readingDelay ?? 20,
          );
          return;
        }
        const state = window as unknown as {
          slowFirst?: boolean;
          readingDelay?: number;
          workerJobs?: number;
          hardErrors?: number;
        };
        if (state.slowFirst || state.hardErrors) {
          state.workerJobs = (state.workerJobs ?? 0) + 1;
          if (state.hardErrors) {
            state.hardErrors--;
            queueMicrotask(() =>
              this.dispatchEvent(
                new MessageEvent("message", {
                  data: { id: data.id, type: "error", message: "Model failed" },
                }),
              ),
            );
            return;
          }
          this.dispatchEvent(
            new MessageEvent("message", {
              data: {
                id: data.id,
                type: "progress",
                phase: "first_inference",
                step: 1,
                message:
                  "First Bella synthesis can take 1–3 minutes on desktop…",
              },
            }),
          );
          setTimeout(
            () =>
              this.dispatchEvent(
                new MessageEvent("message", {
                  data: {
                    id: data.id,
                    type: "audio",
                    backend: "WASM",
                    wav: new ArrayBuffer(100),
                  },
                }),
              ),
            state.readingDelay ?? 45000,
          );
          return;
        }
        if ((window as unknown as { readingStream?: boolean }).readingStream) {
          setTimeout(
            () =>
              this.dispatchEvent(
                new MessageEvent("message", {
                  data: {
                    id: data.id,
                    type: "chunk",
                    backend: "WASM",
                    wav: new ArrayBuffer(100),
                  },
                }),
              ),
            20,
          );
          (window as unknown as { releaseStream: () => void }).releaseStream =
            () => {
              this.dispatchEvent(
                new MessageEvent("message", {
                  data: {
                    id: data.id,
                    type: "chunk",
                    backend: "WASM",
                    wav: new ArrayBuffer(100),
                  },
                }),
              );
              this.dispatchEvent(
                new MessageEvent("message", {
                  data: { id: data.id, type: "done", backend: "WASM" },
                }),
              );
            };
          return;
        }
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

async function seedOfflineKokoroAssets(page: Page) {
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("still-tts-models", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("assets");
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("assets", "readwrite");
        tx.objectStore("assets").put(
          new Blob(["model"]),
          "https://still.test/model_quantized.onnx",
        );
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
    const cache = await caches.open("kokoro-voices");
    await cache.put(
      "https://still.test/voices/af_bella.bin",
      new Response(new Blob(["voice"])),
    );
  });
}

async function deviceSpy(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      value: class {
        constructor(public text: string) {}
      },
    });
    Object.defineProperty(window, "speechSynthesis", {
      value: {
        getVoices: () => [
          { name: "Microsoft Zira", lang: "en-US", localService: true },
        ],
        speak: () => {
          (window as unknown as { deviceCalls: number }).deviceCalls++;
        },
        cancel() {},
        pause() {},
        resume() {},
      },
    });
    (window as unknown as { deviceCalls: number }).deviceCalls = 0;
  });
}

test("desktop cold Bella may take 45 seconds without switching to Zira", async ({
  page,
}) => {
  await deviceSpy(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/today");
  await page.getByRole("link", { name: "02 Reflection" }).click();
  await expect(
    page.getByRole("button", { name: "Read reflection aloud" }),
  ).toBeVisible();
  await page.clock.install();
  await page.evaluate(() =>
    Object.assign(window, { slowFirst: true, readingDelay: 45000 }),
  );
  await page.getByRole("button", { name: "Read reflection aloud" }).click();
  await expect(page.getByRole("status")).toContainText("First Bella synthesis");
  await page.clock.fastForward(45001);
  await expect(
    page.getByRole("button", { name: "Pause reflection" }),
  ).toBeVisible();
  await expect(page.locator(".audio-engine")).toContainText("Kokoro · Bella");
  expect(
    await page.evaluate(
      () => (window as unknown as { deviceCalls: number }).deviceCalls,
    ),
  ).toBe(0);
});

test("after automatic cold-start extensions Keep waiting continues the same Bella job without Zira", async ({
  page,
}) => {
  await deviceSpy(page);
  let edge = 0;
  await page.route("**/api/tts", (r) => {
    if (r.request().method() === "POST") edge++;
    return r.fulfill({ status: 204 });
  });
  await page.goto("/today");
  await page.getByRole("link", { name: "02 Reflection" }).click();
  await page.clock.install();
  await page.evaluate(
    (readingDelay) => Object.assign(window, { slowFirst: true, readingDelay }),
    kokoroTimeouts.first_inference * (kokoroAutoExtends + 1) + 60000,
  );
  await page.getByRole("button", { name: "Read reflection aloud" }).click();
  await expect(page.getByRole("status")).toContainText("First Bella synthesis");
  for (let attempt = 0; attempt < kokoroAutoExtends; attempt++) {
    await page.clock.fastForward(kokoroTimeouts.first_inference + 1);
    await expect(
      page.getByRole("button", { name: "Keep waiting", exact: true }),
    ).toHaveCount(0);
  }
  await page.clock.fastForward(kokoroTimeouts.first_inference + 1);
  await expect(page.getByRole("status")).toContainText(
    "Bella still needs more time",
  );
  await expect(
    page.getByRole("button", { name: "Keep waiting", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { deviceCalls: number }).deviceCalls,
    ),
  ).toBe(0);
  await page.getByRole("button", { name: "Keep waiting", exact: true }).click();
  await page.clock.fastForward(60001);
  await expect(
    page.getByRole("button", { name: "Pause reflection" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { workerJobs: number }).workerJobs,
    ),
  ).toBe(1);
  expect(edge).toBe(0);
});

test("slow Bella switches to Zira only on an explicit device-voice tap and ignores late audio", async ({
  page,
}) => {
  await deviceSpy(page);
  await page.goto("/today");
  await page.getByRole("link", { name: "02 Reflection" }).click();
  await page.clock.install();
  await page.evaluate(() =>
    Object.assign(window, { slowFirst: true, readingDelay: 240000 }),
  );
  await page.getByRole("button", { name: "Read reflection aloud" }).click();
  await expect(page.getByRole("status")).toContainText("First Bella synthesis");
  await page.clock.fastForward(180001);
  await page
    .getByRole("button", { name: "Use device voice · no download" })
    .click();
  await page.clock.fastForward(60001);
  await expect(page.locator(".audio-engine")).toHaveText(
    "Device voice · Microsoft Zira",
  );
  expect(
    await page.evaluate(
      () => (window as unknown as { deviceCalls: number }).deviceCalls,
    ),
  ).toBe(1);
  expect(
    await page.evaluate(
      () => (window as unknown as { activeReaders: number }).activeReaders,
    ),
  ).toBe(0);
});

test("two hard Bella errors offer a device choice without automatically speaking", async ({
  page,
}) => {
  await deviceSpy(page);
  await page.goto("/today");
  await page.getByRole("link", { name: "02 Reflection" }).click();
  await page.evaluate(() => Object.assign(window, { hardErrors: 2 }));
  await page.getByRole("button", { name: "Read reflection aloud" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Bella could not load after a retry",
  );
  expect(
    await page.evaluate(
      () => (window as unknown as { workerJobs: number }).workerJobs,
    ),
  ).toBe(2);
  expect(
    await page.evaluate(
      () => (window as unknown as { deviceCalls: number }).deviceCalls,
    ),
  ).toBe(0);
  await expect(
    page.getByRole("button", { name: "Use device voice · no download" }),
  ).toBeVisible();
});
test("only Play sends exact Scripture to Edge; controls and navigation stop audio", async ({
  page,
}) => {
  let sent: { text: string; reference: string } | null = null;
  await page.route("**/api/tts", (route) => {
    if (route.request().method() === "HEAD")
      return route.fulfill({ status: 204 });
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
    if (r.request().method() === "HEAD") return r.fulfill({ status: 204 });
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
    await page.evaluate(() =>
      (
        window as unknown as { kokoroJobs: { text: string | null }[] }
      ).kokoroJobs.map((job) => job.text),
    ),
  ).toContainEqual(expect.stringContaining("\n\nMatthew 6:34"));
});
test("Edge failure falls back to local Kokoro with no cloud model request", async ({
  page,
}) => {
  let cloudCalls = 0;
  await page.route("**/api/tts", (r) =>
    r.request().method() === "HEAD"
      ? r.fulfill({ status: 204 })
      : r.fulfill({
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
    if (route.request().method() === "HEAD")
      return route.fulfill({ status: 204 });
    edgeCalls++;
    return route.abort();
  });
  await page.goto("/today");
  await page.getByRole("link", { name: "02 Reflection" }).click();
  const reflection = (await page
    .locator(
      "#today-reflection .devotional-prose > p:not(.eyebrow):not(.fine-print)",
    )
    .first()
    .textContent())!.trim();
  await page.getByRole("button", { name: "Read reflection aloud" }).click();
  await expect(
    page.getByRole("button", { name: "Pause reflection" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      (
        window as unknown as { kokoroJobs: { text: string | null }[] }
      ).kokoroJobs.map((job) => job.text),
    ),
  ).toContain(reflection);
  await page.getByRole("button", { name: "Pause reflection" }).click();
  await page.getByRole("button", { name: "Read reflection aloud" }).click();
  await page.getByRole("link", { name: "03 Prayer" }).click();
  await expect(
    page.getByRole("button", { name: "Read prayer aloud" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { activeReaders: number }).activeReaders,
    ),
  ).toBe(0);
  const prayer = (await page.locator(".prayer-text").textContent())!.trim();
  await page.locator(".flow-personal-prayer > summary").click();
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
    await page.evaluate(() =>
      (
        window as unknown as { kokoroJobs: { text: string | null }[] }
      ).kokoroJobs.map((job) => job.text),
    ),
  ).toContain(
    `A prayer inspired by today’s reading. This is not Scripture.\n\n${prayer}`,
  );
  await page.getByRole("link", { name: "04 Practice" }).click();
  await expect(
    page.getByRole("button", { name: "Read action aloud" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { activeReaders: number }).activeReaders,
    ),
  ).toBe(0);
  const action = (await page
    .locator("#today-practice .devotional-prose > p:not(.eyebrow)")
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
    await page.evaluate(() =>
      (
        window as unknown as { kokoroJobs: { text: string | null }[] }
      ).kokoroJobs.map((job) => job.text),
    ),
  ).toContain(action);
  await page.getByRole("button", { name: "Stop action" }).click();
  await page.getByRole("link", { name: "Journal", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Play|Read .*aloud/ }),
  ).toHaveCount(0);
  expect(edgeCalls).toBe(0);
  const sent = await page.evaluate(() =>
    JSON.stringify((window as unknown as { kokoroJobs: object[] }).kokoroJobs),
  );
  expect(sent).not.toContain("Private personal prayer must never be spoken.");
  expect(sent).not.toContain("My private typed worry.");
});

test("changing step cancels a pending local reader before its audio arrives", async ({
  page,
}) => {
  await page.goto("/today");
  await page.evaluate(
    () => ((window as unknown as { readingDelay: number }).readingDelay = 300),
  );
  await page.getByRole("link", { name: "02 Reflection" }).click();
  await page.getByRole("button", { name: "Read reflection aloud" }).click();
  await page.getByRole("link", { name: "03 Prayer" }).click();
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
    if (route.request().method() === "HEAD")
      return route.fulfill({ status: 204 });
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
  await page.getByRole("link", { name: "02 Reflection" }).click();
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

test("Bella buffers a slow reading before sound and queues segments without gaps", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  // Deterministic Web Audio boundaries; real WAV decoding stays covered by the
  // opt-in runtime suite. This replaces the old HTMLAudioElement-only fixture.
  await page.addInitScript(() => {
    class TestContext {
      state = "running";
      currentTime = 0;
      destination = {};
      constructor() {
        Object.assign(window, { chunkContext: this, scheduledChunks: [] });
      }
      async decodeAudioData() {
        return { duration: 2 };
      }
      async suspend() {
        this.state = "suspended";
      }
      async resume() {
        this.state = "running";
      }
      async close() {
        this.state = "closed";
      }
      createBufferSource() {
        return {
          buffer: null,
          playbackRate: { value: 1 },
          connect() {},
          disconnect() {},
          onended: null,
          start(at: number) {
            (
              window as unknown as { scheduledChunks: number[] }
            ).scheduledChunks.push(at);
          },
        };
      }
    }
    Object.defineProperty(window, "AudioContext", { value: TestContext });
  });
  await page.goto("/today");
  await page.getByRole("link", { name: "02 Reflection" }).click();
  await page.evaluate(
    () =>
      ((window as unknown as { readingStream: boolean }).readingStream = true),
  );
  await page.getByRole("button", { name: "Read reflection aloud" }).click();
  await expect(
    page.getByRole("button", { name: "Read reflection aloud" }),
  ).toBeDisabled();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { scheduledChunks?: number[] }).scheduledChunks ??
        [],
    ),
  ).toEqual([]);
  await page.waitForFunction(
    () =>
      typeof (window as unknown as { releaseStream?: unknown })
        .releaseStream === "function",
  );
  // Let the mocked first chunk arrive before releasing the deliberately delayed second.
  await page.waitForTimeout(50);
  await page.evaluate(() =>
    (window as unknown as { releaseStream: () => void }).releaseStream(),
  );
  await expect(
    page.getByRole("button", { name: "Pause reflection" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Pause reflection" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { scheduledChunks: number[] }).scheduledChunks
            .length,
      ),
    )
    .toBe(2);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { chunkContext: { state: string } }).chunkContext
          .state,
    ),
  ).toBe("suspended");
  const starts = await page.evaluate(
    () => (window as unknown as { scheduledChunks: number[] }).scheduledChunks,
  );
  expect(starts[1] - starts[0]).toBeCloseTo(2, 5);
  await page.getByRole("button", { name: "Read reflection aloud" }).click();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { chunkContext: { state: string } }).chunkContext
          .state,
    ),
  ).toBe("running");
  await page.getByRole("button", { name: "Stop reflection" }).click();
  await expect(
    page.getByRole("button", { name: "Stop reflection" }),
  ).toBeDisabled();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { chunkContext: { state: string } }).chunkContext
          .state,
    ),
  ).toBe("closed");
});

test("installed device voice is immediate and never invokes Edge or a model worker", async ({
  page,
}) => {
  let edgeCalls = 0;
  await page.route("**/api/tts", (r) => {
    if (r.request().method() === "HEAD") return r.fulfill({ status: 204 });
    edgeCalls++;
    return r.abort();
  });
  await page.addInitScript(() => {
    class Utterance {
      voice: unknown;
      rate = 1;
      onend: unknown;
      onerror: unknown;
      constructor(public text: string) {}
    }
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      value: Utterance,
    });
    Object.defineProperty(window, "speechSynthesis", {
      value: {
        getVoices: () => [
          { name: "Samantha", lang: "en-US", localService: true },
        ],
        speak: (u: Utterance) => {
          (window as unknown as { deviceReading: string }).deviceReading =
            u.text;
        },
        cancel: () => {},
        pause: () => {},
        resume: () => {},
      },
    });
  });
  await page.goto("/settings#reading-voice");
  await page.getByLabel("Reading voice engine").selectOption("device");
  await page.reload();
  await expect(page.getByLabel("Reading voice engine")).toHaveValue("device");
  await page.goto("/today");
  await page.getByRole("link", { name: "02 Reflection" }).click();
  await page.getByRole("button", { name: "Read reflection aloud" }).click();
  await expect(
    page.getByRole("button", { name: "Pause reflection" }),
  ).toBeVisible();
  await expect(page.locator(".audio-engine")).toContainText(
    "Device voice · Samantha",
  );
  expect(
    await page.evaluate(
      () => (window as unknown as { deviceReading: string }).deviceReading,
    ),
  ).toBe(
    (await page
      .locator(
        "#today-reflection .devotional-prose > p:not(.eyebrow):not(.fine-print)",
      )
      .first()
      .textContent())!.trim(),
  );
  expect(
    await page.evaluate(
      () => (window as unknown as { workerReplies: number }).workerReplies,
    ),
  ).toBe(0);
  expect(edgeCalls).toBe(0);
});

test("Today is one vertical flow; finishing audio gently moves to reflection without autoplay", async ({
  page,
}) => {
  await page.route("**/api/tts", (route) =>
    route.request().method() === "HEAD"
      ? route.fulfill({ status: 204 })
      : route.fulfill({
          contentType: "audio/mpeg",
          body: Buffer.from([0xff, 0xfb, 0x90, 0x00]),
        }),
  );
  await page.goto("/today");
  await page.getByRole("checkbox", { name: "Autoplay next section" }).uncheck();
  await expect(page.getByRole("tab")).toHaveCount(0);
  await expect(page.locator(".flow-section")).toHaveCount(4);
  expect(
    await page
      .locator(".flow-section")
      .evaluateAll((elements) => elements.map((el) => el.id)),
  ).toEqual([
    "today-scripture",
    "today-reflection",
    "today-prayer",
    "today-practice",
  ]);
  await expect(page.locator(".today-player")).toHaveCount(1);
  await page.getByRole("button", { name: "Play Scripture" }).click();
  await expect(
    page.getByRole("button", { name: "Pause Scripture" }),
  ).toBeVisible();
  await page.evaluate(() => {
    const players = (
      window as unknown as {
        testPlayers: { pause: () => void; onended?: () => void }[];
      }
    ).testPlayers;
    const player = players.at(-1)!;
    player.pause();
    player.onended?.();
  });
  await expect(
    page.getByRole("button", { name: "Read reflection aloud" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { activeReaders: number }).activeReaders,
    ),
  ).toBe(0);
  await expect(page.locator("#today-reflection")).toBeInViewport();
  // Ordinary one-handed scrolling, without a section-link click, also retargets the player.
  await page
    .locator("#today-prayer")
    .evaluate((section) =>
      section.scrollIntoView({ block: "start", behavior: "instant" }),
    );
  await expect(
    page.getByRole("button", { name: "Read prayer aloud" }),
  ).toBeVisible();
  await expect(page.locator(".today-player .audio-engine")).toHaveText(
    "Kokoro · on-device",
  );
  await page.getByRole("link", { name: "04 Practice" }).click();
  await page
    .getByLabel("My response for today")
    .fill("A quiet step I want to keep while scrolling.");
  await page.getByRole("link", { name: "02 Reflection" }).click();
  await page.getByRole("link", { name: "04 Practice" }).click();
  await expect(page.getByLabel("My response for today")).toHaveValue(
    "A quiet step I want to keep while scrolling.",
  );
  expect(new URL(page.url()).pathname).toBe("/today");
});

test("Today preloads the next section and reuses its player at the autoplay handoff", async ({
  page,
}) => {
  await page.route("**/api/tts", (route) =>
    route.request().method() === "HEAD"
      ? route.fulfill({ status: 204 })
      : route.fulfill({
          contentType: "audio/mpeg",
          body: Buffer.from([0xff, 0xfb, 0x90, 0x00]),
        }),
  );
  await page.goto("/settings");
  await seedOfflineKokoroAssets(page);
  await page.goto("/today");
  await expect(page.locator(".today-player")).toHaveAttribute(
    "data-bella-ready",
    "true",
    { timeout: 15000 },
  );
  const jobs = await page.evaluate(
    () => (window as unknown as { kokoroJobs: { mode?: string }[] }).kokoroJobs,
  );
  expect(jobs.some((job) => job.mode === "warm")).toBe(true);
  expect(jobs.filter((job) => job.mode === "prime")).toHaveLength(1);
  await page.evaluate(() => {
    const state = window as unknown as {
      testPlayers: { preload?: string }[];
      preparedReader?: object;
    };
    state.preparedReader = state.testPlayers.find(
      (player) => player.preload === "auto",
    );
  });
  const jobsBeforeFlow = jobs.length;
  const warmBeforeFlow = jobs.filter((job) => job.mode === "warm").length;
  await page.getByRole("button", { name: "Play Scripture" }).click();
  await expect(
    page.getByRole("button", { name: "Pause Scripture" }),
  ).toBeVisible();
  await page.evaluate(() => {
    const player = (
      window as unknown as {
        testPlayers: { pause: () => void; onended?: () => void }[];
      }
    ).testPlayers.at(-1)!;
    player.pause();
    player.onended?.();
  });
  await expect(
    page.getByRole("button", { name: "Pause reflection" }),
  ).toBeVisible({ timeout: 5000 });
  const jobsAfterAutoplay = await page.evaluate(
    () => (window as unknown as { kokoroJobs: { mode?: string }[] }).kokoroJobs,
  );
  // The foreground read consumes the preloaded reflection. Only prayer may
  // enqueue new work once reflection starts; no redundant synthesis or warm-up.
  expect(jobsAfterAutoplay.length).toBeLessThanOrEqual(jobsBeforeFlow + 1);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { preparedReader: { active: boolean } })
          .preparedReader.active,
    ),
  ).toBe(true);
  expect(jobsAfterAutoplay.filter((job) => job.mode === "warm").length).toBe(
    warmBeforeFlow,
  );
});

test("Today autoplay reads each next section, and unchecking prevents another reading", async ({
  page,
}) => {
  await page.route("**/api/tts", (route) =>
    route.request().method() === "HEAD"
      ? route.fulfill({ status: 204 })
      : route.fulfill({
          contentType: "audio/mpeg",
          body: Buffer.from([0xff, 0xfb, 0x90, 0x00]),
        }),
  );
  await page.goto("/today");
  const autoplay = page.getByRole("checkbox", {
    name: "Autoplay next section",
  });
  await expect(autoplay).toBeChecked();
  await page.getByRole("button", { name: "Play Scripture" }).click();
  const finish = async () =>
    page.evaluate(() => {
      const player = (
        window as unknown as {
          testPlayers: {
            active: boolean;
            pause: () => void;
            onended?: () => void;
          }[];
        }
      ).testPlayers.find((player) => player.active)!;
      player.pause();
      player.onended?.();
    });
  await expect(
    page.getByRole("button", { name: "Pause Scripture" }),
  ).toBeVisible();
  await finish();
  await expect(
    page.getByRole("button", { name: "Pause reflection" }),
  ).toBeVisible();
  await expect(page.locator("#today-reflection")).toBeInViewport();
  await finish();
  await expect(
    page.getByRole("button", { name: "Pause prayer" }),
  ).toBeVisible();
  await autoplay.uncheck();
  await finish();
  await expect(
    page.getByRole("button", { name: "Read action aloud" }),
  ).toBeVisible();
  await page.waitForTimeout(1000);
  expect(
    await page.evaluate(
      () => (window as unknown as { activeReaders: number }).activeReaders,
    ),
  ).toBe(0);
});
