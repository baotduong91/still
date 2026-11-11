let worker: Worker | null = null;
let serial = 0;
export function kokoroAudio(
  text: string | null,
  progress: (s: string) => void,
  signal: AbortSignal,
) {
  if (!worker)
    worker = new Worker(new URL("./kokoro.worker.ts", import.meta.url), {
      type: "module",
    });
  const current = worker,
    id = ++serial;
  return new Promise<{ blob?: Blob; backend: string }>((resolve, reject) => {
    const cleanup = () => {
      current.removeEventListener("message", message);
      current.removeEventListener("error", failure);
      signal.removeEventListener("abort", abort);
      clearTimeout(timeout);
    };
    const abort = () => {
      cleanup();
      current.terminate();
      if (worker === current) worker = null;
      reject(new DOMException("Cancelled", "AbortError"));
    };
    const failure = () => {
      cleanup();
      current.terminate();
      if (worker === current) worker = null;
      reject(new Error("On-device voice could not load."));
    };
    const message = (e: MessageEvent) => {
      if (e.data.id !== id) return;
      if (e.data.type === "progress") {
        progress(e.data.message);
        return;
      }
      cleanup();
      if (e.data.type === "error") reject(new Error(e.data.message));
      else
        resolve({
          backend: e.data.backend,
          blob: e.data.wav
            ? new Blob([e.data.wav], { type: "audio/wav" })
            : undefined,
        });
    };
    const timeout = setTimeout(failure, 300000);
    current.addEventListener("message", message);
    current.addEventListener("error", failure);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      abort();
      return;
    }
    current.postMessage({
      id,
      text,
      prepare: text === null,
      allowWebGPU: !!(navigator as Navigator & { gpu?: unknown }).gpu,
    });
  });
}
