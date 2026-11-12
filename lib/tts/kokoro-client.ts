import { offlineModelStored } from "./model-cache";
export const kokoroAutoExtends = 3;
export const kokoroTimeouts = {
  download: 180000,
  model_load: 180000,
  first_inference: 180000,
  warm_inference: 45000,
};
export type KokoroPhase = keyof typeof kokoroTimeouts;
export class KokoroTimeoutError extends Error {
  constructor(public phase: KokoroPhase) {
    super(
      "Bella needs more time on first use (up to 3 minutes). Keep waiting, or choose a device voice.",
    );
    this.name = "KokoroTimeoutError";
  }
}
type Options = {
  mode?: "warm" | "prime";
  onTimeout?: (extend: () => void) => void;
  onWaiting?: (message: string) => void;
};
const sessionKey = "still-bella-session";
let worker: Worker | null = null;
let modelWarmed = false;
let serial = 0;
const pending = new Map<
  number,
  {
    worker: Worker;
    mode?: Options["mode"];
    cancel: (error: Error) => void;
  }
>();
let warming: Promise<boolean> | null = null;
const previews = new Map<string, Blob>();
let previewEpoch = 0;
const preparing = new Map<string, Promise<boolean>>();
export function preparedKokoro(text: string) {
  return previews.get(text);
}
export function kokoroAudio(
  text: string | null,
  progress: (s: string) => void,
  signal: AbortSignal,
  onChunk?: (blob: Blob, backend: string) => void,
  options?: Options,
) {
  if (!worker) {
    worker = new Worker(new URL("./kokoro.worker.ts", import.meta.url), {
      type: "module",
    });
    modelWarmed = false;
  }
  const current = worker,
    id = ++serial;
  return new Promise<{ blob?: Blob; backend: string }>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>,
      phase: KokoroPhase = "model_load",
      phaseKey = "",
      deadline = Infinity,
      lastProgress = "",
      autoExtended = 0,
      manualExtended = false,
      waiting = false,
      settled = false;
    const cleanup = () => {
      settled = true;
      pending.delete(id);
      current.removeEventListener("message", message);
      current.removeEventListener("error", failure);
      signal.removeEventListener("abort", abort);
      clearTimeout(timer);
    };
    const fail = (error: Error) => {
      if (settled) return;
      cleanup();
      current.postMessage({ id, mode: "cancel" });
      reject(error);
    };
    const terminate = (error: Error) => {
      for (const request of [...pending.values()])
        if (request.worker === current) request.cancel(error);
      current.terminate();
      if (worker === current) {
        worker = null;
        modelWarmed = false;
      }
    };
    const abort = () => fail(new DOMException("Cancelled", "AbortError"));
    const failure = () =>
      terminate(
        new Error(
          "Bella’s worker could not load. Try Bella again, or choose a device voice.",
        ),
      );
    const expired = () => {
      if (settled) return;
      if (autoExtended < kokoroAutoExtends) {
        autoExtended++;
        waiting = false;
        deadline = Date.now() + kokoroTimeouts[phase];
        options?.onWaiting?.(
          autoExtended === 1
            ? "Bella is preparing on-device. This can take a few minutes the first time…"
            : `Still preparing Bella (${autoExtended + 1}/${kokoroAutoExtends + 1})…`,
        );
        arm();
        return;
      }
      if (options?.onTimeout && !manualExtended) {
        waiting = true;
        options.onTimeout(() => {
          if (settled || !waiting || manualExtended) return;
          waiting = false;
          manualExtended = true;
          deadline = Date.now() + kokoroTimeouts[phase];
          arm();
        });
        return;
      }
      fail(new KokoroTimeoutError(phase));
    };
    const arm = () => {
      clearTimeout(timer);
      if (!waiting && !settled)
        timer = setTimeout(
          expired,
          Math.max(0, Math.min(kokoroTimeouts[phase], deadline - Date.now())),
        );
    };
    const enter = (next: KokoroPhase, key: string) => {
      if (key !== phaseKey) {
        phase = next;
        phaseKey = key;
        // Heartbeats renew liveness, but cannot hide an endlessly running inference.
        deadline = key.startsWith("queued:")
          ? Date.now() + kokoroTimeouts.first_inference
          : /inference/.test(phase)
            ? Date.now() + kokoroTimeouts[phase]
            : Infinity;
      }
      arm();
    };
    const message = (event: MessageEvent) => {
      const data = event.data;
      if (data.id !== id || settled) return;
      if (data.modelWarmed === true) modelWarmed = true;
      if (data.type === "progress") {
        const next =
          data.phase === "inference"
            ? modelWarmed
              ? "warm_inference"
              : "first_inference"
            : data.phase in kokoroTimeouts
              ? (data.phase as KokoroPhase)
              : "model_load";
        const key = `${data.phase}:${data.step ?? ""}`;
        const update = `${key}:${data.message}:${data.loaded}`;
        if (data.heartbeat || update !== lastProgress) {
          lastProgress = update;
          enter(next, key);
        }
        if (!waiting) progress(data.message);
        return;
      }
      if (data.type === "chunk") {
        modelWarmed = true;
        // Worker sends an explicit phase/step before the next generate.
        // Don't charge time spent waiting in its serial queue as warm inference.
        enter("model_load", `between:${data.index ?? ""}`);
        try {
          onChunk?.(new Blob([data.wav], { type: "audio/wav" }), data.backend);
        } catch {
          fail(new Error("Bella audio could not be played."));
        }
        return;
      }
      if (data.type === "error") {
        const error = new Error(data.message || "Bella could not finish.");
        if (data.unrecoverable) terminate(error);
        else fail(error);
        return;
      }
      if (!["ready", "done", "audio", "primed"].includes(data.type)) return;
      modelWarmed = true;
      try {
        sessionStorage.setItem(sessionKey, "1");
      } catch {}
      cleanup();
      resolve({
        backend: data.backend,
        blob: data.wav
          ? new Blob([data.wav], { type: "audio/wav" })
          : undefined,
      });
    };
    pending.set(id, { worker: current, mode: options?.mode, cancel: fail });
    current.addEventListener("message", message);
    current.addEventListener("error", failure);
    signal.addEventListener("abort", abort, { once: true });
    arm();
    if (signal.aborted) {
      abort();
      return;
    }
    const preview = text && !options?.mode ? previews.get(text) : undefined;
    if (preview) {
      cleanup();
      resolve({ blob: preview, backend: "WASM" });
      return;
    }
    current.postMessage({
      id,
      text,
      prepare: text === null,
      mode: options?.mode,
      skipFirst: false,
    });
  });
}

