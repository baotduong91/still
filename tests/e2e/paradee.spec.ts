import { test, expect } from "./fixtures";
import { Bible, type Corpus } from "../../lib/bible";
import { readFileSync } from "node:fs";
const corpus = JSON.parse(
  readFileSync(
    new URL("../../public/bibles/WEB.json", import.meta.url),
    "utf8",
  ),
);
import { verseSpeech } from "../../lib/tts/shared";
import { PARADEE_MODEL_URL } from "../../lib/tts/paradee-model";
import {
  buildSpokenText,
  devotionReflectionSpokenText,
} from "../../lib/tts/reading";
test.use({
  stateOverrides: { speechEngine: "kokoro" as never },
  launchOptions: { args: ["--mute-audio"] },
});

test("Today automatically starts Paradee setup and migrates a saved voice selection", async ({
  page,
}) => {
  await page.route("**/Paradee-8M-v1.1/**", (route) =>
    route.fulfill({ status: 503, body: "Offline fixture" }),
  );
  const download = page.waitForRequest((r) =>
    r.url().includes("Paradee-8M-v1.1"),
  );
  await page.goto("/today");
  await download;
  await expect(
    page.getByRole("heading", { name: "Scripture for today" }),
  ).toBeVisible();
  await page.goto("/settings#reading-voice");
  await expect(page.getByLabel("Reading voice engine")).toHaveValue("paradee");
  await expect(
    page.getByLabel("Reading voice engine").locator("option"),
  ).toHaveText([
    "Paradee 1.1 · Heart · recommended",
    "Edge · Jenny · online preferred",
    "Device voice · instant · no model download",
  ]);
});

