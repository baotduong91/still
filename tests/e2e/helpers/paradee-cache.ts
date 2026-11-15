import type { Page } from "@playwright/test";
import { PARADEE_MODEL_URL } from "../../../lib/tts/paradee-model";

export async function seedOfflineParadeeAssets(
  page: Page,
  waitForServiceWorker = true,
) {
  await page.evaluate(
    async ({ modelUrl, waitForServiceWorker }) => {
      if (waitForServiceWorker) await navigator.serviceWorker.ready;
      if (waitForServiceWorker && !navigator.serviceWorker.controller)
        await new Promise<void>((resolve) => {
          navigator.serviceWorker.addEventListener(
            "controllerchange",
            () => resolve(),
            { once: true },
          );
        });
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.open("still-tts-models", 1);
        req.onupgradeneeded = () => req.result.createObjectStore("assets");
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("assets", "readwrite");
          tx.objectStore("assets").put(
            new TextEncoder().encode("paradee-model").buffer,
            modelUrl,
          );
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = (event) =>
            reject(
              new Error(
                "Model seed: " +
                  ((event.target as IDBRequest).error?.message ??
                    tx.error?.message ??
                    "unknown"),
              ),
            );
        };
        req.onerror = () => reject(req.error);
      });
    },
    { modelUrl: PARADEE_MODEL_URL, waitForServiceWorker },
  );
}
