import { test, expect } from "./fixtures";
import { seedOfflineKokoroAssets } from "./helpers/bella-cache";
test.use({ stateOverrides: { speechEngine: "device", setupSeen: true } });
test("model bytes and voice cache survive navigation in Safari", async ({
  page,
}) => {
  await page.goto("/settings");
  await seedOfflineKokoroAssets(page);
  const stored = () =>
    page.evaluate(async () => {
      const keys = await new Promise((resolve, reject) => {
        const r = indexedDB.open("still-tts-models", 1);
        r.onsuccess = () => {
          const db = r.result;
          const q = db.transaction("assets").objectStore("assets").getAllKeys();
          q.onsuccess = () => {
            resolve(q.result);
            db.close();
          };
          q.onerror = () => reject(String(q.error));
        };
        r.onerror = () => reject(String(r.error));
      });
      return {
        keys,
        voices: (await (await caches.open("kokoro-voices")).keys()).map(
          (r) => r.url,
        ),
      };
    });
  const initial = await stored();
  expect(initial.keys).toEqual(["https://still.test/model_quantized.onnx"]);
  expect(initial.voices).toHaveLength(1);
  await page.goto("/today");
  expect(await stored()).toEqual(initial);
});
