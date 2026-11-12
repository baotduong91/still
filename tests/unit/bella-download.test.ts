import { afterEach, expect, it, vi } from "vitest";
import { preloadBellaVoice } from "@/lib/tts/model-cache";
afterEach(() => vi.unstubAllGlobals());
it("prefetches only the Bella asset into the cache used by kokoro-js", async () => {
  const put = vi.fn();
  vi.stubGlobal("caches", {
    open: vi.fn().mockResolvedValue({ match: async () => undefined, put }),
  });
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response(new Uint8Array([1, 2, 3, 4])));
  vi.stubGlobal("fetch", fetcher);
  await preloadBellaVoice();
  expect(caches.open).toHaveBeenCalledWith("kokoro-voices");
  expect(fetcher.mock.calls[0][0]).toMatch(/\/voices\/af_bella.bin$/);
  expect(fetcher.mock.calls[0][1].body).toBeUndefined();
  expect(put).toHaveBeenCalledOnce();
});
it("skips stored voice assets and does not cache failed downloads", async () => {
  const put = vi.fn();
  const match = vi
    .fn()
    .mockResolvedValueOnce(new Response("saved"))
    .mockResolvedValue(undefined);
  vi.stubGlobal("caches", { open: async () => ({ match, put }) });
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response("Unavailable", { status: 503 }));
  vi.stubGlobal("fetch", fetcher);
  await preloadBellaVoice();
  expect(fetcher).not.toHaveBeenCalled();
  await expect(preloadBellaVoice()).rejects.toThrow(
    "Bella voice download failed",
  );
  expect(put).not.toHaveBeenCalled();
});
