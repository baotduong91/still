import { InferenceSession, Tensor, env } from "onnxruntime-web/webgpu";
import {
  speechChunks,
  wavBytes,
  joinAudio,
  SpeechInputTooLong,
} from "./chunks";
import { loadParadeeBytes } from "./paradee-model";
import { paradeeInput } from "./paradee-phonemes";
// Use the already-shipped same-origin JSEP WASM runtime; no GPU is required.
env.wasm.wasmPaths = `${self.location.origin}/tts/`;
env.wasm.numThreads =
  self.crossOriginIsolated &&
  typeof SharedArrayBuffer !== "undefined" &&
  (self.navigator.hardwareConcurrency ?? 1) >= 4
    ? 2
    : 1;
let model: Promise<InferenceSession> | null = null;
let modelWarmed = false;
const backend = "WASM";
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
    const bytes = await loadParadeeBytes((message) =>
      progress(job, message, "download"),
    );
    progress(job, "Loading Paradee 1.1 on-device…", "model_load");
    return InferenceSession.create(bytes, {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
    });
  })().catch((error) => {
    model = null;
    throw error;
  }));
}
async function generate(job: Job, tts: InferenceSession, text: string) {
  job.step++;
  progress(
    job,
    "Preparing Heart on-device…",
    modelWarmed ? "warm_inference" : "first_inference",
  );
  const ids = await paradeeInput(text);
  if (job.cancelled) return { audio: new Float32Array() };
  const inputIds = new Tensor("int64", ids, [1, ids.length]);
  const speed = new Tensor("float32", new Float32Array([1]), [1]);
  try {
    const output = await tts.run({ input_ids: inputIds, speed });
    try {
      const waveform = output.waveform;
      if (
        !(waveform?.data instanceof Float32Array) ||
        !waveform.data.length ||
        !waveform.data.every(Number.isFinite)
      )
        throw new Error("Invalid Paradee audio");
      modelWarmed = true;
      return { audio: waveform.data.slice() };
    } finally {
      Object.values(output).forEach((tensor) => tensor.dispose());
    }
  } finally {
    inputIds.dispose();
    speed.dispose();
  }
}
async function handle(job: Job) {
  if (job.cancelled) return;
  const { text, prepare, mode } = job.input;
  try {
    progress(job, "Loading Paradee on-device…", "model_load");
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
      warmed: true,
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
        "Paradee could not finish this attempt. Try Paradee again, or choose a device voice.",
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
            ? "Waiting for Paradee’s current preparation…"
            : "Still preparing Paradee…",
      });
    }, 5000),
  };
  pending.set(input.id, job);
  progress(job, "Waiting for Paradee…", "queued");
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