export function bellaSessionPrepared() {
  try {
    return sessionStorage.getItem(sessionKey) === "1";
  } catch {
    return false;
  }
}

// No worker or download is started on an unprepared device.
export function warmKokoro() {
  if (modelWarmed && worker) return Promise.resolve(true);
  if (warming) return warming;
  const task = (async () => {
    if (!(await offlineModelStored())) return false;
    await kokoroAudio(null, () => {}, new AbortController().signal, undefined, {
      mode: "warm",
      onWaiting: () => {},
    });
    return true;
  })()
    .catch(() => false)
    .finally(() => {
      if (warming === task) warming = null;
    });
  warming = task;
  return task;
}
export function primeKokoro(text: string): Promise<boolean> {
  if (previews.has(text)) return Promise.resolve(true);
  const existing = preparing.get(text);
  if (existing) return existing;
  const task = prepare(text).finally(() => {
    if (preparing.get(text) === task) preparing.delete(text);
  });
  preparing.set(text, task);
  return task;
}
async function prepare(text: string) {
  const epoch = previewEpoch;
  if (!(await warmKokoro()) || epoch !== previewEpoch) return false;
  const result = await kokoroAudio(
    text,
    () => {},
    new AbortController().signal,
    undefined,
    { mode: "prime" },
  );
  if (result.blob && epoch === previewEpoch) {
    while (previews.size >= 4) previews.delete(previews.keys().next().value!);
    previews.set(text, result.blob);
  }
  return !!result.blob && epoch === previewEpoch;
}
export function clearKokoroPreviews() {
  previewEpoch++;
  previews.clear();
  preparing.clear();
  warming = null;
  for (const request of [...pending.values()])
    if (request.mode === "prime" || request.mode === "warm")
      request.cancel(new DOMException("Preparation cancelled", "AbortError"));
  if (worker) worker.postMessage({ id: ++serial, mode: "clear" });
}
