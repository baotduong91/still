import { openDB } from "idb";
// Static model assets only. Separate from Still's private plans/journal database.
const database = () =>
  openDB("still-tts-models", 1, {
    upgrade(db) {
      db.createObjectStore("assets");
    },
  });
export const modelCache = {
  async match(key: string) {
    const db = await database();
    try {
      const blob = (await db.get("assets", key)) as Blob | undefined;
      return blob
        ? new Response(blob, {
            headers: {
              "Content-Type": blob.type || "application/octet-stream",
              "Content-Length": String(blob.size),
            },
          })
        : undefined;
    } finally {
      db.close();
    }
  },
  async put(key: string, response: Response) {
    const blob = await response.blob();
    const db = await database();
    try {
      await db.put("assets", blob, key);
    } finally {
      db.close();
    }
  },
};
export async function optimizedModelStored() {
  const db = await database();
  try {
    return (await db.getAllKeys("assets")).some((key) =>
      String(key).endsWith("/model_quantized.onnx"),
    );
  } finally {
    db.close();
  }
}
export async function offlineModelStored() {
  if (!(await optimizedModelStored())) return false;
  const voiceCache = await caches.open("kokoro-voices");
  return (await voiceCache.keys()).some((key) =>
    key.url.endsWith("/voices/af_bella.bin"),
  );
}
