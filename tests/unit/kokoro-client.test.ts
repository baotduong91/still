import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { speechChunks, wavBytes } from "@/lib/tts/chunks";
const model = vi.hoisted(() => ({ cached: true }));
vi.mock("@/lib/tts/model-cache", () => ({
  offlineModelStored: async () => model.cached,
}));
class TestWorker extends EventTarget {
  static all: TestWorker[] = [];
  terminated = false;
  id = 0;
  last: { id: number; mode?: string; skipFirst?: boolean } = { id: 0 };
  constructor() {
    super();
    TestWorker.all.push(this);
  }
  postMessage(data: { id: number; mode?: string; skipFirst?: boolean }) {
    this.id = data.id;
    this.last = data;
  }
  terminate() {
    this.terminated = true;
  }
  send(data: object) {
    this.dispatchEvent(
      new MessageEvent("message", { data: { id: this.id, ...data } }),
    );
  }
}
beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  TestWorker.all = [];
  model.cached = true;
  vi.stubGlobal("Worker", TestWorker);
});
it("does not create a worker or download a model when Today warms an unprepared device", async () => {
  model.cached = false;
  const { warmKokoro, primeKokoro } = await import("@/lib/tts/kokoro-client");
  expect(await warmKokoro()).toBe(false);
  expect(await primeKokoro("An app-owned reflection.")).toBe(false);
  expect(TestWorker.all).toHaveLength(0);
});
it("prepares a local first segment ahead of Play and delivers it synchronously without duplication", async () => {
  const { primeKokoro, kokoroAudio, clearKokoroPreviews } =
    await import("@/lib/tts/kokoro-client");
  const primed = primeKokoro("Exact verse text.");
  await vi.waitFor(() => expect(TestWorker.all).toHaveLength(1));
  const worker = TestWorker.all[0];
  expect(worker.last.mode).toBe("warm");
  worker.send({ type: "ready", backend: "WASM" });
  await vi.waitFor(() => expect(worker.last.mode).toBe("prime"));
  worker.send({
    type: "primed",
    backend: "WASM",
    wav: wavBytes(new Float32Array([0.1, -0.1])),
  });
  expect(await primed).toBe(true);
  const chunks: Blob[] = [];
  const playing = kokoroAudio(
    "Exact verse text.",
    () => {},
    new AbortController().signal,
    (b) => chunks.push(b),
  );
  expect(chunks).toHaveLength(1);
  expect(worker.last.skipFirst).toBe(true);
  worker.send({ type: "done", backend: "WASM" });
  await playing;
  clearKokoroPreviews();
  const controller = new AbortController();
  const next = kokoroAudio(
    "Exact verse text.",
    () => {},
    controller.signal,
    (b) => chunks.push(b),
  ).catch((e) => e);
  expect(worker.last.skipFirst).toBe(false);
  controller.abort();
  await next;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("splits for early playback without losing Scripture words, punctuation or whitespace", () => {
  const text =
    "  Therefore don’t be anxious for tomorrow, for tomorrow will be anxious for itself. Each day’s own evil is sufficient.\n\nMatthew 6:34";
  const cold = speechChunks(text);
  expect(cold.join("")).toBe(text);
  expect(cold[0].trim().split(/\s+/).length).toBeLessThanOrEqual(22);
  const warm = speechChunks(text, { warmed: true });
  expect(warm.join("")).toBe(text);
  expect(warm).toHaveLength(1);
});
it("delivers the first WAV chunk before synthesis completes", async () => {
  const { kokoroAudio } = await import("@/lib/tts/kokoro-client");
  const chunks: Blob[] = [];
  let complete = false;
  const pending = kokoroAudio(
    "Exact verse.",
    () => {},
    new AbortController().signal,
    (blob) => chunks.push(blob),
  );
  void pending.then(() => {
    complete = true;
  });
  const worker = TestWorker.all[0];
  worker.send({
    type: "chunk",
    backend: "WASM",
    wav: wavBytes(new Float32Array([0.1, -0.1])),
  });
  expect(chunks).toHaveLength(1);
  expect(chunks[0].type).toBe("audio/wav");
  expect(complete).toBe(false);
  worker.send({ type: "done", backend: "WASM" });
  expect((await pending).backend).toBe("WASM");
});
it("auto-extends cold inference before failing the job", async () => {
  const { kokoroAudio, KokoroTimeoutError, kokoroAutoExtends } =
    await import("@/lib/tts/kokoro-client");
  const waiting = vi.fn();
  const result = kokoroAudio(
    "Verse",
    () => {},
    new AbortController().signal,
    undefined,
    { onWaiting: waiting },
  ).catch((e) => e as Error);
  const worker = TestWorker.all[0];
  const progress = {
    type: "progress",
    phase: "first_inference",
    message: "Preparing audio 1 of 2",
  };
  worker.send(progress);
  for (let i = 0; i < kokoroAutoExtends; i++) {
    await vi.advanceTimersByTimeAsync(180000);
    expect(worker.last.mode).not.toBe("cancel");
    expect(waiting).toHaveBeenCalled();
    worker.send(progress);
  }
  await vi.advanceTimersByTimeAsync(180001);
  expect(await result).toBeInstanceOf(KokoroTimeoutError);
  expect(worker.last.mode).toBe("cancel");
  expect(worker.terminated).toBe(false);
});
it("keeps a progressing download alive and cancels cleanly", async () => {
  const { kokoroAudio } = await import("@/lib/tts/kokoro-client");
  const controller = new AbortController(),
    chunks: Blob[] = [];
  const result = kokoroAudio(
    "Verse",
    () => {},
    controller.signal,
    (b) => chunks.push(b),
  ).catch((e) => e as Error);
  const worker = TestWorker.all[0];
  for (let i = 1; i <= 4; i++) {
    worker.send({
      type: "progress",
      phase: "download",
      message: "Downloading model",
      loaded: i,
    });
    await vi.advanceTimersByTimeAsync(50000);
    expect(worker.terminated).toBe(false);
  }
  controller.abort();
  expect(((await result) as Error).name).toBe("AbortError");
  worker.send({ type: "chunk", wav: new ArrayBuffer(44), backend: "WASM" });
  expect(chunks).toHaveLength(0);
  const next = kokoroAudio(null, () => {}, new AbortController().signal);
  expect(TestWorker.all).toHaveLength(1);
  TestWorker.all[0].send({ type: "ready", backend: "WASM" });
  await next;
});

it("renews the model-load watchdog on identical heartbeat messages", async () => {
  const { kokoroAudio } = await import("@/lib/tts/kokoro-client");
  const controller = new AbortController();
  const request = kokoroAudio(null, () => {}, controller.signal).catch(
    (e) => e,
  );
  const worker = TestWorker.all[0];
  const heartbeat = {
    type: "progress",
    phase: "model_load",
    message: "Still preparing Bella…",
    heartbeat: true,
  };
  for (let n = 0; n < 3; n++) {
    await vi.advanceTimersByTimeAsync(110000);
    worker.send(heartbeat);
    expect(worker.last.mode).not.toBe("cancel");
  }
  worker.send({ type: "ready", backend: "WASM" });
  expect((await request).backend).toBe("WASM");
});

it("uses 45 seconds for the second, warm inference chunk", async () => {
  const { kokoroAudio, KokoroTimeoutError } =
    await import("@/lib/tts/kokoro-client");
  const result = kokoroAudio(
    "Two chunks.",
    () => {},
    new AbortController().signal,
    () => {},
  ).catch((e) => e);
  const worker = TestWorker.all[0];
  worker.send({
    type: "progress",
    phase: "first_inference",
    step: 1,
    message: "Preparing",
  });
  await vi.advanceTimersByTimeAsync(45000);
  worker.send({
    type: "chunk",
    index: 0,
    wav: new ArrayBuffer(44),
    backend: "WASM",
  });
  worker.send({
    type: "progress",
    phase: "warm_inference",
    step: 2,
    message: "Preparing",
  });
  await vi.advanceTimersByTimeAsync(44999);
  expect(worker.last.mode).not.toBe("cancel");
  worker.send({ type: "done", backend: "WASM" });
  expect((await result).backend).toBe("WASM");
  expect(worker.terminated).toBe(false);
});

it("offers a manual extension after automatic ones on the same slow job", async () => {
  const { kokoroAudio, kokoroAutoExtends } =
    await import("@/lib/tts/kokoro-client");
  let extend: (() => void) | undefined;
  const onTimeout = vi.fn((resume: () => void) => {
    extend = resume;
  });
  const result = kokoroAudio(
    "Slow first reading",
    () => {},
    new AbortController().signal,
    undefined,
    { onTimeout },
  ).catch((e) => e);
  const worker = TestWorker.all[0];
  worker.send({
    type: "progress",
    phase: "first_inference",
    step: 1,
    message: "Preparing",
  });
  for (let i = 0; i <= kokoroAutoExtends; i++)
    await vi.advanceTimersByTimeAsync(180000);
  expect(onTimeout).toHaveBeenCalledOnce();
  expect(worker.last.mode).not.toBe("cancel");
  extend!();
  await vi.advanceTimersByTimeAsync(179999);
  expect(worker.last.mode).not.toBe("cancel");
  await vi.advanceTimersByTimeAsync(1);
  expect((await result).name).toBe("KokoroTimeoutError");
  expect(worker.terminated).toBe(false);
});

it("clear cancels preparation without stopping an unrelated active read or losing the worker", async () => {
  const { kokoroAudio, clearKokoroPreviews } =
    await import("@/lib/tts/kokoro-client");
  const prep = kokoroAudio(
    null,
    () => {},
    new AbortController().signal,
    undefined,
    { mode: "warm" },
  ).catch((e) => e);
  const request = kokoroAudio(
    "A reading",
    () => {},
    new AbortController().signal,
  );
  const worker = TestWorker.all[0],
    readId = worker.id;
  clearKokoroPreviews();
  expect((await prep).name).toBe("AbortError");
  expect(worker.terminated).toBe(false);
  worker.send({
    id: readId,
    type: "audio",
    backend: "WASM",
    wav: new ArrayBuffer(44),
  });
  expect((await request).blob).toBeInstanceOf(Blob);
});
