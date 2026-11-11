// Server-side only: never expose Access credentials in browser preferences.
export function ollamaRequestOptions() {
  const id = process.env.OLLAMA_ACCESS_CLIENT_ID;
  const secret = process.env.OLLAMA_ACCESS_CLIENT_SECRET;
  const headers: Record<string, string> = {};
  if (id || secret) {
    if (!id || !secret)
      throw new Error("Configure both Ollama Access credentials.");
    const url = new URL(
      process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434",
    );
    if (url.protocol !== "https:")
      throw new Error("Ollama Access requires HTTPS.");
    headers["CF-Access-Client-Id"] = id;
    headers["CF-Access-Client-Secret"] = secret;
  }
  // Access redirects are authentication failures, never model responses.
  return { headers, redirect: "error" as const };
}
