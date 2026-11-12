import { afterEach, expect, it, vi } from "vitest";
import { ChunkScheduler } from "@/lib/tts/chunk-playback";
afterEach(() => vi.unstubAllGlobals());
it("buffers slow chunks until finished and schedules them without inference gaps", async () => {
  const starts: number[] = [];
  const sources: { onended: () => void }[] = [];
  class Context {
    currentTime = 10;
    state = "running";
    destination = {};
    async suspend() {
      this.state = "suspended";
    }
    async resume() {
      this.state = "running";
      for (const source of sources) source.onended();
    }
    async close() {}
    async decodeAudioData() {
      return { duration: 2 };
    }
    createBufferSource() {
      const source = {
        buffer: null,
        playbackRate: { value: 1 },
        connect() {},
        disconnect() {},
        onended() {},
        start(at: number) {
          starts.push(at);
        },
      };
      sources.push(source);
      return source;
    }
  }
  vi.stubGlobal("AudioContext", Context);
  const player = new ChunkScheduler(1, true);
  const sound = vi.fn();
  await player.append(new Blob(["first"]), sound);
  await player.append(new Blob(["second"]), sound);
  expect(starts).toEqual([]);
  expect(sound).not.toHaveBeenCalled();
  await player.drain();
  expect(starts).toEqual([10.01, 12.01]);
  expect(sound).toHaveBeenCalledOnce();
});
it("stop discards buffered audio before playback", async () => {
  const context = vi.fn();
  vi.stubGlobal("AudioContext", context);
  const player = new ChunkScheduler(1, true);
  await player.append(new Blob(["cancelled"]));
  player.stop();
  await player.drain();
  expect(context).not.toHaveBeenCalled();
});
