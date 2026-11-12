import { ollamaRequestOptions } from "@/lib/ai/providers/ollama-access";
import { modeConfiguration } from "@/lib/ai/modes";
import { checkGroq } from "@/lib/ai/providers/groq";
import { validateBrowserOrigin } from "@/lib/awp/auth";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const modes = modeConfiguration();
  try {
    validateBrowserOrigin(request);
  } catch {
    return Response.json(
      { error: "Use the configured Still address." },
      { status: 403 },
    );
  }
  const groqStatus =
    new URL(request.url).searchParams.get("check") === "groq" &&
    modes.cloud.vendor === "groq" &&
    modes.cloud.configured
      ? await checkGroq()
      : null;
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
        {
          ...ollamaRequestOptions(),
          signal: AbortSignal.timeout(3000),
          cache: "no-store",
        },
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
    { modes, ollamaReachable, groqStatus },
    { headers: { "Cache-Control": "no-store" } },
  );
}
