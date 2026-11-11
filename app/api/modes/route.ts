import { modeConfiguration } from "@/lib/ai/modes";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const modes = modeConfiguration();
  let ollamaReachable: boolean | null = null;
  if (
    new URL(request.url).searchParams.get("check") === "ollama" &&
    modes.ollama.configured
  ) {
    try {
      const response = await fetch(
        new URL(
          "/api/tags",
          process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434",
        ),
        { signal: AbortSignal.timeout(3000), cache: "no-store" },
      );
      const data = await response.json();
      ollamaReachable =
        response.ok &&
        Array.isArray(data.models) &&
        data.models.some(
          (m: { name?: string; model?: string }) =>
            [m.name, m.model].includes(process.env.OLLAMA_MODEL) ||
            m.name === `${process.env.OLLAMA_MODEL}:latest`,
        );
    } catch {
      ollamaReachable = false;
    }
  }
  return Response.json(
    { modes, ollamaReachable },
    { headers: { "Cache-Control": "no-store" } },
  );
}
