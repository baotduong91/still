import { beforeEach, afterEach, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({
  generate: vi.fn(),
  load: vi.fn(),
  env: { backends: { onnx: { wasm: {} as Record<string, unknown> } } },
}));
vi.mock("kokoro-js", () => ({ KokoroTTS: { from_pretrained: fixture.load } }));
vi.mock("@huggingface/transformers", () => ({ env: fixture.env }));
vi.mock("@/lib/tts/model-cache", () => ({
  modelCache: {},
  preloadBellaVoice: async () => {},
  optimizedModelStored: async () => true,
}));
let scope: {
  location: { origin: string };
  navigator: { hardwareConcurrency: number };
  crossOriginIsolated: boolean;
  postMessage: ReturnType<typeof vi.fn>;
  onmessage: (e: { data: object }) => void;
};
beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  fixture.generate
    .mockReset()
    .mockResolvedValue({ audio: new Float32Array(16) });
  fixture.load.mockReset().mockResolvedValue({ generate: fixture.generate });
  scope = {
    location: { origin: "https://still.example" },
    navigator: { hardwareConcurrency: 8 },
    crossOriginIsolated: false,
    postMessage: vi.fn(),
    onmessage: () => {},
  };
  vi.stubGlobal("self", scope);
  await import("@/lib/tts/kokoro.worker");
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const messages = () => scope.postMessage.mock.calls.map(([data]) => data);

it("warms once with Ready, emits five-second cold heartbeats, and reuses compilation after cancel", async () => {
  let release!: (value: { audio: Float32Array }) => void;
  fixture.generate.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  scope.onmessage({ data: { id: 1, prepare: true, mode: "warm" } });
  await vi.waitFor(() => expect(fixture.generate).toHaveBeenCalledOnce());
  expect(fixture.generate.mock.calls[0][0]).toBe("Ready.");
  await vi.advanceTimersByTimeAsync(45000);
  expect(
    messages().filter((m) => m.heartbeat && m.phase === "first_inference"),
  ).toHaveLength(9);
  scope.onmessage({ data: { id: 1, mode: "cancel" } });
  scope.onmessage({ data: { id: 2, prepare: true, mode: "warm" } });
  scope.onmessage({ data: { id: 2, prepare: true, mode: "warm" } });
  await vi.advanceTimersByTimeAsync(5000);
  expect(fixture.generate).toHaveBeenCalledOnce();
  release({ audio: new Float32Array(16) });
  await vi.waitFor(() =>
    expect(
      messages().filter((m) => m.id === 2 && m.type === "ready"),
    ).toHaveLength(1),
  );
  expect(fixture.generate).toHaveBeenCalledOnce();
  expect(messages().some((m) => m.id === 1 && m.type === "ready")).toBe(false);
  expect(fixture.env.backends.onnx.wasm.wasmPaths).toBe(
    "https://still.example/tts/",
  );
  expect(fixture.env.backends.onnx.wasm.numThreads).toBe(1);
});

it("serializes reads, discards cancelled audio, and switches later generation to warm budgets", async () => {
  let release!: (value: { audio: Float32Array }) => void;
  fixture.generate.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  scope.onmessage({ data: { id: 1, text: "A cancelled reading." } });
  await vi.waitFor(() => expect(fixture.generate).toHaveBeenCalledOnce());
  scope.onmessage({ data: { id: 1, mode: "cancel" } });
  scope.onmessage({ data: { id: 2, text: "A different reading." } });
  await vi.advanceTimersByTimeAsync(5000);
  expect(fixture.generate).toHaveBeenCalledOnce();
  release({ audio: new Float32Array(16) });
  await vi.waitFor(() =>
    expect(messages().some((m) => m.id === 2 && m.type === "done")).toBe(true),
  );
  expect(messages().some((m) => m.id === 1 && m.type === "chunk")).toBe(false);
  expect(
    messages().some((m) => m.id === 2 && m.phase === "warm_inference"),
  ).toBe(true);
  expect(fixture.generate).toHaveBeenCalledTimes(2);
});

it("clear cancels an in-flight prime before its result can repopulate previews", async () => {
  let release!: (value: { audio: Float32Array }) => void;
  fixture.generate.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  scope.onmessage({
    data: { id: 1, text: "Private plan copy.", mode: "prime" },
  });
  await vi.waitFor(() => expect(fixture.generate).toHaveBeenCalledOnce());
  scope.onmessage({ data: { id: 3, mode: "clear" } });
  release({ audio: new Float32Array(16) });
  scope.onmessage({ data: { id: 2, text: "Private plan copy." } });
  await vi.waitFor(() =>
    expect(messages().some((m) => m.id === 2 && m.type === "done")).toBe(true),
  );
  expect(messages().some((m) => m.id === 1 && m.type === "primed")).toBe(false);
  expect(fixture.generate).toHaveBeenCalledTimes(2);
});

