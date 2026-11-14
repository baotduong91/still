export const localVoiceAutoExtends = 3;
export const localVoiceTimeouts = {
  download: 180000,
  model_load: 180000,
  first_inference: 180000,
  warm_inference: 45000,
};
export type LocalVoicePhase = keyof typeof localVoiceTimeouts;
export class LocalVoiceTimeoutError extends Error {
  constructor(
    public phase: LocalVoicePhase,
    name = "Paradee",
  ) {
    super(
      `${name} needs more time on first use. Keep waiting, or choose a device voice.`,
    );
    this.name = "LocalVoiceTimeoutError";
  }
}
type Options = {
  mode?: "warm" | "prime";
  onTimeout?: (extend: () => void) => void;
  onWaiting?: (message: string) => void;
};
export function createLocalVoiceClient(config: {
  name: string;
  sessionKey: string;
  createWorker: () => Worker;
  offlineStored: () => Promise<boolean>;
  preferGpu?: () => boolean;
}) {
  const { name, sessionKey } = config;
  let worker: Worker | null = null;
  let modelWarmed = false;
  let activeBackend = "WASM";
  const backend = () => activeBackend;
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
  function prepared(text: string) {
    return previews.get(text);
  }
  function audio(
    text: string | null,
    progress: (s: string) => void,
    signal: AbortSignal,
    onChunk?: (blob: Blob, backend: string) => void,
    options?: Options,
  ) {
    if (!worker) {
      worker = config.createWorker();
      modelWarmed = false;
    }
    const current = worker,
      id = ++serial;
    return new Promise<{ blob?: Blob; backend: string }>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout>,
        phase: LocalVoicePhase = "model_load",
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
            `${name}’s worker could not load. Try ${name} again, or choose a device voice.`,
          ),
        );
      const expired = () => {
        if (settled) return;
        if (autoExtended < localVoiceAutoExtends) {
          autoExtended++;
          waiting = false;
          deadline = Date.now() + localVoiceTimeouts[phase];
          options?.onWaiting?.(
            autoExtended === 1
              ? `${name} is preparing on-device. This can take a few minutes the first time…`
              : `Still preparing ${name} (${autoExtended + 1}/${localVoiceAutoExtends + 1})…`,
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
            deadline = Date.now() + localVoiceTimeouts[phase];
            arm();
          });
          return;
        }
        fail(new LocalVoiceTimeoutError(phase, name));
      };
      const arm = () => {
        clearTimeout(timer);
        if (!waiting && !settled)
          timer = setTimeout(
            expired,
            Math.max(0, Math.min(localVoiceTimeouts[phase], deadline - Date.now())),
          );
      };
      const enter = (next: LocalVoicePhase, key: string) => {
        if (key !== phaseKey) {
          phase = next;
          phaseKey = key;
          // Heartbeats renew liveness, but cannot hide an endlessly running inference.
          deadline = key.startsWith("queued:")
            ? Date.now() + localVoiceTimeouts.first_inference
            : /inference/.test(phase)
              ? Date.now() + localVoiceTimeouts[phase]
              : Infinity;
        }
        arm();
      };
      const message = (event: MessageEvent) => {
        const data = event.data;
        if (data.id !== id || settled) return;
        if (data.backend) activeBackend = data.backend;
        if (data.modelWarmed === true) modelWarmed = true;
        if (data.type === "progress") {
          const next =
            data.phase === "inference"
              ? modelWarmed
                ? "warm_inference"
                : "first_inference"
              : data.phase in localVoiceTimeouts
                ? (data.phase as LocalVoicePhase)
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
            onChunk?.(
              new Blob([data.wav], { type: "audio/wav" }),
              data.backend,
            );
          } catch {
            fail(new Error(`${name} audio could not be played.`));
          }
          return;
        }
        if (data.type === "error") {
          const error = new Error(data.message || `${name} could not finish.`);
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
        resolve({ blob: preview, backend: activeBackend });
        return;
      }
      current.postMessage({
        id,
        text,
        prepare: text === null,
        mode: options?.mode,
        skipFirst: false,
        preferGpu: config.preferGpu?.() ?? false,
      });
    });
  }

  function sessionPrepared() {
    try {
      return sessionStorage.getItem(sessionKey) === "1";
    } catch {
      return false;
    }
  }

  // No worker or download is started on an unprepared device.
  function warm() {
    if (modelWarmed && worker) return Promise.resolve(true);
    if (warming) return warming;
    const task = (async () => {
      if (!(await config.offlineStored())) return false;
      await audio(null, () => {}, new AbortController().signal, undefined, {
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
  function prime(text: string, allowDownload = false): Promise<boolean> {
    if (previews.has(text)) return Promise.resolve(true);
    const epoch = previewEpoch;
    const existing = preparing.get(text);
    if (existing)
      return allowDownload
        ? existing.then(
            (ready) =>
              ready || (epoch === previewEpoch ? prime(text, true) : false),
          )
        : existing;
    const task = prepare(text, allowDownload).finally(() => {
      if (preparing.get(text) === task) preparing.delete(text);
    });
    preparing.set(text, task);
    return task;
  }
  async function prepare(text: string, allowDownload: boolean) {
    const epoch = previewEpoch;
    // Compile using the actual next section: no throwaway Ready inference first.
    if (!modelWarmed && !(await config.offlineStored())) return false;
    if (epoch !== previewEpoch) return false;
    const result = await audio(
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
  function clear() {
    previewEpoch++;
    previews.clear();
    preparing.clear();
    warming = null;
    for (const request of [...pending.values()])
      if (request.mode === "prime" || request.mode === "warm")
        request.cancel(new DOMException("Preparation cancelled", "AbortError"));
    if (worker) worker.postMessage({ id: ++serial, mode: "clear" });
  }

  function reset() {
    clear();
    for (const request of [...pending.values()])
      request.cancel(new DOMException("Voice backend changed", "AbortError"));
    worker?.terminate();
    worker = null;
    modelWarmed = false;
  }

  return {
    audio: audio,
    prime: prime,
    prepared: prepared,
    warm: warm,
    clear: clear,
    reset: reset,
    backend: backend,
    sessionPrepared: sessionPrepared,
  };
}
