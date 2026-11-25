import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { loopPcm } from "@/lib/audio/loop-pcm";
const sources: {
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  loop: boolean;
}[] = [];
let ctx: { currentTime: number };
const ramp = vi.fn();
beforeEach(() => {
  vi.resetModules();
  sources.length = 0;
  ramp.mockClear();
  vi.stubGlobal(
    "AudioContext",
    class {
      currentTime = 0;
      state = "running";
      destination = {};
      constructor() {
        ctx = this;
      }
      createGain() {
        return {
          connect() {},
          gain: {
            value: 0,
            cancelScheduledValues() {},
            setValueAtTime() {},
            linearRampToValueAtTime: ramp,
          },
        };
      }
      createBufferSource() {
        const source = {
          start: vi.fn(),
          stop: vi.fn(),
          disconnect: vi.fn(),
          connect() {},
          loop: false,
        };
        sources.push(source);
        return source;
      }
      async decodeAudioData() {
        return {
          numberOfChannels: 1,
          sampleRate: 100,
          getChannelData: () => new Float32Array(3200),
        };
      }
      createBuffer(_channels: number, length: number, rate: number) {
        return {
          duration: length / rate,
          getChannelData: () => new Float32Array(length),
        };
      }
    },
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(new ArrayBuffer(8))),
  );
});
afterEach(() => vi.unstubAllGlobals());
it("crossfades a circular boundary without nonfinite PCM or a discontinuous wrap", () => {
  const input = Float32Array.from({ length: 3200 }, (_, i) => Math.sin(i / 20));
  const output = loopPcm(input, 100);
  expect(output.length).toBe(3165);
  expect(output.every(Number.isFinite)).toBe(true);
  expect(Math.abs(output.at(-1)! - output[0])).toBeLessThan(0.06);
});
it("loads once, loops one decoded source, and resumes at its paused offset", async () => {
  const player = await import("@/lib/audio/ambient-player");
  await Promise.all([
    player.startAmbientLoop(0.2),
    player.startAmbientLoop(0.2),
  ]);
  expect(fetch).toHaveBeenCalledOnce();
  expect(sources).toHaveLength(1);
  expect(sources[0].loop).toBe(true);
  ctx.currentTime = 5;
  player.stopAmbientLoop();
  await player.startAmbientLoop(0.2);
  expect(sources[1].start).toHaveBeenCalledWith(0, 5);
  expect(sources[0].disconnect).toHaveBeenCalledOnce();
  player.stopAmbientLoop();
});
it("never starts late music when stopped while the file is downloading", async () => {
  let release!: (response: Response) => void;
  vi.mocked(fetch).mockImplementation(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const player = await import("@/lib/audio/ambient-player");
  const pending = player.startAmbientLoop(0.2);
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  player.stopAmbientLoop();
  release(new Response(new ArrayBuffer(8)));
  await pending;
  expect(sources).toHaveLength(0);
  await player.startAmbientLoop(0.2);
  expect(sources).toHaveLength(1);
  player.stopAmbientLoop();
});

it("fades in at the latest mix level when narration starts during decoding", async () => {
  let release!: (response: Response) => void;
  vi.mocked(fetch).mockImplementation(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const player = await import("@/lib/audio/ambient-player");
  const music = player.startAmbientLoop(0.42);
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  const narration = player.startAmbientLoop(0.18);
  release(new Response(new ArrayBuffer(8)));
  await Promise.all([music, narration]);
  expect(sources).toHaveLength(1);
  expect(ramp).toHaveBeenCalledExactlyOnceWith(0.18, 0.25);
  player.stopAmbientLoop();
});
