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
  const chunks = speechChunks(text);
  expect(chunks.join("")).toBe(text);
  expect(chunks[0].trim().split(/\s+/).length).toBeLessThanOrEqual(10);
  for (const chunk of chunks)
    expect(chunk.trim().split(/\s+/).length).toBeLessThanOrEqual(24);
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
it("terminates stuck inference after 30 seconds; repeated status cannot extend it", async () => {
  const { kokoroAudio } = await import("@/lib/tts/kokoro-client");
  const result = kokoroAudio(
    "Verse",
    () => {},
    new AbortController().signal,
  ).catch((e) => e as Error);
  const worker = TestWorker.all[0];
  const progress = {
    type: "progress",
    phase: "inference",
    message: "Preparing audio 1 of 2",
  };
  worker.send(progress);
  await vi.advanceTimersByTimeAsync(29000);
  worker.send(progress);
  await vi.advanceTimersByTimeAsync(1001);
  expect(((await result) as Error).message).toContain("took too long");
  expect(worker.terminated).toBe(true);
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
  expect(TestWorker.all).toHaveLength(2);
  TestWorker.all[1].send({ type: "ready", backend: "WASM" });
  await next;
});
