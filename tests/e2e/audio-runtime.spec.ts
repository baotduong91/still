import { test, expect } from "@playwright/test";
test.use({ launchOptions: { args: ["--disable-webgpu"] } });
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
    Object.defineProperty(navigator, "gpu", { value: undefined });
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
  await page.getByRole("button", { name: "Play Scripture" }).click();
  await expect(
    page.getByRole("button", { name: "Pause Scripture" }),
  ).toBeVisible({ timeout: 90000 });
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
  await page.getByRole("button", { name: "Play Scripture" }).click();
  await expect(
    page
      .getByRole("button", { name: "Pause Scripture" })
      .or(page.getByText("Audio is unavailable right now.", { exact: false })),
  ).toBeVisible({ timeout: 90000 });
  await expect(
    page.getByRole("button", { name: "Pause Scripture" }),
  ).toBeVisible({ timeout: 5000 });
  await expect(page.locator(".audio-engine")).toContainText(
    "Kokoro · Bella · WASM",
  );
});
