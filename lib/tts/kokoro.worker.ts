import { KokoroTTS } from "kokoro-js";
import { env } from "@huggingface/transformers";
import {
  speechChunks,
  wavBytes,
  joinAudio,
  guardSpeechTokenizer,
  SpeechInputTooLong,
} from "./chunks";
import {
  modelCache,
  optimizedModelStored,
  preloadBellaVoice,
} from "./model-cache";
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
let backend = "WASM";
const preparedReadings = new Map<string, ArrayBuffer>();
let cacheEpoch = 0;
type Input = {
  id: number;
  text?: string;
  prepare?: boolean;
  mode?: "warm" | "prime" | "clear" | "cancel";
  crossfadeMs?: number;
  preferGpu?: boolean;
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
    // Start the small voice download beside model/tokenizer loading, not after.
    const voice = preloadBellaVoice().catch(() => {});
    const create = (device: "wasm" | "webgpu", dtype: "q8" | "fp32") =>
      KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
        device,
        dtype,
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
    let tts: KokoroTTS;
    const navigator = self.navigator as typeof self.navigator & {
      gpu?: { requestAdapter: () => Promise<unknown> };
      maxTouchPoints?: number;
      userAgent?: string;
      platform?: string;
    };
    const mobile =
      /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent ?? "") ||
      (navigator.platform === "MacIntel" &&
        (navigator.maxTouchPoints ?? 0) > 1);
    if (
      job.input.preferGpu &&
      !mobile &&
      navigator.gpu &&
      (navigator.hardwareConcurrency ?? 1) >= 4
    ) {
      try {
        if (!(await navigator.gpu.requestAdapter()))
          throw new Error("No GPU adapter");
        backend = "WebGPU";
        tts = await create("webgpu", "fp32");
      } catch {
        backend = "WASM";
        progress(
          job,
          "GPU unavailable. Preparing the smaller Bella model…",
          "model_load",
        );
        tts = await create("wasm", "q8");
      }
    } else {
      backend = "WASM";
      tts = await create("wasm", "q8");
    }
    guardSpeechTokenizer(tts);
    await voice;
    return tts;
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
  let result;
  try {
    result = await tts.generate(text, { voice: "af_bella", speed: 1 });
  } catch (error) {
    if (
      error instanceof SpeechInputTooLong ||
      backend !== "WebGPU" ||
      job.cancelled
    )
      throw error;
    try {
      await tts.model.dispose();
    } catch {
      /* Release errors must not prevent WASM recovery. */
    }
    backend = "WASM";
    model = null;
    modelWarmed = false;
    job.input.preferGpu = false;
    progress(
      job,
      "GPU reading unavailable. Switching Bella to WASM…",
      "model_load",
    );
    result = await (
      await load(job)
    ).generate(text, { voice: "af_bella", speed: 1 });
  }
  // Cancellation discards this job's result, not the successfully compiled model.
  modelWarmed = true;
  return result;
}
async function handle(job: Job) {
  if (job.cancelled) return;
  const { text, prepare, mode } = job.input;
  try {
    progress(job, "Loading Bella on-device…", "model_load");
    const tts = await load(job);
    if (job.cancelled) return;
    if (prepare || mode === "warm") {
      if (!modelWarmed) await generate(job, tts, "Ready.");
      send(job, { type: "ready" });
      return;
    }
    // Lookahead buffers the entire section: use sentence-sized batches even
    // on a cold model instead of paying for multiple tiny startup inferences.
    const parts = speechChunks(text ?? "", {
      warmed: modelWarmed || mode === "prime",
    });
    const key = JSON.stringify([text ?? "", job.input.crossfadeMs ?? 0]);
    let wav = preparedReadings.get(key)?.slice(0);
    if (!wav) {
      const samples: Float32Array[] = [];
      async function synthesize(part: string): Promise<void> {
        if (job.cancelled) return;
        try {
          samples.push((await generate(job, await load(job), part)).audio);
        } catch (error) {
          if (!(error instanceof SpeechInputTooLong)) throw error;
          const words = part.match(/\S+\s*/g) ?? [];
          if (words.length < 2) throw error;
          const middle = Math.ceil(words.length / 2);
          const lead = part.match(/^\s*/)?.[0] ?? "";
          await synthesize(lead + words.slice(0, middle).join(""));
          await synthesize(words.slice(middle).join(""));
        }
      }
      for (const part of parts) {
        await synthesize(part);
        if (job.cancelled) return;
      }
      wav = wavBytes(joinAudio(samples, job.input.crossfadeMs));
      if (job.cancelled) return;
      if (key && job.epoch === cacheEpoch) {
        while (preparedReadings.size >= 4)
          preparedReadings.delete(preparedReadings.keys().next().value!);
        preparedReadings.set(key, wav.slice(0));
      }
    }
    // Both foreground and lookahead deliver exactly one complete WAV.
    send(job, { type: mode === "prime" ? "primed" : "audio", wav }, [wav]);
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
