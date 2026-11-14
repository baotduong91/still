import { modelCache } from "./model-cache";
// Pin v1.1: newer releases have different voices and tensor contracts.
export const PARADEE_MODEL_URL =
  "https://huggingface.co/sahilmahendrakar/Paradee-8M-v1.1/resolve/330617ad1f097b4f6b02c103e54b39006c090b45/onnx/paradee_int8.onnx";
export async function paradeeStored() {
  return modelCache.has(PARADEE_MODEL_URL);
}
export async function loadParadeeBytes(progress: (message: string) => void) {
  const cached = await modelCache
    .match(PARADEE_MODEL_URL)
    .catch(() => undefined);
  if (cached) return cached.arrayBuffer();
  progress("Downloading Paradee 1.1 · about 8.5 MB, plus the speech runtime…");
  // Only a static model URL is fetched; reading text never leaves the worker.
  const response = await fetch(PARADEE_MODEL_URL, {
    signal: AbortSignal.timeout(180000),
    credentials: "omit",
  });
  if (!response.ok) throw new Error("Paradee download failed");
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength < 8_000_000 || bytes.byteLength > 12_000_000)
    throw new Error("Invalid Paradee model download");
  await modelCache.put(PARADEE_MODEL_URL, new Response(bytes)).catch(() => {});
  return bytes;
}
