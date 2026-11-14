import { test, expect } from "./fixtures";
import { PARADEE_MODEL_URL } from "../../lib/tts/paradee-model";
import { seedOfflineParadeeAssets } from "./helpers/paradee-cache";
test.use({ stateOverrides: { speechEngine: "device", setupSeen: true } });
test("model bytes and voice cache survive navigation in Safari", async ({
  page,
}) => {
  await page.goto("/settings");
  await seedOfflineParadeeAssets(page);
  const stored = () =>
    page.evaluate(async (modelUrl) => {
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
      return { keys, runtime: await caches.keys() };
    }, PARADEE_MODEL_URL);
  const initial = await stored();
  expect(initial.keys).toEqual([PARADEE_MODEL_URL]);
  expect(initial.runtime.length).toBeGreaterThanOrEqual(0);
  await page.goto("/today");
  expect(await stored()).toEqual(initial);
});