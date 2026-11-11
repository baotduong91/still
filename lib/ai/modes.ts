export function modeConfiguration() {
  const hosted = process.env.VERCEL === "1";
  const base = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
  let loopback = true;
  try {
    loopback = ["localhost", "127.0.0.1", "[::1]"].includes(
      new URL(base).hostname,
    );
  } catch {}
  return {
    guided: { configured: true },
    ollama: {
      configured: !!process.env.OLLAMA_MODEL && !(hosted && loopback),
      hostedLoopback: hosted && loopback,
    },
    cloud: {
      configured: !!(process.env.AI_GATEWAY_API_KEY && process.env.CLOUD_MODEL),
    },
  };
}
