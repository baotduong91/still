import { KokoroTTS } from "kokoro-js";
import { env } from "@huggingface/transformers";
import { modelCache } from "./model-cache";
env.allowLocalModels = false;
// Large ONNX files can fail CacheStorage.put on mobile/Chromium. Persist blobs
// in IndexedDB instead; the same cache interface is used by Transformers.js.
env.useBrowserCache = false;
env.useCustomCache = true;
env.customCache = modelCache;
env.backends.onnx.wasm!.numThreads = 1;
env.backends.onnx.wasm!.wasmPaths = `${self.location.origin}/tts/`;
let model: Promise<KokoroTTS> | null = null;
let backend = "WASM";
let preferWasm = false;
function load(progress: (message: string) => void) {
  return (model ??= (async () => {
    const loadFor = (device: "webgpu" | "wasm", dtype: "fp32" | "q8") =>
      KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
        device,
        dtype,
        progress_callback: (p) => {
          if (p.status === "progress")
            progress(
              `Downloading on-device voice… ${Math.round(p.progress)}% (${p.file.split("/").at(-1)})`,
            );
          else
            progress(
              "Preparing on-device voice. First use downloads the model; your words stay here.",
            );
        },
      });
    const gpu = (
      navigator as Navigator & {
        gpu?: { requestAdapter: () => Promise<unknown> };
      }
    ).gpu;
    if (gpu && !preferWasm) {
      try {
        if (await gpu.requestAdapter()) {
          const tts = await loadFor("webgpu", "fp32");
          backend = "WebGPU";
          return tts;
        }
      } catch {
        progress("Trying the on-device WASM voice…");
      }
    }
    backend = "WASM";
    try {
      return await loadFor("wasm", "q8");
    } catch (error) {
      // A previously cached WebGPU model can also run on WASM when offline.
      if (!navigator.onLine) return loadFor("wasm", "fp32");
      throw error;
    }
  })().catch((error) => {
    model = null;
    throw error;
  }));
}
// Chunk at word boundaries to stay below Kokoro's token window without dropping words.
function chunks(text: string) {
  return text.match(/(?:\S+\s*){1,35}/g) ?? [];
}
self.onmessage = async (
  event: MessageEvent<{
    id: number;
    text?: string;
    prepare?: boolean;
    allowWebGPU?: boolean;
  }>,
) => {
  const { id, text, prepare } = event.data;
  preferWasm ||= event.data.allowWebGPU === false;
  const progress = (message: string) =>
    self.postMessage({ id, type: "progress", message });
  try {
    let tts = await load(progress);
    const generate = async (part: string) => {
      try {
        return await tts.generate(part, { voice: "af_bella", speed: 1 });
      } catch (error) {
        if (backend !== "WebGPU") throw error;
        progress("Trying the on-device WASM voice…");
        await tts.model.dispose();
        preferWasm = true;
        model = null;
        tts = await load(progress);
        return tts.generate(part, { voice: "af_bella", speed: 1 });
      }
    };
    if (prepare) {
      await generate("Ready.");
      self.postMessage({ id, type: "ready", backend });
      return;
    }
    const parts: Float32Array[] = [];
    let length = 0;
    for (const part of chunks(text ?? "")) {
      progress(`Reading on-device · ${backend}…`);
      const audio = await generate(part);
      parts.push(audio.audio);
      length += audio.audio.length;
    }
    const samples = new Float32Array(length);
    let offset = 0;
    for (const part of parts) {
      samples.set(part, offset);
      offset += part.length;
    }
    const wav = new ArrayBuffer(44 + samples.length * 2),
      view = new DataView(wav);
    const str = (i: number, s: string) => {
      for (let j = 0; j < s.length; j++) view.setUint8(i + j, s.charCodeAt(j));
    };
    str(0, "RIFF");
    view.setUint32(4, 36 + samples.length * 2, true);
    str(8, "WAVE");
    str(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, 24000, true);
    view.setUint32(28, 48000, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    str(36, "data");
    view.setUint32(40, samples.length * 2, true);
    samples.forEach((s, i) =>
      view.setInt16(
        44 + i * 2,
        Math.max(-1, Math.min(1, s)) * (s < 0 ? 32768 : 32767),
        true,
      ),
    );
    self.postMessage({ id, type: "audio", wav, backend }, { transfer: [wav] });
  } catch (error) {
    console.warn(
      "On-device voice initialization failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    self.postMessage({
      id,
      type: "error",
      message:
        "On-device voice is not ready. Connect once to download it, or try a device voice.",
    });
  }
};
