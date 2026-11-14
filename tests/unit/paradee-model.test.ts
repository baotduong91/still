import { afterEach, beforeEach, expect, it, vi } from "vitest";
const cache = vi.hoisted(() => ({
  match: vi.fn(),
  put: vi.fn(),
  has: vi.fn(),
}));
vi.mock("@/lib/tts/model-cache", () => ({ modelCache: cache }));
import {
  loadParadeeBytes,
  PARADEE_MODEL_URL,
  paradeeStored,
} from "@/lib/tts/paradee-model";
const network = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  cache.match.mockResolvedValue(undefined);
  cache.put.mockResolvedValue(undefined);
  vi.stubGlobal("fetch", network);
});
afterEach(() => vi.unstubAllGlobals());
it("checks readiness without copying the entire model into main-thread memory", async () => {
  cache.has.mockResolvedValue(true);
  expect(await paradeeStored()).toBe(true);
  expect(cache.has).toHaveBeenCalledWith(PARADEE_MODEL_URL);
  expect(cache.match).not.toHaveBeenCalled();
  expect(network).not.toHaveBeenCalled();
});
it("reloads cached bytes without a network request", async () => {
  cache.match.mockResolvedValue(new Response(new Uint8Array([1, 2, 3])));
  expect(new Uint8Array(await loadParadeeBytes(() => {}))).toEqual(
    new Uint8Array([1, 2, 3]),
  );
  expect(network).not.toHaveBeenCalled();
});
it("downloads only the pinned public asset, omits credentials, and persists bytes", async () => {
  network.mockResolvedValue(new Response(new ArrayBuffer(8_500_000)));
  expect((await loadParadeeBytes(() => {})).byteLength).toBe(8_500_000);
  expect(network).toHaveBeenCalledWith(PARADEE_MODEL_URL, {
    credentials: "omit",
    signal: expect.any(AbortSignal),
  });
  expect(cache.put).toHaveBeenCalledWith(
    PARADEE_MODEL_URL,
    expect.any(Response),
  );
});
it("rejects bad downloads without caching an error page", async () => {
  network.mockResolvedValue(new Response("<!doctype html>"));
  await expect(loadParadeeBytes(() => {})).rejects.toThrow(
    "Invalid Paradee model",
  );
  expect(cache.put).not.toHaveBeenCalled();
});
