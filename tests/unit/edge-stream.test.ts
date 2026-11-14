import { afterEach, expect, it, vi } from "vitest";
import {
  preferEdgeBuffering,
  streamMp3,
} from "@/lib/tts/edge-stream";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("detaches a failed online stream before local fallback, even while play is pending", async () => {
  class Buffer extends EventTarget {
    appendBuffer() {
      queueMicrotask(() => this.dispatchEvent(new Event("updateend")));
    }
  }
  class Source extends EventTarget {
    readyState = "open";
    constructor() {
      super();
      queueMicrotask(() => this.dispatchEvent(new Event("sourceopen")));
    }
    addSourceBuffer() {
      return new Buffer();
    }
  }
  vi.stubGlobal("MediaSource", Source);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:stream");
  let reads = 0;
  const cancel = vi.fn(async () => {});
  const response = {
    body: {
      getReader: () => ({
        read: async () => {
          if (++reads > 1) throw new Error("Connection lost");
          return { done: false, value: new Uint8Array([1, 2]) };
        },
        cancel,
      }),
    },
  } as unknown as Response;
  const player = {
    src: "",
    play: vi.fn(() => new Promise<void>(() => {})),
    pause: vi.fn(),
    load: vi.fn(),
    removeAttribute: vi.fn(),
  };
  const playing = vi.fn();
  await expect(
    streamMp3(
      response,
      player as unknown as HTMLAudioElement,
      new AbortController().signal,
      {
        url: vi.fn(),
        playing,
        blocked: vi.fn(),
      },
    ),
  ).rejects.toThrow("Connection lost");
  expect(player.play).toHaveBeenCalledOnce();
  expect(player.pause).toHaveBeenCalledOnce();
  expect(player.removeAttribute).toHaveBeenCalledWith("src");
  expect(cancel).toHaveBeenCalledOnce();
  expect(playing).not.toHaveBeenCalled();
});

it("always prefers buffering for Scripture", () => {
  expect(preferEdgeBuffering("scripture")).toBe(true);
});
