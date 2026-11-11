import { it, expect, vi, afterEach } from "vitest";
import { z } from "zod";
import { ollamaProvider } from "@/lib/ai/providers/ollama";
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
it("uses non-thinking structured output only when the local model advertises thinking", async () => {
  vi.stubEnv("OLLAMA_MODEL", "thinking-fixture");
  vi.stubEnv("OLLAMA_BASE_URL", "http://127.0.0.1:11434");
  const f = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ capabilities: ["completion", "thinking"] }),
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          message: {
            content: JSON.stringify({ references: ["Romans 8:18-25"] }),
          },
        }),
      ),
    );
  const result = await ollamaProvider.generate(
    z.object({ references: z.array(z.string()) }),
    "Select canonical references",
    "Why is there suffering?",
  );
  expect(result.references).toEqual(["Romans 8:18-25"]);
  expect(JSON.parse(String(f.mock.calls[1][1]?.body)).think).toBe(false);
  expect(
    f.mock.calls.every(
      (call) => new URL(String(call[0])).hostname === "127.0.0.1",
    ),
  ).toBe(true);
});
