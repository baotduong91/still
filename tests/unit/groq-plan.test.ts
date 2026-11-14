import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generatePlan } from "@/lib/ai/server";
import { getBible } from "@/lib/bible/server";
import { handle } from "@/lib/awp/handler";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const references = [
  "Psalms 13:1-6",
  "Psalms 42:1-5",
  "Job 1:20-22",
  "Lamentations 3:19-24",
  "Romans 8:26-27",
  "Habakkuk 3:17-19",
  "Revelation 21:3-5",
];
const goal =
  "Make room for lament and unanswered questions, without rushing to easy answers.";
const input = {
  prompt: goal,
  days: 7,
  provider: "cloud" as const,
  translation: "WEB" as const,
};
type Payload = {
  stage: string;
  count?: number;
  repair?: { reason: string };
  goal: string;
  days?: {
    number: number;
    passage: { reference: string; text: string; translation: string };
  }[];
};
function outline(count = 7) {
  return {
    title: "Honest lament, held with hope",
    themes: ["grief"],
    pace: "gentle",
    days: Array.from({ length: count }, (_, i) => ({
      number: i + 1,
      title: `A place for lament ${i + 1}`,
      objective: `Explore an honest response to unanswered questions during day ${i + 1}.`,
      reference: references[i],
      context: `Consider the literary setting of the assigned passage for day ${i + 1} before applying it to your concern.`,
      bridge: `Carry one observation from day ${i + 1} into the next quiet practice.`,
    })),
  };
}
function content(payload: Payload) {
  return {
    days: payload.days!.map((day) => ({
      number: day.number,
      reflection: `On day ${day.number}, make space for lament and unanswered questions. Notice the response in the supplied passage without turning it into an easy explanation of every painful experience. Bring an honest observation to prayer.`,
      connection: `Relate day ${day.number} to the stated wish to leave room for unanswered questions, without inventing a personal story.`,
      questions: [
        "What does this passage leave open for you?",
        "What response feels honest and manageable today?",
      ],
      prayer: `God, meet me during day ${day.number} with patience for what remains unresolved and courage to speak honestly. Amen.`,
      action: `For day ${day.number}, write a different unanswered question and sit quietly with it before choosing one small act of care.`,
      interpretation:
        "This is devotional interpretation, not Scripture; Christian traditions may differ.",
    })),
  };
}
function completion(value: unknown, finish = "stop", raw = false) {
  return Response.json({
    id: "fixture",
    object: "chat.completion",
    created: 1,
    model: "openai/gpt-oss-120b",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: raw ? value : JSON.stringify(value),
        },
        finish_reason: finish,
      },
    ],
    usage: { prompt_tokens: 100, completion_tokens: 100, total_tokens: 200 },
  });
}
function mockModel(
  override?: (payload: Payload, index: number) => Response | undefined,
) {
  const calls: Payload[] = [];
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (url, options) => {
      expect(String(url)).toBe(
        "https://api.groq.com/openai/v1/chat/completions",
      );
      const body = JSON.parse(options!.body as string);
      const payload = JSON.parse(body.messages.at(-1).content) as Payload;
      calls.push(payload);
      expect(body.reasoning_effort).toBe("low");
      expect(body.reasoning_format).toBeUndefined();
      expect(body.response_format.json_schema.strict).toBe(true);
      return (
        override?.(payload, calls.length) ??
        completion(
          payload.stage === "outline"
            ? outline(payload.count)
            : content(payload),
        )
      );
    });
  return { calls, fetch };
}
beforeEach(() => {
  vi.stubEnv("GROQ_API_KEY", "fixture-secret");
  vi.stubEnv("AI_GATEWAY_API_KEY", "");
  vi.stubEnv("CLOUD_MODEL", "");
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("SITE_URL", "http://localhost");
  vi.stubEnv("SESSION_SECRET", "fixture-stable-session-key");
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("Seven-day Groq journey regression", () => {
  it("returns a full custom journey through the action endpoint, with no guided fallback or duplicated Scripture payload", async () => {
    const dir = await mkdtemp(join(tmpdir(), "still-groq-plan-"));
    vi.stubEnv("DATA_DIR", dir);
    try {
      const { calls } = mockModel();
      const response = await handle(
        new Request("http://localhost/api/awp/plans/generate", {
          method: "POST",
          headers: {
            origin: "http://localhost",
            "content-type": "application/json",
            "X-Still-Cloud-Consent": "true",
          },
          body: JSON.stringify(input),
        }),
        "plans/generate",
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("X-Still-Fallback")).toBeNull();
      expect(response.headers.get("X-Still-Cloud-Status")).toBe("connected");
      const { plan } = await response.json();
      expect(plan.provider).toBe("groq");
      expect(plan.days).toHaveLength(7);
      expect(plan.profile.prompt).toBe(goal);
      expect(plan.days.map((day: { number: number }) => day.number)).toEqual([
        1, 2, 3, 4, 5, 6, 7,
      ]);
      expect(calls.map((call) => call.stage)).toEqual([
        "outline",
        "devotional",
        "devotional",
        "devotional",
      ]);
      expect(
        calls.slice(1).map((call) => call.days!.map((day) => day.number)),
      ).toEqual([[1, 2, 3], [4, 5, 6], [7]]);
      const bible = await getBible("WEB");
      for (const day of plan.days)
        expect(bible.validate(day.passage)).toBe(true);
      for (const call of calls.slice(1))
        for (const day of call.days!) {
          expect(day.passage).toEqual({
            reference: day.passage.reference,
            translation: "WEB",
            text: bible.lookup(day.passage.reference).text,
          });
          expect(day.passage).not.toHaveProperty("verses");
        }
      expect(
        plan.days.every((day: { reflection: string }) =>
          day.reflection.includes("unanswered questions"),
        ),
      ).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it("repairs a truncated middle batch without regenerating verified earlier days", async () => {
    let broken = false;
    const { calls, fetch } = mockModel((payload) => {
      if (payload.days?.[0].number === 4 && !broken) {
        broken = true;
        return completion('{"days":[', "length", true);
      }
    });
    const result = await generatePlan(input);
    expect(result.provider).toBe("groq");
    expect(calls.filter((call) => call.days?.[0].number === 1)).toHaveLength(1);
    expect(calls.filter((call) => call.days?.[0].number === 4)).toHaveLength(2);
    expect(calls.find((call) => call.repair)?.repair?.reason).toBe("truncated");
    const attempts = fetch.mock.calls
      .map(([, options]) => JSON.parse(options!.body as string))
      .filter(
        (body) =>
          JSON.parse(body.messages.at(-1).content).days?.[0].number === 4,
      );
    expect(attempts[1].max_tokens).toBeGreaterThan(attempts[0].max_tokens);
    expect(result.days[0].reflection).toContain("On day 1");
    expect(result.days[6].reflection).toContain("On day 7");
  });
  it("repairs Groq's JSON validation HTTP error as a draft failure, not an outage", async () => {
    const { calls } = mockModel((_payload, index) =>
      index === 2
        ? Response.json(
            {
              error: {
                type: "invalid_request_error",
                message: "Failed to generate JSON",
                code: "json_validate_failed",
              },
            },
            { status: 400 },
          )
        : undefined,
    );
    expect((await generatePlan(input)).provider).toBe("groq");
    expect(calls[2].repair?.reason).toBe("schema");
  });
  it.each([
    "short reflection",
    "quoted Scripture",
    "wrong day",
    "duplicate practice",
  ])(
    "repairs %s locally without weakening the text or progression gate",
    async (problem) => {
      let broken = false;
      const { calls } = mockModel((payload) => {
        if (
          payload.stage !== "devotional" ||
          payload.days![0].number !== 4 ||
          broken
        )
          return;
        broken = true;
        const draft = content(payload);
        if (problem === "short reflection")
          draft.days[0].reflection = "A short thought.";
        if (problem === "quoted Scripture")
          draft.days[0].prayer =
            "God, help me hear “an invented verse” and respond faithfully.";
        if (problem === "wrong day") draft.days[0].number = 1;
        if (problem === "duplicate practice")
          draft.days[0].action = content({
            ...payload,
            days: [{ ...payload.days![0], number: 1 }],
          }).days[0].action;
        return completion(draft);
      });
      const plan = await generatePlan(input);
      expect(plan.provider).toBe("groq");
      expect(calls.filter((call) => call.days?.[0].number === 4)).toHaveLength(
        2,
      );
      expect(
        plan.days.every((day) => !day.prayer.includes("invented verse")),
      ).toBe(true);
      expect(new Set(plan.days.map((day) => day.action)).size).toBe(7);
    },
  );
  it("repairs a bad reference in the outline before composing any devotional content", async () => {
    const { calls } = mockModel((_payload, index) => {
      if (index !== 1) return;
      const draft = outline();
      draft.days[0].reference = "Imaginary 1:1";
      return completion(draft);
    });
    const plan = await generatePlan(input);
    expect(plan.provider).toBe("groq");
    expect(calls[1]).toMatchObject({
      stage: "outline",
      repair: {
        reason: "reference",
        corrections: [
          expect.objectContaining({ day: 1, reference: "Imaginary 1:1" }),
        ],
      },
    });
    expect(plan.days[0].passage.reference).toBe("Psalms 13:1-6");
  });
  it("never returns a model plan with invented passages after both outline attempts fail", async () => {
    const { calls } = mockModel(() => {
      const draft = outline();
      draft.days[0].reference = "Imaginary 1:1";
      return completion(draft);
    });
    const status = vi.fn();
    await expect(
      generatePlan(input, { onCloudStatus: status }),
    ).rejects.toMatchObject({ code: "PLAN_GENERATION_FAILED" });
    expect(calls).toHaveLength(2);
    expect(status).not.toHaveBeenCalledWith("unavailable", true);
    const logs = JSON.stringify(vi.mocked(console.warn).mock.calls);
    expect(logs).not.toContain(goal);
    expect(logs).not.toContain("fixture-secret");
    expect(logs).not.toContain("Imaginary");
  });
  it("respects a short Retry-After token window and resumes the same batch", async () => {
    let limited = false;
    const { calls } = mockModel((payload) => {
      if (payload.days?.[0].number === 4 && !limited) {
        limited = true;
        return Response.json(
          { error: { type: "tokens", message: "Fixture token window" } },
          { status: 429, headers: { "retry-after": "0" } },
        );
      }
    });
    expect((await generatePlan(input)).provider).toBe("groq");
    expect(calls.filter((call) => call.days?.[0].number === 4)).toHaveLength(2);
    expect(calls.filter((call) => call.stage === "outline")).toHaveLength(1);
  });
  it("does not retry a daily quota wait or silently choose a different provider", async () => {
    const { calls } = mockModel(() =>
      Response.json(
        { error: { type: "requests", message: "Fixture daily quota" } },
        { status: 429, headers: { "retry-after": "3600" } },
      ),
    );
    const status = vi.fn();
    await expect(
      generatePlan(input, { onCloudStatus: status }),
    ).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
    expect(calls).toHaveLength(1);
    expect(status).toHaveBeenLastCalledWith("rate-limited");
  });
  it("cancels without repairing, selecting guided, or making another model request", async () => {
    const abort = new AbortController();
    const { fetch } = mockModel(() => {
      abort.abort();
      throw new DOMException("Stopped", "AbortError");
    });
    const status = vi.fn();
    await expect(
      generatePlan(input, { signal: abort.signal, onCloudStatus: status }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetch).toHaveBeenCalledOnce();
    expect(status).not.toHaveBeenCalledWith("unavailable", true);
  });
});

it("retrieves a formatted valid reference exactly without wasting an outline repair", async () => {
  const { calls } = mockModel((payload) => {
    if (payload.stage !== "outline") return;
    const draft = outline();
    draft.days[0].reference = "Psalm 13 : 1 – 6";
    return completion(draft);
  });
  const plan = await generatePlan(input);
  expect(plan.provider).toBe("groq");
  expect(plan.days[0].passage.reference).toBe("Psalms 13:1-6");
  expect(calls.filter((c) => c.stage === "outline")).toHaveLength(1);
});

it.each(["CSB", "NLT", "MSG"] as const)(
  "hydrates a verified Groq plan with %s and retains its WEB validation source",
  async (translation) => {
    vi.stubEnv("API_BIBLE_KEY", "fixture-key");
    vi.stubEnv("API_BIBLE_NONCOMMERCIAL", "true");
    const id = crypto.randomUUID();
    vi.stubEnv(`API_BIBLE_${translation}_ID`, id);
    const { fetch: mocked } = mockModel();
    const generate = mocked.getMockImplementation()!;
    mocked.mockImplementation(async (url, opts) => {
      if (String(url).startsWith("https://rest.api.bible/")) {
        const orgId = new URL(String(url)).pathname.split("/").at(-1)!;
        return Response.json({
          data: {
            id: orgId,
            bibleId: id,
            content: `Exact licensed fixture for ${orgId}.`,
            copyright: "Rights fixture",
          },
          meta: { fumsToken: "fixture" },
        });
      }
      return generate(url, opts);
    });
    const plan = await generatePlan({ ...input, translation });
    const bible = await getBible("WEB");
    expect(plan.provider).toBe("groq");
    expect(plan.translation).toBe(translation);
    for (const day of plan.days) {
      expect(day.passage.translation).toBe(translation);
      expect(day.passage.source).toBe("api.bible");
      expect(day.webPassage && bible.validate(day.webPassage)).toBe(true);
      expect(day.passage.text).not.toBe(day.webPassage!.text);
    }
  },
);

it("repairs Psalm 4:8-9 locally without another outline call or an invented verse", async () => {
  const { calls } = mockModel((payload) => {
    if (payload.stage !== "outline") return;
    const draft = outline();
    draft.days[4].reference = "Psalm 4:8-9";
    return completion(draft);
  });
  const plan = await generatePlan(input);
  expect(plan.provider).toBe("groq");
  expect(plan.days[4].passage.reference).toBe("Psalms 4:8");
  expect(plan.days[4].passage.verses.map((v) => v.verse)).toEqual([8]);
  expect(calls.filter((c) => c.stage === "outline")).toHaveLength(1);
});
it("offers real bounds for invalid starts and keeps verified days during repair", async () => {
  const { calls } = mockModel((payload, index) => {
    if (payload.stage !== "outline") return;
    const draft = outline();
    if (index === 1) draft.days[4].reference = "Psalm 4:99";
    else draft.days[0].reference = "John 3:16";
    return completion(draft);
  });
  const plan = await generatePlan(input);
  expect(calls[1]).toMatchObject({
    repair: {
      corrections: [
        expect.objectContaining({ day: 5, validReferences: ["Psalms 4:1-8"] }),
      ],
    },
  });
  expect(plan.days[0].passage.reference).toBe("Psalms 13:1-6");
});
