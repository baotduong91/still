import type { Page } from "@playwright/test";
export async function seedOfflineKokoroAssets(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
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
          new TextEncoder().encode("model").buffer,
          "https://still.test/model_quantized.onnx",
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
    const cache = await caches.open("kokoro-voices");
    await cache.put(
      "https://still.test/voices/af_bella.bin",
      new Response(new Blob(["voice"])),
    );
  });
}
