import { test, expect } from "./fixtures";
test.use({ launchOptions: { args: ["--mute-audio"] } });
test("production build serves the same-origin Paradee WASM runtime and loader", async ({
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

test("production enables isolation and serves an offline speech precache manifest", async ({
  page,
  request,
}) => {
  const response = await request.get("/today");
  expect(response.headers()["cross-origin-opener-policy"]).toBe("same-origin");
  expect(response.headers()["cross-origin-embedder-policy"]).toBe(
    "credentialless",
  );
  await page.goto("/today");
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
  const manifest = await request.get("/tts/manifest.json");
  expect(await manifest.json()).toContain(
    "/tts/ort-wasm-simd-threaded.jsep.wasm",
  );
});
