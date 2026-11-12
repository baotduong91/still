import { afterEach, expect, it, vi } from "vitest";
import { Bible, type Corpus } from "@/lib/bible";
import corpus from "../../public/bibles/WEB.json";
import { firstEngine, readingText, verseSpeech } from "@/lib/tts/shared";
const fixture = vi.hoisted(() => ({
  text: "",
  voice: "",
  fail: false,
  hold: false,
  release: null as (() => void) | null,
}));
vi.mock("node-edge-tts", () => ({
  EdgeTTS: class {
    constructor(options: { voice: string }) {
      fixture.voice = options.voice;
    }
    async *streamAudio(text: string) {
      fixture.text = text;
      if (fixture.fail) throw new Error("Unavailable");
      yield Buffer.from([0xff, 0xfb, 0x90, 0x00]);
      if (fixture.hold)
        await new Promise<void>((resolve) => {
          fixture.release = resolve;
        });
      yield Buffer.from([1, 2]);
    }
  },
}));
import { HEAD, POST } from "@/app/api/tts/route";
afterEach(() => {
  fixture.fail = false;
  fixture.text = "";
  fixture.hold = false;
  fixture.release = null;
  vi.unstubAllEnvs();
});
it("warms the runtime without sending any text to Edge", () => {
  fixture.voice = "";
  const response = HEAD(
    new Request("http://127.0.0.1:3000/api/tts", { method: "HEAD" }),
  );
  expect(response.status).toBe(204);
  expect(fixture.text).toBe("");
  expect(fixture.voice).toBe("");
});
it("streams the first exact-Scripture MP3 bytes before synthesis completes", async () => {
  fixture.hold = true;
  const response = await POST(
    new Request("http://127.0.0.1:3000/api/tts", {
      method: "POST",
      body: JSON.stringify({
        text: "Exact verse.",
        reference: "John 3:16",
        stream: true,
      }),
    }),
  );
  const reader = response.body!.getReader();
  const first = await reader.read();
  expect([...first.value!]).toEqual([0xff, 0xfb, 0x90, 0x00]);
  expect(fixture.text).toBe("Exact verse.\n\nJohn 3:16");
  await vi.waitFor(() => expect(fixture.release).not.toBeNull());
  fixture.release!();
  expect([...(await reader.read()).value!]).toEqual([1, 2]);
  expect((await reader.read()).done).toBe(true);
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
