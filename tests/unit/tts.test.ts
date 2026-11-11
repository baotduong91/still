import { afterEach, expect, it, vi } from "vitest";
import { Bible, type Corpus } from "@/lib/bible";
import corpus from "../../public/bibles/WEB.json";
import { firstEngine, readingText, verseSpeech } from "@/lib/tts/shared";
const fixture = vi.hoisted(() => ({ text: "", voice: "", fail: false }));
vi.mock("node-edge-tts", () => ({
  EdgeTTS: class {
    constructor(options: { voice: string }) {
      fixture.voice = options.voice;
    }
    async *streamAudio(text: string) {
      fixture.text = text;
      if (fixture.fail) throw new Error("Unavailable");
      yield Buffer.from([0xff, 0xfb, 0x90, 0x00]);
    }
  },
}));
import { POST } from "@/app/api/tts/route";
afterEach(() => {
  fixture.fail = false;
  fixture.text = "";
  vi.unstubAllEnvs();
});
it("sends the exact retrieved Scripture to TTS with its citation separately", async () => {
  const p = new Bible(corpus as Corpus).lookup("John 3:16");
  const input = verseSpeech(p);
  expect(input.text).toBe(p.verses[0].text);
  const result = await POST(
    new Request("http://127.0.0.1:3000/api/tts", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  );
  expect(result.status).toBe(200);
  expect(result.headers.get("content-type")).toBe("audio/mpeg");
  expect(fixture.text).toBe(`${p.verses[0].text}\n\nJohn 3:16`);
  expect(fixture.voice).toBe("en-US-JennyNeural");
  expect(result.headers.get("cache-control")).toBe("no-store");
});
it("never routes a private or offline reading to Edge", () => {
  for (const preference of ["auto", "edge", "kokoro"] as const)
    expect(firstEngine(preference, false)).toBe("kokoro");
  expect(firstEngine("kokoro", true)).toBe("kokoro");
  expect(firstEngine("auto", true)).toBe("edge");
});
it("rejects unsupported voices and rates before sending text", async () => {
  const response = await POST(
    new Request("http://127.0.0.1:3000/api/tts", {
      method: "POST",
      body: JSON.stringify({ text: "A verse", voice: "unsupported", rate: 5 }),
    }),
  );
  expect(response.status).toBe(400);
  expect(fixture.text).toBe("");
});
it("rejects cross-site requests and returns a quiet error on Edge failure", async () => {
  const response = await POST(
    new Request("http://127.0.0.1:3000/api/tts", {
      method: "POST",
      headers: { "sec-fetch-site": "cross-site" },
      body: JSON.stringify({ text: "A verse" }),
    }),
  );
  expect(response.status).toBe(403);
  fixture.fail = true;
  expect(
    (
      await POST(
        new Request("http://127.0.0.1:3000/api/tts", {
          method: "POST",
          body: JSON.stringify({ text: "A verse" }),
        }),
      )
    ).status,
  ).toBe(503);
});
