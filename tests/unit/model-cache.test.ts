import { beforeEach, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), close: vi.fn() }));
vi.mock("idb", () => ({ openDB: async () => db }));
import { modelCache } from "@/lib/tts/model-cache";
beforeEach(() => vi.clearAllMocks());
it("stores model bytes without WebKit Blob serialization and reads them unchanged", async () => {
  const bytes = new Uint8Array([1, 3, 5, 7]);
  await modelCache.put("model", new Response(bytes));
  const stored = db.put.mock.calls[0][1];
  expect(stored).toBeInstanceOf(ArrayBuffer);
  db.get.mockResolvedValue(stored);
  const response = await modelCache.match("model");
  expect(new Uint8Array(await response!.arrayBuffer())).toEqual(bytes);
  expect(response!.headers.get("Content-Length")).toBe("4");
});
it("continues reading previously downloaded Blob models", async () => {
  db.get.mockResolvedValue(new Blob(["existing model"]));
  expect(await (await modelCache.match("old"))!.text()).toBe("existing model");
  expect(db.close).toHaveBeenCalledOnce();
});
