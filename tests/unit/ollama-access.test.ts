import { afterEach, expect, it, vi } from "vitest";
import { ollamaRequestOptions } from "@/lib/ai/providers/ollama-access";
afterEach(() => vi.unstubAllEnvs());
it("uses both Access headers over HTTPS and refuses authentication redirects", () => {
  vi.stubEnv("OLLAMA_BASE_URL", "https://ollama.example.com");
  vi.stubEnv("OLLAMA_ACCESS_CLIENT_ID", "test-id");
  vi.stubEnv("OLLAMA_ACCESS_CLIENT_SECRET", "test-secret");
  expect(ollamaRequestOptions()).toEqual({
    headers: {
      "CF-Access-Client-Id": "test-id",
      "CF-Access-Client-Secret": "test-secret",
    },
    redirect: "error",
  });
});
it("does not send partial credentials or credentials over HTTP", () => {
  vi.stubEnv("OLLAMA_ACCESS_CLIENT_ID", "test-id");
  vi.stubEnv("OLLAMA_ACCESS_CLIENT_SECRET", "");
  expect(() => ollamaRequestOptions()).toThrow("both");
  vi.stubEnv("OLLAMA_ACCESS_CLIENT_SECRET", "test-secret");
  vi.stubEnv("OLLAMA_BASE_URL", "http://localhost:11434");
  expect(() => ollamaRequestOptions()).toThrow("HTTPS");
});
it("keeps no-token local requests available", () => {
  vi.stubEnv("OLLAMA_ACCESS_CLIENT_ID", "");
  vi.stubEnv("OLLAMA_ACCESS_CLIENT_SECRET", "");
  expect(ollamaRequestOptions().headers).toEqual({});
});
