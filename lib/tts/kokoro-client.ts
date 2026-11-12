import { speechChunks } from "./chunks";
import { offlineModelStored } from "./model-cache";
let worker: Worker | null = null;
let serial = 0;
const pending = new Map<
  number,
  { worker: Worker; cancel: (error: Error) => void }
>();
let warming: Promise<boolean> | null = null;
const previews = new Map<string, Blob>();
let previewEpoch = 0;
export const kokoroTimeouts = {
  loading: 60000,
  download: 90000,
  inference: 30000,
};
export function kokoroAudio(
  text: string | null,
  progress: (s: string) => void,
  signal: AbortSignal,
  onChunk?: (blob: Blob, backend: string) => void,
  options?: { mode?: "warm" | "prime" | "clear" },
) {
  if (!worker)
    worker = new Worker(new URL("./kokoro.worker.ts", import.meta.url), {
      type: "module",
    });
  const current = worker,
    id = ++serial;
  return new Promise<{ blob?: Blob; backend: string }>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>,
      lastProgress = "";
    const cleanup = () => {
      pending.delete(id);
      current.removeEventListener("message", message);
      current.removeEventListener("error", failure);
      signal.removeEventListener("abort", abort);
      clearTimeout(timer);
    };
    const terminate = () => {
      for (const request of [...pending.values()])
        if (request.worker === current)
          request.cancel(new DOMException("Worker stopped", "AbortError"));
      current.terminate();
      if (worker === current) worker = null;
    };
    const fail = (error: Error) => {
      cleanup();
      terminate();
      reject(error);
    };
    const abort = () => fail(new DOMException("Cancelled", "AbortError"));
    const failure = () =>
      fail(
        new Error(
          "On-device voice could not load. Try the installed device voice.",
        ),
      );
    const arm = (ms: number) => {
      clearTimeout(timer);
      timer = setTimeout(
        () =>
          fail(
            new Error(
              "On-device voice took too long. Try the installed device voice for immediate reading.",
            ),
          ),
        ms,
      );
    };
    const message = (event: MessageEvent) => {
      const data = event.data;
      if (data.id !== id) return;
      if (data.type === "progress") {
        const key = `${data.phase}:${data.message}:${data.loaded}`;
        if (key !== lastProgress) {
          lastProgress = key;
          arm(
            kokoroTimeouts[data.phase as keyof typeof kokoroTimeouts] ??
              kokoroTimeouts.loading,
          );
        }
        progress(data.message);
        return;
      }
      if (data.type === "chunk") {
        arm(kokoroTimeouts.inference);
        try {
          onChunk?.(new Blob([data.wav], { type: "audio/wav" }), data.backend);
        } catch {
          failure();
        }
        return;
      }
      if (data.type === "error") {
        fail(new Error(data.message));
        return;
      }
      if (!["ready", "done", "audio", "primed"].includes(data.type)) return;
      cleanup();
      resolve({
        backend: data.backend,
        blob: data.wav
          ? new Blob([data.wav], { type: "audio/wav" })
          : undefined,
      });
    };
    pending.set(id, {
      worker: current,
      cancel: (error) => {
        cleanup();
        reject(error);
      },
    });
    current.addEventListener("message", message);
    current.addEventListener("error", failure);
    signal.addEventListener("abort", abort, { once: true });
    arm(kokoroTimeouts.loading);
    if (signal.aborted) {
      abort();
      return;
    }
    const preview =
      text && !options?.mode ? previews.get(speechChunks(text)[0]) : undefined;
    const skipFirst = !!preview && !!onChunk;
    if (skipFirst) onChunk!(preview!, "WASM");
    current.postMessage({
      id,
      text,
      prepare: text === null,
      mode: options?.mode,
      skipFirst,
    });
  });
}

// Warm cached public model assets only. Never start a model download on page load.
export function warmKokoro() {
  if (warming) return warming;
  warming = (async () => {
    if (!(await offlineModelStored())) return false;
    await kokoroAudio(null, () => {}, new AbortController().signal, undefined, {
      mode: "warm",
    });
    return true;
  })()
    .catch(() => false)
    .finally(() => {
      warming = null;
    });
  return warming;
}
export async function primeKokoro(text: string) {
  const epoch = previewEpoch;
  if (!(await warmKokoro())) return false;
  if (epoch !== previewEpoch) return false;
  const result = await kokoroAudio(
    text,
    () => {},
    new AbortController().signal,
    undefined,
    { mode: "prime" },
  );
  if (result.blob && epoch === previewEpoch) {
    while (previews.size >= 8) previews.delete(previews.keys().next().value!);
    previews.set(speechChunks(text)[0], result.blob);
  }
  return !!result.blob && epoch === previewEpoch;
}
export function clearKokoroPreviews() {
  previewEpoch++;
  previews.clear();
  if (worker) worker.postMessage({ id: ++serial, mode: "clear" });
}
