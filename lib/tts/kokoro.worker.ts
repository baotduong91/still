import { KokoroTTS } from "kokoro-js";
import { env } from "@huggingface/transformers";
import { speechChunks, wavBytes } from "./chunks";
import { modelCache, optimizedModelStored } from "./model-cache";
env.allowLocalModels = false;
env.useBrowserCache = false;
env.useCustomCache = true;
env.customCache = modelCache;
// Shared-memory WASM threads require cross-origin isolation. Keep Vercel's
// normal, non-isolated PWA on one thread; never enable an unsupported backend.
env.backends.onnx.wasm!.numThreads =
  self.crossOriginIsolated &&
  typeof SharedArrayBuffer !== "undefined" &&
  (self.navigator.hardwareConcurrency ?? 1) >= 4
    ? 2
    : 1;
env.backends.onnx.wasm!.wasmPaths = `${self.location.origin}/tts/`;
let model: Promise<KokoroTTS> | null = null;
let modelWarmed = false;
const backend = "WASM";
const preparedReadings = new Map<string, ArrayBuffer>();
let cacheEpoch = 0;
type Input = {
  id: number;
  text?: string;
  prepare?: boolean;
  mode?: "warm" | "prime" | "clear" | "cancel";
  skipFirst?: boolean;
};
type Job = {
  input: Input;
  cancelled: boolean;
  phase: string;
  step: number;
  timer: ReturnType<typeof setInterval>;
  epoch: number;
};
const pending = new Map<number, Job>();
let jobs = Promise.resolve();
function send(
  job: Job,
  data: Record<string, unknown>,
  transfer?: ArrayBuffer[],
) {
  if (!job.cancelled)
    self.postMessage(
      { id: job.input.id, backend, modelWarmed, ...data },
      { transfer: transfer ?? [] },
    );
}
function progress(job: Job, message: string, phase: string, loaded?: number) {
  job.phase = phase;
  send(job, { type: "progress", message, phase, step: job.step, loaded });
}
function load(job: Job) {
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
            job,
            `${cached ? "Loading downloaded Bella" : "Downloading smaller Bella voice"}… ${percent} (${p.file.split("/").at(-1)})`,
            cached ? "model_load" : "download",
            p.loaded,
          );
        } else
          progress(
            job,
            cached
              ? "Loading downloaded Bella on-device…"
              : "Preparing Bella’s model. First use downloads the smaller model…",
            "model_load",
          );
      },
    });
  })().catch((error) => {
    model = null;
    throw error;
  }));
}
async function generate(job: Job, tts: KokoroTTS, text: string) {
  job.step++;
  progress(
    job,
    modelWarmed
      ? "Preparing the next Bella segment…"
      : "First Bella synthesis can take 1–3 minutes on desktop…",
    modelWarmed ? "warm_inference" : "first_inference",
  );
  const result = await tts.generate(text, { voice: "af_bella", speed: 1 });
  // Cancellation discards this job's result, not the successfully compiled model.
  modelWarmed = true;
  return result;
}
async function handle(job: Job) {
  if (job.cancelled) return;
  const { text, prepare, mode, skipFirst } = job.input;
  try {
    progress(job, "Loading Bella on-device…", "model_load");
    const tts = await load(job);
    if (job.cancelled) return;
    if (prepare || mode === "warm") {
      if (!modelWarmed) await generate(job, tts, "Ready.");
      send(job, { type: "ready" });
      return;
    }
    const parts = speechChunks(text ?? "", { warmed: modelWarmed });
    if (mode === "prime") {
      const key = text ?? "";
      if (key && !preparedReadings.has(key)) {
        const samples: Float32Array[] = [];
        for (const part of parts) {
          if (job.cancelled) return;
          samples.push((await generate(job, tts, part)).audio);
        }
        if (job.cancelled || job.epoch !== cacheEpoch) return;
        const joined = new Float32Array(
          samples.reduce((n, a) => n + a.length, 0),
        );
        let offset = 0;
        for (const sample of samples) {
          joined.set(sample, offset);
          offset += sample.length;
        }
        while (preparedReadings.size >= 4)
          preparedReadings.delete(preparedReadings.keys().next().value!);
        preparedReadings.set(key, wavBytes(joined));
      }
      const wav = preparedReadings.get(key)?.slice(0);
      send(
        job,
        wav ? { type: "primed", wav } : { type: "ready" },
        wav ? [wav] : undefined,
      );
      return;
    }
    // A foreground read queued behind preparation reuses the entire section.
    const prepared = preparedReadings.get(text ?? "")?.slice(0);
    if (prepared) {
      send(job, { type: "audio", wav: prepared }, [prepared]);
      return;
    }
    for (let index = skipFirst ? 1 : 0; index < parts.length; index++) {
      if (job.cancelled) return;
      const wav = wavBytes((await generate(job, tts, parts[index])).audio);
      if (job.cancelled) return;
      send(job, { type: "chunk", wav, index, total: parts.length }, [wav]);
    }
    send(job, { type: "done" });
  } catch {
    send(job, {
      type: "error",
      message:
        "Bella could not finish this attempt. Try Bella again, or choose a device voice.",
    });
  }
}
self.onmessage = (event: MessageEvent<Input>) => {
  const input = event.data;
  if (input.mode === "cancel") {
    const job = pending.get(input.id);
    if (job) {
      job.cancelled = true;
      clearInterval(job.timer);
    }
    return;
  }
  if (input.mode === "clear") {
    cacheEpoch++;
    preparedReadings.clear();
    for (const job of pending.values())
      if (job.input.mode === "warm" || job.input.mode === "prime") {
        job.cancelled = true;
        clearInterval(job.timer);
      }
    return;
  }
  if (pending.has(input.id)) return;
  const job: Job = {
    input,
    cancelled: false,
    phase: "queued",
    step: 0,
    epoch: cacheEpoch,
    timer: setInterval(() => {
      if (
        job.phase !== "queued" &&
        !job.phase.endsWith("inference") &&
        job.phase !== "model_load" &&
        job.phase !== "download"
      )
        return;
      send(job, {
        type: "progress",
        phase: job.phase,
        step: job.step,
        heartbeat: true,
        message:
          job.phase === "queued"
            ? "Waiting for Bella’s current preparation…"
            : "Still preparing Bella…",
      });
    }, 5000),
  };
  pending.set(input.id, job);
  progress(job, "Waiting for Bella…", "queued");
  // Exactly one serial handler. ONNX inference cannot be preempted safely;
  // cancelled jobs discard results before any audio/cache write or next chunk.
  jobs = jobs
    .then(() => handle(job))
    .finally(() => {
      clearInterval(job.timer);
      pending.delete(input.id);
    })
    .catch(() => {});
};
