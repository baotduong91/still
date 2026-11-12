import { test, expect } from "./fixtures";
test.use({ launchOptions: { args: ["--mute-audio"] } });
test("production build serves the same-origin Bella WASM runtime and loader", async ({
  request,
}) => {
  const loader = await request.get("/tts/ort-wasm-simd-threaded.jsep.mjs");
  expect(loader.status()).toBe(200);
  expect(loader.headers()["content-type"]).not.toContain("text/html");
  const wasm = await request.get("/tts/ort-wasm-simd-threaded.jsep.wasm", {
    headers: { Range: "bytes=0-7" },
  });
  expect([200, 206]).toContain(wasm.status());
  expect([...(await wasm.body()).subarray(0, 4)]).toEqual([0, 97, 115, 109]);
});
test("real Kokoro WASM model loads, reads and works after offline reload", async ({
  page,
  context,
}) => {
  test.skip(
    process.env.TEST_REAL_TTS !== "1",
    "Opt-in: downloads the actual Kokoro model and exercises local inference.",
  );
  test.setTimeout(360000);
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type()))
      console.log("VOICE", message.text().slice(0, 500));
  });
  page.on("requestfailed", (request) =>
    console.log(
      "VOICE REQUEST",
      new URL(request.url()).pathname,
      request.failure()?.errorText,
    ),
  );
  await page.addInitScript(() => {
    if (sessionStorage.getItem("still-test-real-audio") === "1") return;
    HTMLMediaElement.prototype.play = async function () {};
    HTMLMediaElement.prototype.pause = function () {};
  });
  await page.goto("/settings#reading-voice");
  await page.getByLabel("Reading voice engine").selectOption("kokoro");
  await page
    .getByRole("button", { name: "Download for offline", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Ready offline", {
    timeout: 60000,
  });
  await page
    .getByRole("button", { name: "Download on-device voice", exact: true })
    .click();
  await expect(
    page.getByText("Bella is ready on this device", { exact: false }),
  ).toBeVisible({ timeout: 240000 });
  await page.goto("/create-image?ref=John%203%3A16&translation=WEB");
  let startedAt = Date.now();
  await page.getByRole("button", { name: "Play Scripture" }).click();
  await expect(
    page.getByRole("button", { name: "Pause Scripture" }),
  ).toBeVisible({ timeout: 90000 });
  console.log("VOICE_FIRST_SEGMENT_MS", Date.now() - startedAt);
  await page.getByRole("button", { name: "Stop Scripture" }).click();
  console.log(
    "VOICE CACHES",
    await page.evaluate(async () => {
      const result: Record<string, string[]> = {};
      for (const name of await caches.keys()) {
        const keys = await (await caches.open(name)).keys();
        result[name] = keys
          .map((k) => new URL(k.url).pathname)
          .filter((p) => /tts|onnx|voice|tokeniz|config|chunks/.test(p));
      }
      return result;
    }),
  );
  await context.setOffline(true);
  await page.reload();
  startedAt = Date.now();
  await page.getByRole("button", { name: "Play Scripture" }).click();
  await expect(
    page
      .getByRole("button", { name: "Pause Scripture" })
      .or(page.getByText("Audio is unavailable right now.", { exact: false })),
  ).toBeVisible({ timeout: 90000 });
  await expect(
    page.getByRole("button", { name: "Pause Scripture" }),
  ).toBeVisible({ timeout: 5000 });
  console.log("VOICE_OFFLINE_FIRST_SEGMENT_MS", Date.now() - startedAt);
  await expect(page.locator(".audio-engine")).toContainText(
    "Kokoro · Bella · WASM",
  );
  await page.getByRole("button", { name: "Stop Scripture" }).click();
  await context.setOffline(false);
  await page.evaluate(() =>
    sessionStorage.setItem("still-test-real-audio", "1"),
  );
  await page.goto("/today");
  await expect(page.locator(".today-player")).toHaveAttribute(
    "data-bella-ready",
    "true",
    { timeout: 90000 },
  );
  await page.getByRole("link", { name: "02 Reflection" }).click();
  startedAt = Date.now();
  await page.getByRole("button", { name: "Read reflection aloud" }).click();
  await expect(
    page.getByRole("button", { name: "Pause reflection" }),
  ).toBeVisible();
  const warmLatency = Date.now() - startedAt;
  console.log("VOICE_WARM_TODAY_FIRST_SEGMENT_MS", warmLatency);
  expect(warmLatency).toBeLessThan(1500);
  await page.getByRole("button", { name: "Stop reflection" }).click();
});

test("real Edge Scripture starts decoding a streamed MP3 in the Today player", async ({
  page,
}) => {
  test.skip(
    process.env.TEST_REAL_TTS !== "1",
    "Opt-in: calls Edge with public WEB Scripture and decodes muted audio.",
  );
  test.setTimeout(90000);
  let posts = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/tts") && request.method() === "POST")
      posts++;
  });
  await page.goto("/today");
  const exact = (await page.locator("blockquote span").first().textContent())!
    .replace(/^\d+/, "")
    .trim();
  const sent = page.waitForRequest(
    (request) =>
      request.url().endsWith("/api/tts") && request.method() === "POST",
  );
  const before = Date.now();
  await page.getByRole("button", { name: "Play Scripture" }).click();
  const request = await sent;
  expect(request.postDataJSON().text).toBe(exact);
  expect(request.postDataJSON().reference).toBe("Matthew 6:34");
  await expect(
    page.getByRole("button", { name: "Pause Scripture" }),
  ).toBeVisible({ timeout: 25000 });
  await expect(page.locator(".today-player .audio-engine")).toHaveText(
    "Edge · Jenny",
  );
  console.log(
    "VOICE_REAL_EDGE_START_MS",
    Date.now() - before,
    "STREAM",
    request.postDataJSON().stream === true,
  );
  // Let the stream finish caching without waiting for the verse to finish speaking.
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const entry = performance
          .getEntriesByType("resource")
          .find(
            (entry) =>
              entry.name.endsWith("/api/tts") &&
              (entry as PerformanceResourceTiming).initiatorType === "fetch" &&
              (entry as PerformanceResourceTiming).encodedBodySize > 0,
          );
        return !!entry;
      }),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Stop Scripture" }).click();
  const replay = Date.now();
  await page.getByRole("button", { name: "Play Scripture" }).click();
  await expect(
    page.getByRole("button", { name: "Pause Scripture" }),
  ).toBeVisible();
  console.log("VOICE_REAL_EDGE_REPLAY_MS", Date.now() - replay);
  expect(posts).toBe(1);
  await page.getByRole("button", { name: "Stop Scripture" }).click();
});
