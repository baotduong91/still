import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { handle } from "@/lib/awp/handler";
import { GET as modes } from "@/app/api/modes/route";
import { POST as streamRoute } from "@/app/api/chat/stream/route";
import { generatePlan } from "@/lib/ai/server";
import { streamGroqChat } from "@/lib/ai/chat-stream";
import { getProvider } from "@/lib/ai/providers";
import { buildGuidedPlan } from "@/lib/ai/guided";
import { getBible } from "@/lib/bible/server";
import { cloudConsentHeader } from "@/lib/ai/cloud-status";
import { GROQ_BASE_URL, GROQ_MODEL } from "@/lib/ai/providers/groq";
import { api } from "@/lib/client/store";
import { readChatStream } from "@/lib/client/chat-stream";

const corpus = JSON.parse(
  readFileSync(
    new URL("../../public/bibles/WEB.json", import.meta.url),
    "utf8",
  ),
);
const exact = corpus.verses.find(
  (v: { book: string; chapter: number; verse: number }) =>
    v.book === "John" && v.chapter === 3 && v.verse === 16,
).text;
const answer =
  "This passage invites trust in divine love while leaving room to consider its wider context.";
const question = {
  question: "Help me understand John 3:16",
  provider: "cloud",
  translation: "WEB",
};
function request(path: string, body: unknown, consent = true) {
  return new Request(`http://localhost/${path}`, {
    method: "POST",
    headers: {
      origin: "http://localhost",
      "content-type": "application/json",
      ...(consent ? { [cloudConsentHeader]: "true" } : {}),
    },
    body: JSON.stringify(body),
  });
}
function completion(content: unknown) {
  return Response.json({
    id: "groq-fixture",
    object: "chat.completion",
    created: 1,
    model: GROQ_MODEL,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: JSON.stringify(content) },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 20, completion_tokens: 20, total_tokens: 40 },
  });
}
const encode = new TextEncoder();
function delta(text: string) {
  return encode.encode(
    `data: ${JSON.stringify({ id: "groq-fixture", object: "chat.completion.chunk", created: 1, model: GROQ_MODEL, choices: [{ index: 0, delta: { content: text }, finish_reason: null }] })}\n\n`,
  );
}
function done() {
  return encode.encode(
    'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
  );
}
function sse(chunks: string[]) {
  return new Response(
    new ReadableStream({
      start(controller) {
        chunks.forEach((c) => controller.enqueue(delta(c)));
        controller.enqueue(done());
        controller.close();
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  );
}
beforeEach(() => {
  vi.stubEnv("GROQ_API_KEY", "fixture-groq-secret");
  vi.stubEnv("AI_GATEWAY_API_KEY", "");
  vi.stubEnv("CLOUD_MODEL", "");
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("API_BIBLE_KEY", "");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("SITE_URL", "http://localhost");
  vi.stubEnv(
    "SESSION_SECRET",
    "fixture-session-secret-never-a-production-secret",
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Groq direct provider integration and consent", () => {
  it("uses one key and the real SDK adapter after browser opt-in, preserving exact WEB citations", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      completion({
        answer,
        interpretation:
          "An interpretation of the retrieved passage, not a quotation.",
      }),
    );
    const response = await handle(request("api/awp/chat", question), "chat");
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.provider).toBe("groq");
    expect(result.answer).toBe(answer);
    expect(result.citations[0]).toMatchObject({
      reference: "John 3:16",
      translation: "WEB",
      verses: [{ text: exact }],
    });
    expect(response.headers.get("X-Still-Cloud-Status")).toBe("connected");
    expect(f).toHaveBeenCalledOnce();
    const [url, options] = f.mock.calls[0];
    expect(url).toBe(`${GROQ_BASE_URL}/chat/completions`);
    expect(new Headers(options?.headers).get("authorization")).toBe(
      "Bearer fixture-groq-secret",
    );
    const sent = JSON.parse(options!.body as string);
    expect(sent.model).toBe(GROQ_MODEL);
    expect(sent.reasoning_effort).toBe("low");
    expect(sent.reasoning_format).toBeUndefined();
    expect(sent.response_format.type).toBe("json_schema");
    expect(JSON.stringify(sent)).toContain(exact.replaceAll('"', '\\"'));
    expect(JSON.stringify(result)).not.toContain("fixture-groq-secret");
  });
  it("blocks both browser endpoints before any outbound call without explicit consent", async () => {
    const f = vi.spyOn(globalThis, "fetch");
    expect(
      (await handle(request("api/awp/chat", question, false), "chat")).status,
    ).toBe(403);
    expect(
      (await streamRoute(request("api/chat/stream", question, false))).status,
    ).toBe(403);
    expect(
      (
        await handle(
          request(
            "api/awp/plans/generate",
            { prompt: "A private prayer goal", provider: "cloud" },
            false,
          ),
          "plans/generate",
        )
      ).status,
    ).toBe(403);
    await expect(api("chat", question)).rejects.toThrow(/Enable cloud sharing/);
    await expect(
      readChatStream(question, false, new AbortController().signal, () => {}),
    ).rejects.toThrow(/Enable cloud sharing/);
    expect(f).not.toHaveBeenCalled();
  });
  it("makes no request with no key, or for the guided default even when a key exists", async () => {
    const f = vi.spyOn(globalThis, "fetch");
    vi.stubEnv("GROQ_API_KEY", "");
    const missing = await handle(request("api/awp/chat", question), "chat");
    expect(missing.status).toBe(503);
    expect(
      (await streamRoute(request("api/chat/stream", question))).status,
    ).toBe(503);
    vi.stubEnv("GROQ_API_KEY", "fixture-groq-secret");
    const guided = await handle(
      request("api/awp/chat", { question: "prayer" }, false),
      "chat",
    );
    expect((await guided.json()).provider).toBe("curated");
    expect(f).not.toHaveBeenCalled();
  });
  it("keeps existing AI Gateway and Ollama selections independent", async () => {
    const f = vi.spyOn(globalThis, "fetch");
    vi.stubEnv("GROQ_API_KEY", "");
    vi.stubEnv("AI_GATEWAY_API_KEY", "fixture-gateway-key");
    vi.stubEnv("CLOUD_MODEL", "fixture/model");
    expect((await getProvider("cloud")).name).toBe("cloud");
    vi.stubEnv("GROQ_API_KEY", "fixture-groq-secret");
    expect((await getProvider("cloud")).name).toBe("groq");
    vi.stubEnv("OLLAMA_MODEL", "fixture-model");
    expect((await getProvider("ollama")).name).toBe("ollama");
    expect(f).not.toHaveBeenCalled();
  });
  it("checks only public model metadata on explicit connection checks, with no key exposed", async () => {
    const f = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ data: [{ id: GROQ_MODEL }] }));
    const config = await modes(new Request("http://localhost/api/modes"));
    expect((await config.json()).modes.cloud).toMatchObject({
      configured: true,
      vendor: "groq",
    });
    expect(f).not.toHaveBeenCalled();
    const checked = await modes(
      new Request("http://localhost/api/modes?check=groq"),
    );
    const text = await checked.text();
    expect(JSON.parse(text).groqStatus).toBe("connected");
    expect(text).not.toContain("fixture-groq-secret");
    expect(f).toHaveBeenCalledOnce();
    expect(f.mock.calls[0][0]).toBe(`${GROQ_BASE_URL}/models`);
    expect(f.mock.calls[0][1]?.body).toBeUndefined();
  });
  it.each([429, 503])(
    "returns a labelled guided chat on upstream %s without retries or another model",
    async (status) => {
      vi.stubEnv("AI_GATEWAY_API_KEY", "fixture-other-service");
      vi.stubEnv("CLOUD_MODEL", "fixture/model");
      const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        Response.json(
          {
            error: {
              message: "Fixture service failure",
              type: "rate_limit_error",
            },
          },
          { status },
        ),
      );
      const response = await handle(request("api/awp/chat", question), "chat");
      expect(response.status).toBe(200);
      expect(response.headers.get("X-Still-Cloud-Status")).toBe(
        status === 429 ? "rate-limited" : "unavailable",
      );
      expect(response.headers.get("X-Still-Fallback")).toBe("guided");
      const result = await response.json();
      expect(result.provider).toBe("curated");
      expect(result.context).toContain("guided study");
      expect(result.citations[0].verses[0].text).toBe(exact);
      expect(f).toHaveBeenCalledOnce();
      expect(f.mock.calls[0][0]).toBe(`${GROQ_BASE_URL}/chat/completions`);
    },
  );
  it("keeps cloud selection explicit when Groq is unreachable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new TypeError("fixture offline"),
    );
    await expect(
      generatePlan({
        prompt: "Explore the mystery of suffering",
        days: 3,
        provider: "cloud",
      }),
    ).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  });
  it("runs outline and batched composition, retrieving all Scripture independently", async () => {
    const bible = await getBible("WEB");
    const guide = buildGuidedPlan(
      { prompt: "Grow through prayer", days: 3 },
      bible,
    );
    const f = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (_url, options) => {
        const body = JSON.parse(options!.body as string);
        const input = JSON.parse(body.messages.at(-1).content);
        if (input.stage === "goals")
          return completion({ themes: ["prayer"], pace: "gentle" });
        if (input.stage === "outline")
          return completion({
            title: "A quiet journey through prayer",
            themes: ["prayer"],
            pace: "gentle",
            days: guide.days.map((d) => ({
              number: d.number,
              title: d.title,
              objective: d.objective,
              reference: d.passage.reference,
              context: d.context,
              bridge: d.bridge,
            })),
          });
        return completion({
          days: guide.days.map((d) => ({
            number: d.number,
            reflection: `During day ${d.number}, notice the particular invitation of the passage and respond with honest attention and humility.`,
            connection: `Connect day ${d.number} to a quiet moment of prayer within your ordinary daily responsibilities.`,
            questions: [
              "What do you notice within the passage today?",
              "What small response feels honest and manageable?",
            ],
            prayer: `God, guide my attention during day ${d.number} and help me respond with patience and kindness. Amen.`,
            action: `During day ${d.number}, write one observation and take a quiet moment to consider how it shapes your next step.`,
            interpretation:
              "This is devotional interpretation; Christian traditions may differ in their understanding.",
          })),
        });
      });
    const plan = await generatePlan({
      prompt: "Grow through prayer",
      days: 3,
      provider: "cloud",
    });
    expect(plan.provider).toBe("groq");
    expect(plan.days.every((d) => bible.validate(d.passage))).toBe(true);
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("rejects invented model references before commentary or citation rendering", async () => {
    const f = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(completion({ references: ["Imaginary 99:1"] }));
    const response = await handle(
      request("api/awp/chat", {
        question: "Explain the mystery of existence",
        provider: "cloud",
      }),
      "chat",
    );
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("SCRIPTURE_NOT_FOUND");
    expect(f).toHaveBeenCalledOnce();
  });
});

