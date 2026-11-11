import { afterEach, describe, it, expect, vi } from "vitest";
import { modeConfiguration } from "@/lib/ai/modes";
import { selectedProvider } from "@/lib/client/modes";
import { getProvider } from "@/lib/ai/providers";
import { buildGuidedPlan } from "@/lib/ai/guided";
import { getBible } from "@/lib/bible/server";
import { GET } from "@/app/api/modes/route";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
describe("Explicit answer-mode routing", () => {
  it("requires cloud consent even for a restored cloud selection", () => {
    expect(() =>
      selectedProvider({ provider: "cloud", cloudConsent: false }),
    ).toThrow(/Settings/);
    expect(selectedProvider({ provider: "cloud", cloudConsent: true })).toBe(
      "cloud",
    );
    expect(selectedProvider({ provider: "curated", cloudConsent: false })).toBe(
      "curated",
    );
    expect(selectedProvider({ provider: "ollama", cloudConsent: false })).toBe(
      "ollama",
    );
  });
  it("does not treat a hosted localhost as the user's Mac", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("OLLAMA_MODEL", "fixture-model");
    vi.stubEnv("OLLAMA_BASE_URL", "http://127.0.0.1:11434");
    expect(modeConfiguration().ollama.configured).toBe(false);
  });
  it("allows local Ollama configuration without any cloud keys", async () => {
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("OLLAMA_MODEL", "fixture-model");
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    expect((await getProvider("ollama")).name).toBe("ollama");
  });
  it("fails closed before a model request when cloud is not configured", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    vi.stubEnv("CLOUD_MODEL", "");
    const f = vi.spyOn(globalThis, "fetch");
    await expect(getProvider("cloud")).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
    });
    expect(f).not.toHaveBeenCalled();
  });
  it("reports configuration without exposing credentials or contacting a provider", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "private-test-key");
    vi.stubEnv("CLOUD_MODEL", "private-model-id");
    const f = vi.spyOn(globalThis, "fetch");
    const r = await GET(new Request("http://localhost/api/modes"));
    const text = await r.text();
    expect(text).not.toContain("private-test-key");
    expect(text).not.toContain("private-model-id");
    expect(f).not.toHaveBeenCalled();
  });
  it("checks installed Ollama model only on explicit request", async () => {
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("OLLAMA_MODEL", "fixture-model");
    vi.stubEnv("OLLAMA_BASE_URL", "http://127.0.0.1:11434");
    const f = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({ models: [{ name: "fixture-model:latest" }] }),
        ),
      );
    const r = await GET(new Request("http://localhost/api/modes?check=ollama"));
    expect((await r.json()).ollamaReachable).toBe(true);
    expect(f).toHaveBeenCalledOnce();
    expect(String(f.mock.calls[0][0])).toBe("http://127.0.0.1:11434/api/tags");
  });
  it("builds reference-driven guided days entirely from local WEB", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const bible = await getBible("WEB");
    const f = vi.spyOn(globalThis, "fetch");
    const p = buildGuidedPlan({ prompt: "Study John 3:16", days: 7 }, bible);
    expect(p.provider).toBe("curated");
    expect(p.days[0].passage.reference).toBe("John 3:16");
    expect(p.days[1].passage.reference).toBe("John 3");
    expect(p.days.every((d) => bible.validate(d.passage))).toBe(true);
    expect(f).not.toHaveBeenCalled();
  });
});
