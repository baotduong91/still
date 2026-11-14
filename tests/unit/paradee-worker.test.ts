import { afterEach, beforeEach, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({
  run: vi.fn(),
  load: vi.fn(),
  input: vi.fn(),
  env: { wasm: {} as Record<string, unknown> },
}));
vi.mock("onnxruntime-web/webgpu", () => ({
  env: fixture.env,
  InferenceSession: { create: fixture.load },
  Tensor: class {
    constructor(
      public type: string,
      public data: unknown,
      public dims: number[],
    ) {}
    dispose() {}
  },
}));
vi.mock("@/lib/tts/paradee-model", () => ({
  loadParadeeBytes: async () => new ArrayBuffer(8),
}));
vi.mock("@/lib/tts/paradee-phonemes", () => ({ paradeeInput: fixture.input }));
let scope: {
  location: { origin: string };
  navigator: { hardwareConcurrency: number };
  postMessage: ReturnType<typeof vi.fn>;
  onmessage: (e: { data: object }) => void;
};
const audio = () => ({
  waveform: { data: new Float32Array([0.1, -0.1, 0.2]), dispose: vi.fn() },
});
const messages = () => scope.postMessage.mock.calls.map(([m]) => m);
beforeEach(async () => {
  vi.resetModules();
  fixture.run.mockReset().mockImplementation(async () => audio());
  fixture.load.mockReset().mockResolvedValue({ run: fixture.run });
  fixture.input.mockReset().mockResolvedValue(new BigInt64Array([0n, 1n, 0n]));
  scope = {
    location: { origin: "https://still.example" },
    navigator: { hardwareConcurrency: 4 },
    postMessage: vi.fn(),
    onmessage: () => {},
  };
  vi.stubGlobal("self", scope);
  await import("@/lib/tts/paradee.worker");
});
afterEach(() => vi.unstubAllGlobals());
it("returns one full WAV, reuses lookahead and loads only one same-origin WASM session", async () => {
  const text =
    "Pause for a moment. Notice the small gifts in your day. Where can you practice kindness?";
  scope.onmessage({ data: { id: 1, text, mode: "prime" } });
  await vi.waitFor(() =>
    expect(messages().some((m) => m.type === "primed")).toBe(true),
  );
  expect(fixture.input).toHaveBeenCalledWith(text);
  scope.onmessage({ data: { id: 2, text } });
  await vi.waitFor(() =>
    expect(messages().some((m) => m.id === 2 && m.type === "audio")).toBe(true),
  );
  expect(fixture.run).toHaveBeenCalledOnce();
  expect(fixture.load).toHaveBeenCalledOnce();
  expect(fixture.env.wasm.wasmPaths).toBe("https://still.example/tts/");
  expect(fixture.env.wasm.numThreads).toBe(1);
  expect(
    messages()
      .filter((m) => m.type === "audio" || m.type === "primed")
      .every((m) => new DataView(m.wav).getUint32(24, true) === 24000),
  ).toBe(true);
});
it("discards cancelled inference, keeps the worker and serializes the next read", async () => {
  let release!: (v: ReturnType<typeof audio>) => void;
  fixture.run.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  scope.onmessage({ data: { id: 1, text: "Cancelled private reading." } });
  await vi.waitFor(() => expect(fixture.run).toHaveBeenCalledOnce());
  scope.onmessage({ data: { id: 1, mode: "cancel" } });
  scope.onmessage({ data: { id: 2, text: "The next reading." } });
  expect(fixture.run).toHaveBeenCalledOnce();
  release(audio());
  await vi.waitFor(() =>
    expect(messages().some((m) => m.id === 2 && m.type === "audio")).toBe(true),
  );
  expect(messages().some((m) => m.id === 1 && m.type === "audio")).toBe(false);
  expect(fixture.load).toHaveBeenCalledOnce();
});
it("splits oversized phoneme input without losing original words", async () => {
  const { SpeechInputTooLong } = await import("@/lib/tts/chunks");
  fixture.input.mockRejectedValueOnce(new SpeechInputTooLong());
  const text =
    "Every word must still be spoken, including the closing reference.";
  scope.onmessage({ data: { id: 1, text } });
  await vi.waitFor(() =>
    expect(messages().some((m) => m.type === "audio")).toBe(true),
  );
  expect(
    fixture.input.mock.calls
      .slice(1)
      .map(([part]) => part)
      .join(""),
  ).toBe(text);
  expect(fixture.run).toHaveBeenCalledTimes(2);
});