test("real Paradee downloads, plays full private sections and reuses its model after offline reload", async ({
  page,
  context,
  savedPlan,
}) => {
  test.skip(
    process.env.TEST_REAL_PARADEE !== "1",
    "Opt-in download of the actual Paradee model; no hosted inference.",
  );
  test.setTimeout(300000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error")
      console.log("PARADEE ERROR", m.text().slice(0, 300));
  });
  // Real workers, WASM, phonemizer and audio decoding. Mute via browser rather than
  // replacing synthesis with a fixture; only bypass autoplay restrictions.
  await page.addInitScript(() => {
    Object.assign(window, { realPlayers: [] });
    window.Audio = new Proxy(window.Audio, {
      construct(target, args) {
        const player = Reflect.construct(target, args) as HTMLAudioElement;
        (
          window as unknown as { realPlayers: HTMLAudioElement[] }
        ).realPlayers.push(player);
        return player;
      },
    });
    const Original = window.Worker;
    (window as unknown as { spokenInputs: string[] }).spokenInputs = [];
    window.Worker = class extends Original {
      postMessage(
        message: unknown,
        transfer?: Transferable[] | StructuredSerializeOptions,
      ) {
        const job = message as { text?: string };
        if (job.text)
          (window as unknown as { spokenInputs: string[] }).spokenInputs.push(
            job.text,
          );
        super.postMessage(
          message,
          Array.isArray(transfer) ? { transfer } : transfer,
        );
      }
    };
  });
  await page.goto("/settings#reading-voice");
  await page
    .getByRole("button", { name: "Download for offline", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Ready offline", {
    timeout: 60000,
  });
  const started = Date.now();
  await page
    .getByRole("button", { name: "Download on-device voice", exact: true })
    .click();
  await expect(
    page.getByText("Paradee is ready on this device", { exact: false }),
  ).toBeVisible({ timeout: 180000 });
  console.log("PARADEE_SETUP_MS", Date.now() - started);
  const modelBytes = await page.evaluate(async (url) => {
    const request = indexedDB.open("still-tts-models", 1);
    return new Promise<number>((resolve, reject) => {
      request.onsuccess = () => {
        const db = request.result;
        const read = db.transaction("assets").objectStore("assets").get(url);
        read.onsuccess = () => {
          db.close();
          resolve(read.result.byteLength);
        };
        read.onerror = () => reject(read.error);
      };
    });
  }, PARADEE_MODEL_URL);
  expect(modelBytes).toBeGreaterThan(8_000_000);
  expect(modelBytes).toBeLessThan(12_000_000);
  await page.goto("/today");
  let cloudReads = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/api/tts")) cloudReads++;
  });
  await page.getByRole("link", { name: "02 Reflection" }).click();
  const first = Date.now();
  await page.getByRole("button", { name: "Read reflection aloud" }).click();
  // Safari may need a second user gesture after async synthesis.
  const paused = page.getByRole("button", { name: "Pause reflection" });
  const ready = page.getByText("Your audio is ready. Tap Play to listen.");
  await expect(paused.or(ready)).toBeVisible({ timeout: 60000 });
  if (await ready.isVisible())
    await page.getByRole("button", { name: "Read reflection aloud" }).click();
  await expect(paused).toBeVisible();
  console.log("PARADEE_COLD_SECTION_MS", Date.now() - first);
  await expect(page.locator(".today-player .audio-engine")).toContainText(
    "Paradee 1.1 · Heart · WASM",
  );
  expect(
    await page.evaluate(
      () => (window as unknown as { spokenInputs: string[] }).spokenInputs,
    ),
  ).toContain(
    buildSpokenText({
      kind: "devotional",
      text: devotionReflectionSpokenText(savedPlan.days[0]),
    }),
  );
  await expect(page.locator(".today-player")).toHaveAttribute(
    "data-voice-ready",
    "true",
    { timeout: 60000 },
  );
  const handoff = Date.now();
  await page.evaluate(() => {
    const player = (
      window as unknown as { realPlayers: HTMLAudioElement[] }
    ).realPlayers.find((p) => !p.paused);
    if (!player) throw new Error("No active reflection player");
    player.pause();
    player.dispatchEvent(new Event("ended"));
  });
  await expect(
    page.getByRole("button", { name: "Pause prayer" }).or(ready),
  ).toBeVisible({ timeout: 3000 });
  console.log("PARADEE_PREPARED_HANDOFF_MS", Date.now() - handoff);
  if (await ready.isVisible())
    await page.getByRole("button", { name: "Read prayer aloud" }).click();
  await page.getByRole("button", { name: "Stop prayer" }).click();
  expect(cloudReads).toBe(0);
  await context.setOffline(true);
  await page.reload();
  await page.getByRole("link", { name: "03 Prayer" }).click();
  const resumed = Date.now();
  await page.getByRole("button", { name: "Read prayer aloud" }).click();
  const prayer = page.getByRole("button", { name: "Pause prayer" });
  await expect(prayer.or(ready)).toBeVisible({ timeout: 60000 });
  if (await ready.isVisible())
    await page.getByRole("button", { name: "Read prayer aloud" }).click();
  await expect(prayer).toBeVisible();
  console.log("PARADEE_OFFLINE_RELOAD_MS", Date.now() - resumed);
  await page.getByRole("button", { name: "Stop prayer" }).click();
  await page.getByRole("link", { name: "01 Scripture" }).click();
  await page.getByRole("button", { name: "Play Scripture" }).click();
  await expect(
    page.getByRole("button", { name: "Pause Scripture" }).or(ready),
  ).toBeVisible({ timeout: 60000 });
  if (await ready.isVisible())
    await page.getByRole("button", { name: "Play Scripture" }).click();
  await expect(
    page.getByRole("button", { name: "Pause Scripture" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { spokenInputs: string[] }).spokenInputs,
    ),
  ).toContain(
    buildSpokenText({
      kind: "scripture",
      ...verseSpeech(
        new Bible(corpus as Corpus).lookup(
          (await page.locator(".flow-verse-copy .eyebrow").innerText()).split(
            " · ",
          )[0],
        ),
      ),
    }),
  );
  expect(cloudReads).toBe(0);
  expect(errors).toEqual([]);
});
