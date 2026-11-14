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
      // ArrayBuffers avoid WebKit's Blob/File IndexedDB serialization failure.
      // Retain support for model downloads saved by previous versions.
      const stored = (await db.get("assets", key)) as
        Blob | ArrayBuffer | undefined;
      const blob = stored instanceof ArrayBuffer ? new Blob([stored]) : stored;
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
    const bytes = await response.arrayBuffer();
    const db = await database();
    try {
      await db.put("assets", bytes, key);
    } finally {
      db.close();
    }
  },
};
export async function optimizedModelStored() {
  const db = await database();
  try {
    return (await db.getAllKeys("assets")).some((key) =>
      /\/(model_quantized|model)\.onnx$/.test(String(key)),
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

// kokoro-js otherwise fetches Bella only after model loading and phonemization.
// Use its exact cache namespace/URL so the library consumes the same bytes.
export async function preloadBellaVoice() {
  const url =
    "https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/voices/af_bella.bin";
  const cache = await caches.open("kokoro-voices");
  if (await cache.match(url)) return;
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error("Bella voice download failed");
  await cache.put(url, response);
}

export async function prepareSpeechRuntime() {
  const response = await fetch("/tts/manifest.json", { cache: "no-cache" });
  if (!response.ok) throw new Error("Speech runtime unavailable");
  const files: unknown = await response.json();
  if (
    !Array.isArray(files) ||
    !files.every(
      (f) =>
        typeof f === "string" && /^\/tts\/ort-wasm[\w.-]+\.(wasm|mjs)$/.test(f),
    )
  )
    throw new Error("Invalid speech runtime manifest");
  const cache = await caches.open("still-tts-runtime-v1");
  await Promise.all(
    files.map(async (file) => {
      if (!(await cache.match(file))) await cache.add(file);
    }),
  );
}