describe("Groq grounded sentence streaming", () => {
  it("reveals a validated sentence and exact citations while the upstream stream remains open", async () => {
    let upstream!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        upstream = c;
      },
    });
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(body, {
        headers: { "content-type": "text/event-stream" },
      }),
    );
    const iterator = streamGroqChat(question);
    const citation = await iterator.next();
    expect(citation.value).toMatchObject({
      type: "citations",
      passages: [{ reference: "John 3:16", verses: [{ text: exact }] }],
    });
    const firstSentence = iterator.next();
    upstream.enqueue(
      encode.encode(
        `data: ${JSON.stringify({ id: "groq-fixture", object: "chat.completion.chunk", created: 1, model: GROQ_MODEL, choices: [{ index: 0, delta: { reasoning: "Private reasoning must not appear as an answer." }, finish_reason: null }] })}\n\n`,
      ),
    );
    upstream.enqueue(delta(answer + " "));
    expect((await firstSentence).value).toEqual({
      type: "text",
      text: answer + " ",
    });
    expect(JSON.parse(f.mock.calls[0][1]!.body as string).stream).toBe(true);
    upstream.enqueue(done());
    upstream.close();
    expect((await iterator.next()).value).toMatchObject({
      type: "result",
      response: { provider: "groq", answer },
    });
    await iterator.return(undefined);
  });
  it.each([
    ["He said “", "an invented verse”."],
    ["Consider John 3", ":16 as a promise."],
  ])(
    "sanitizes quotation-shaped stream tokens and still returns a Groq answer",
    async (a, b) => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(sse([a, b]));
      const iterator = streamGroqChat(question);
      expect((await iterator.next()).value?.type).toBe("citations");
      const events = [];
      for (
        let step = await iterator.next();
        !step.done;
        step = await iterator.next()
      )
        events.push(step.value);
      expect(events.some((e) => e.type === "text")).toBe(true);
      const rendered = events
        .filter((e) => e.type === "text")
        .map((e) => (e.type === "text" ? e.text : ""))
        .join("");
      expect(rendered).not.toMatch(/[“”"]|John 3:16/);
      const final = events.at(-1);
      if (final?.type === "result")
        expect(final.response.answer).toBe(rendered.trim());
      expect(events.at(-1)).toMatchObject({
        type: "result",
        response: { provider: "groq" },
      });
    },
  );
  it("streams a quiet guided fallback event on rate limits with exact WEB text", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json(
        { error: { message: "Rate limit", type: "rate_limit_error" } },
        { status: 429 },
      ),
    );
    const response = await streamRoute(request("api/chat/stream", question));
    expect(response.status).toBe(200);
    const events = (await response.text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(events.find((e) => e.type === "status")).toMatchObject({
      status: "rate-limited",
      fallback: true,
    });
    expect(events.at(-1)).toMatchObject({
      type: "result",
      response: {
        provider: "curated",
        citations: [{ verses: [{ text: exact }] }],
      },
    });
    expect(events.some((e) => e.type === "text")).toBe(false);
  });
});
