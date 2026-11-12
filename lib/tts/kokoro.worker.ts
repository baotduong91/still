import { KokoroTTS } from "kokoro-js";
import { env } from "@huggingface/transformers";
import { speechChunks, wavBytes } from "./chunks";
import { modelCache, optimizedModelStored } from "./model-cache";
env.allowLocalModels = false;
// Large ONNX files can fail CacheStorage.put on mobile/Chromium. Persist blobs
// in IndexedDB instead; the same cache interface is used by Transformers.js.
env.useBrowserCache = false;
env.useCustomCache = true;
env.customCache = modelCache;
env.backends.onnx.wasm!.numThreads = 1;
env.backends.onnx.wasm!.wasmPaths = `${self.location.origin}/tts/`;
let model: Promise<KokoroTTS> | null = null;
const backend = "WASM";
const firstSegments = new Map<string, ArrayBuffer>();
let jobs = Promise.resolve();
function load(
  progress: (message: string, phase: string, loaded?: number) => void,
) {
  return (model ??= (async () => {
    const cached = await optimizedModelStored().catch(() => false);
    return KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
      device: "wasm",
      dtype: "q8",
      progress_callback: (p) => {
        if (p.status === "progress") {
          const percent = Number.isFinite(p.progress)
            ? `${Math.round(p.progress)}%`
            : `${Math.round(p.loaded / 1048576)} MB`;
          progress(
            `${cached ? "Loading downloaded Bella" : "Downloading smaller Bella voice"}… ${percent} (${p.file.split("/").at(-1)})`,
            cached ? "loading" : "download",
            p.loaded,
          );
        } else
          progress(
            cached
              ? "Loading downloaded Bella on-device…"
              : "Loading Bella on-device. First use downloads the smaller model…",
            "loading",
          );
      },
    });
  })().catch((error) => {
    model = null;
    throw error;
  }));
}
async function handle(
  event: MessageEvent<{
    id: number;
    text?: string;
    prepare?: boolean;
    mode?: "warm" | "prime" | "clear";
    skipFirst?: boolean;
  }>,
) {
  const { id, text, prepare } = event.data;
  const progress = (message: string, phase: string, loaded?: number) =>
    self.postMessage({ id, type: "progress", message, phase, loaded });
  try {
    if (event.data.mode === "clear") {
      firstSegments.clear();
      self.postMessage({ id, type: "ready", backend });
      return;
    }
    const tts = await load(progress);
    if (event.data.mode === "warm") {
      self.postMessage({ id, type: "ready", backend });
      return;
    }
    if (prepare) {
      progress("Checking Bella’s voice on this device…", "inference");
      await tts.generate("Ready.", { voice: "af_bella" });
      self.postMessage({ id, type: "ready", backend });
      return;
    }
    const parts = speechChunks(text ?? "");
    if (event.data.mode === "prime") {
      const first = parts[0];
      if (first && !firstSegments.has(first)) {
        progress("Preparing your next reading…", "inference");
        const result = await tts.generate(first, {
          voice: "af_bella",
          speed: 1,
        });
        while (firstSegments.size >= 8)
          firstSegments.delete(firstSegments.keys().next().value!);
        firstSegments.set(first, wavBytes(result.audio));
      }
      const wav = first ? firstSegments.get(first)?.slice(0) : undefined;
      if (wav)
        self.postMessage(
          { id, type: "primed", backend, wav },
          { transfer: [wav] },
        );
      else self.postMessage({ id, type: "ready", backend });
      return;
    }
    for (
      let index = event.data.skipFirst ? 1 : 0;
      index < parts.length;
      index++
    ) {
      progress(
        `Preparing audio ${index + 1} of ${parts.length} · Bella…`,
        "inference",
      );
      let wav: ArrayBuffer;
      const cached = index === 0 ? firstSegments.get(parts[index]) : undefined;
      if (cached) wav = cached.slice(0);
      else {
        const audio = await tts.generate(parts[index], {
          voice: "af_bella",
          speed: 1,
        });
        wav = wavBytes(audio.audio);
      }
      self.postMessage(
        { id, type: "chunk", wav, backend, index, total: parts.length },
        { transfer: [wav] },
      );
    }
    self.postMessage({ id, type: "done", backend });
  } catch {
    self.postMessage({
      id,
      type: "error",
      message:
        "Bella could not finish. Try the installed device voice for immediate private reading.",
    });
  }
}

self.onmessage = (event) => {
  jobs = jobs.then(() => handle(event)).catch(() => {});
};
