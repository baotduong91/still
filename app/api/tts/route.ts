import { z } from "zod";
import { EdgeTTS } from "node-edge-tts";
import { validateBrowserOrigin } from "@/lib/awp/auth";
import { readingText } from "@/lib/tts/shared";
export const runtime = "nodejs";
export const maxDuration = 30;
const inputSchema = z
  .object({
    text: z.string().min(1).max(10000),
    reference: z.string().max(100).optional(),
    voice: z
      .enum(["en-US-JennyNeural", "en-US-AriaNeural"])
      .default("en-US-JennyNeural"),
    rate: z.number().min(0.8).max(1.2).default(1),
  })
  .strict();
const headers = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};
export async function POST(request: Request) {
  try {
    validateBrowserOrigin(request);
  } catch {
    return Response.json(
      { error: "Open Still on its configured address to read aloud." },
      { status: 403, headers },
    );
  }
  let input;
  try {
    const raw = await request.text();
    if (raw.length > 16000) throw new Error();
    input = inputSchema.parse(JSON.parse(raw));
  } catch {
    return Response.json(
      { error: "Choose a shorter passage and a supported voice/speed." },
      { status: 400, headers },
    );
  }
  try {
    const percent = Math.round((input.rate - 1) * 100);
    const tts = new EdgeTTS({
      voice: input.voice,
      lang: "en-US",
      rate: `${percent >= 0 ? "+" : ""}${percent}%`,
      timeout: 18000,
      outputFormat: "audio-24khz-48kbitrate-mono-mp3",
    });
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of tts.streamAudio(readingText(input))) {
      if (request.signal.aborted) throw new Error("Cancelled");
      if (Buffer.isBuffer(chunk)) {
        size += chunk.length;
        if (size > 8_000_000) throw new Error("Audio too large");
        chunks.push(chunk);
      }
    }
    if (!size) throw new Error("Empty audio");
    return new Response(new Uint8Array(Buffer.concat(chunks)), {
      headers: { ...headers, "Content-Type": "audio/mpeg" },
    });
  } catch {
    return Response.json(
      { error: "Edge voice is unavailable. You can read on-device instead." },
      { status: 503, headers },
    );
  }
}