it("primes every segment and reuses the complete reading without more inference", async () => {
  const text = Array.from({ length: 110 }, (_, i) => `word${i}`).join(" ");
  scope.onmessage({ data: { id: 1, text, mode: "prime" } });
  await vi.waitFor(() =>
    expect(messages().some((m) => m.type === "primed")).toBe(true),
  );
  const calls = fixture.generate.mock.calls.length;
  expect(calls).toBeGreaterThan(1);
  expect(fixture.generate.mock.calls.map((c) => c[0]).join("")).toBe(text);
  scope.onmessage({ data: { id: 2, text } });
  await vi.waitFor(() =>
    expect(messages().some((m) => m.id === 2 && m.type === "audio")).toBe(true),
  );
  expect(fixture.generate).toHaveBeenCalledTimes(calls);
  expect(
    messages().find((m) => m.id === 2 && m.type === "audio").wav.byteLength,
  ).toBe(44 + calls * 16 * 2);
});

it("cold lookahead synthesizes a short full section in one useful inference", async () => {
  const text = Array.from({ length: 45 }, (_, i) => `word${i}`).join(" ");
  scope.onmessage({ data: { id: 1, text, mode: "prime" } });
  await vi.waitFor(() =>
    expect(messages().some((m) => m.type === "primed")).toBe(true),
  );
  expect(fixture.generate).toHaveBeenCalledExactlyOnceWith(text, {
    voice: "af_bella",
    speed: 1,
  });
  expect(messages().some((m) => m.phase === "first_inference")).toBe(true);
});

it("selects desktop WebGPU fp32 and falls back to q8 when GPU loading fails", async () => {
  Object.assign(scope.navigator, {
    gpu: { requestAdapter: async () => ({}) },
    userAgent: "Desktop Chrome",
  });
  fixture.load.mockRejectedValueOnce(new Error("Unsupported GPU"));
  scope.onmessage({
    data: { id: 1, text: "A real reflection.", mode: "prime", preferGpu: true },
  });
  await vi.waitFor(() =>
    expect(messages().some((m) => m.type === "primed")).toBe(true),
  );
  expect(fixture.load.mock.calls[0][1]).toMatchObject({
    device: "webgpu",
    dtype: "fp32",
  });
  expect(fixture.load.mock.calls[1][1]).toMatchObject({
    device: "wasm",
    dtype: "q8",
  });
  expect(messages().find((m) => m.type === "primed").backend).toBe("WASM");
});
it("uses two WASM threads only with cross-origin isolation", async () => {
  vi.resetModules();
  scope.crossOriginIsolated = true;
  vi.stubGlobal("SharedArrayBuffer", class {});
  await import("@/lib/tts/kokoro.worker");
  expect(fixture.env.backends.onnx.wasm.numThreads).toBe(2);
});
it("uses desktop WebGPU for Bella synthesis when the adapter and model succeed", async () => {
  Object.assign(scope.navigator, {
    gpu: { requestAdapter: async () => ({}) },
    userAgent: "Desktop Chrome",
  });
  scope.onmessage({
    data: {
      id: 1,
      text: "Ready for quiet reflection.",
      mode: "prime",
      preferGpu: true,
    },
  });
  await vi.waitFor(() =>
    expect(messages().some((m) => m.type === "primed")).toBe(true),
  );
  expect(fixture.load.mock.calls[0][1]).toMatchObject({
    device: "webgpu",
    dtype: "fp32",
  });
  expect(messages().find((m) => m.type === "primed").backend).toBe("WebGPU");
});

it("recovers a GPU inference failure with Bella WASM without changing voice", async () => {
  Object.assign(scope.navigator, {
    gpu: { requestAdapter: async () => ({}) },
    userAgent: "Desktop Chrome",
  });
  fixture.generate.mockRejectedValueOnce(new Error("GPU inference failed"));
  scope.onmessage({
    data: {
      id: 1,
      text: "Private reflection.",
      mode: "prime",
      preferGpu: true,
    },
  });
  await vi.waitFor(() =>
    expect(messages().some((m) => m.type === "primed")).toBe(true),
  );
  expect(fixture.load.mock.calls[1][1]).toMatchObject({
    device: "wasm",
    dtype: "q8",
  });
  expect(messages().find((m) => m.type === "primed").backend).toBe("WASM");
  expect(
    fixture.generate.mock.calls.every((call) => call[1].voice === "af_bella"),
  ).toBe(true);
});
