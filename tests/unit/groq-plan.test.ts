import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { guidedQuietCopy } from "@/lib/ai/today-content";
import { generatePlan } from "@/lib/ai/server";
import { getBible } from "@/lib/bible/server";
import { handle } from "@/lib/awp/handler";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const references = [
  "Psalms 13:1-3",
  "Psalms 42:1-3",
  "Job 1:20-22",
  "Lamentations 3:19-21",
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
  repair?: {
    reason: string;
    fieldIssues?: {
      path: string;
      code: string;
      minimum?: number;
      actualWords?: number;
      minimumWords?: number;
      maximumWords?: number;
    }[];
    rejectedDraft?: ReturnType<typeof content>;
    wordEdits?: { path: string; edit: string }[];
  };
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
      reflection: `On day ${day.number}, make space for lament and unanswered questions. Notice the response in the supplied passage without turning it into an easy explanation of every painful experience. Bring an honest observation to prayer.\n\nYou do not need to force certainty before taking a small step. Let one question remain open while you consider a response that is honest, possible, and kind to the limits you carry today. ${guidedQuietCopy(goal, day.number - 1).reflection}`,

      prayer: `God, meet me during day ${day.number} with patience for what remains unresolved and courage to speak honestly. Teach me to listen to the words before me, to love the person who needs my attention, and to depend on your grace when my understanding runs short. Amen.`,
      action: `For day ${day.number}, write a different unanswered question and sit quietly with it before choosing one small act of care.`,
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
      expect(body.temperature).toBe(0.45);
      expect(body.messages[0].content).toContain(
        "warm, personal, natural devotional voice",
      );
      expect(body.messages[0].content).toContain(
        "Let observation, interpretation, and a personal response flow naturally",
      );
      if (payload.stage === "devotional") {
        expect(JSON.stringify(payload)).toMatch(
          /three full sentences addressed to God|targetNewWords/,
        );
        expect(JSON.stringify(payload)).not.toContain("Stoic attention");
      }
      expect(body.max_tokens).toBeLessThanOrEqual(5000);
      expect(body.reasoning_format).toBeUndefined();
      if (payload.repair?.reason === "schema")
        expect(body.response_format.type).toBe("json_object");
      else expect(body.response_format.json_schema.strict).toBe(true);
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
      for (const day of plan.days) {
        expect(bible.validate(day.passage)).toBe(true);
        expect(day.devotionalFormat).toBe("baptist-daily");
        expect(day.journalPrompt).toBe(day.action);
      }
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
  it("assembles individually generated paragraphs and prayer sentences into a verified seven-day plan", async () => {
    const { calls } = mockModel((payload) => {
      if (payload.stage !== "devotional") return;
      const days = content(payload).days.map((day) => {
        const words = day.reflection.split(/\s+/);
        const prayer = day.prayer.split(/(?<=\.) /);
        return {
          ...day,
          reflection: {
            observation: {
              thought: words.slice(0, 18).join(" "),
              development: words.slice(18, 35).join(" "),
            },
            setting: {
              thought: words.slice(35, 53).join(" "),
              development: words.slice(53, 70).join(" "),
            },
            insight: {
              thought: words.slice(70, 88).join(" "),
              development: words.slice(88, 105).join(" "),
            },
            detail: {
              thought: "A further observation.",
              development: "A further detail.",
            },
            application: {
              thought: words.slice(105, 120).join(" "),
              development: words.slice(120).join(" "),
            },
          },
          prayer: {
            address: prayer[0],
            response: prayer[1],
            gratitude: "Thank you for this opportunity to listen.",
            petition: prayer.slice(2).join(" "),
          },
        };
      });
      return completion({ days });
    });
    const plan = await generatePlan({
      ...input,
      prompt:
        "I want to be closer to God in my everyday walk with heratfelt worship moments",
    });
    expect(plan.provider).toBe("groq");
    expect(
      plan.days.every((day) => day.reflection.split("\n\n").length === 4),
    ).toBe(true);
    expect(calls).toHaveLength(4);
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
    "short prayer",
    "quoted Scripture",
    "wrong day",
    "duplicate practice",
    "lightly edited reflection",
    "stock phrase",
    "model source field",
  ])(
    "repairs %s locally without weakening the text or progression gate",
    async (problem) => {
      let broken = false;
      const { calls } = mockModel((payload) => {
        if (
          problem === "duplicate practice" &&
          payload.days?.[0] &&
          "targetNewWords" in payload.days[0]
        ) {
          expect(payload.days[0]).toMatchObject({
            field: "action",
            operation: "replace",
          });
          return completion({
            additions: [
              "Which concrete step can you record after reading this passage today?",
            ],
          });
        }
        if (
          problem === "quoted Scripture" &&
          payload.days?.[0] &&
          "targetNewWords" in payload.days[0]
        ) {
          expect(payload.days[0]).toMatchObject({
            operation: "replace",
            field: "prayer",
          });
          expect(JSON.stringify(payload)).not.toContain("an invented verse");
          return completion({
            additions: [
              content({ ...payload, days: [{ ...payload.days[0], number: 4 }] })
                .days[0].prayer,
            ],
          });
        }
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
        if (problem === "short prayer")
          draft.days[0].prayer = "Lord, help me trust you.";
        if (problem === "quoted Scripture")
          draft.days[0].prayer =
            "God, help me hear “an invented verse” and respond faithfully.";
        if (problem === "wrong day") draft.days[0].number = 1;
        if (problem === "stock phrase")
          draft.days[0].prayer =
            "Let’s dive in and unlock your potential during this exciting day of prayer.";
        if (problem === "model source field")
          Object.assign(draft.days[0], {
            passage: { text: "Invented anchor" },
          });
        if (problem === "lightly edited reflection")
          draft.days[0].reflection = content({
            ...payload,
            days: [{ ...payload.days![0], number: 1 }],
          }).days[0].reflection.replace("On day 1", "During this day");
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
        ["quoted Scripture", "duplicate practice"].includes(problem) ? 1 : 2,
      );
      const repair = calls.find((call) => call.repair)?.repair;
      if (problem === "short reflection") {
        expect(repair?.fieldIssues).toContainEqual({
          path: "days.0.reflection",
          code: "custom",
          actualWords: 3,
          minimumWords: 130,
          maximumWords: 180,
        });
        expect(repair?.wordEdits).toContainEqual({
          path: "days.0.reflection",
          edit: expect.stringContaining("Add about 152 words"),
        });
        expect(repair?.rejectedDraft?.days[0].reflection).toBe(
          "A short thought.",
        );
      }
      if (problem === "short prayer") {
        expect(repair?.fieldIssues).toContainEqual({
          path: "days.0.prayer",
          code: "custom",
          actualWords: 5,
          minimumWords: 35,
          maximumWords: 55,
        });
        expect(repair?.rejectedDraft?.days[0].prayer).toBe(
          "Lord, help me trust you.",
        );
      }
      expect(
        plan.days.every((day) => !day.prayer.includes("invented verse")),
      ).toBe(true);
      expect(new Set(plan.days.map((day) => day.action)).size).toBe(7);
    },
  );
  it("can recover a second word-count miss without replaying accepted batches", async () => {
    let attempts = 0;
    let expansions = 0;
    const { calls } = mockModel((payload) => {
      if (Array.isArray(payload.days) && "targetNewWords" in payload.days[0]) {
        if (++expansions === 1)
          return completion({ additions: ["Remember this."] });
        return completion({
          additions: [
            "Remember the person who is still waiting for an answer. Give that person your attention for a moment, without promising that you can resolve the situation today.",
          ],
        });
      }
      if (payload.days?.[0].number !== 4 || ++attempts > 2) return;
      const draft = content(payload);
      draft.days[2].reflection = draft.days[2].reflection
        .split(/\s+/u)
        .slice(0, attempts === 1 ? 127 : 128)
        .join(" ");
      return completion(draft);
    });
    const plan = await generatePlan(input);
    expect(plan.provider).toBe("groq");
    expect(calls.map((call) => call.days?.[0].number)).toEqual([
      undefined,
      1,
      4,
      undefined,
      undefined,
      7,
    ]);
    expect(calls[4].days).toMatchObject([
      { index: 2, minimumNewWords: 1, targetNewWords: 26, maximumNewWords: 51 },
    ]);
    expect(plan.days[5].reflection).toContain(
      "Remember the person who is still waiting",
    );
  });
  it("keeps the original batch when Groq rejects the field-edit JSON", async () => {
    const { calls } = mockModel((payload) => {
      if (payload.days?.[0] && "targetNewWords" in payload.days[0]) {
        return Response.json(
          {
            error: {
              code: "json_validate_failed",
              message: "Failed to generate JSON",
            },
          },
          { status: 400 },
        );
      }
      if (payload.days?.[0].number === 4 && !payload.repair) {
        const draft = content(payload);
        draft.days[0].reflection = draft.days[0].reflection
          .split(/\s+/)
          .slice(0, 120)
          .join(" ");
        return completion(draft);
      }
    });
    expect((await generatePlan(input)).provider).toBe("groq");
    const repair = calls.find((call) => call.repair)?.repair;
    expect(repair?.rejectedDraft?.days[0].number).toBe(4);
    expect(repair?.fieldIssues?.[0].actualWords).toBe(120);
  });
  it("rewrites only the reflection that contains a quotation", async () => {
    let broken = false;
    const { calls } = mockModel((payload) => {
      if (payload.days?.[0] && "targetNewWords" in payload.days[0]) {
        const edit = payload.days[0] as unknown as { day: { number: number } };
        return completion({
          additions: [
            content({
              ...payload,
              days: [edit.day as NonNullable<Payload["days"]>[number]],
            }).days[0].reflection,
          ],
        });
      }
      if (payload.days?.[0].number !== 4 || broken) return;
      broken = true;
      const draft = content(payload);
      draft.days[1].reflection += " “An unverified quotation.”";
      return completion(draft);
    });
    const plan = await generatePlan(input);
    expect(plan.provider).toBe("groq");
    expect(plan.days[4].reflection).not.toContain("unverified quotation");
    expect(calls[3].days).toMatchObject([
      {
        index: 1,
        field: "reflection",
        operation: "replace",
        day: { number: 5 },
      },
    ]);
  });
  it("repairs a bad reference after an outline schema retry", async () => {
    const { calls } = mockModel((payload, index) => {
      if (index === 1) return completion({ days: [] });
      if (index !== 2) return;
      const draft = outline(payload.count);
      draft.days[0].reference = "Psalm 4:99";
      return completion(draft);
    });
    const plan = await generatePlan(input);
    expect(plan.provider).toBe("groq");
    expect(calls.slice(0, 3).map((call) => call.repair?.reason)).toEqual([
      undefined,
      "schema",
      "reference",
    ]);
    expect(plan.days[0].passage.reference).toBe("Psalms 13:1-3");
  });
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
    expect(plan.days[0].passage.reference).toBe("Psalms 13:1-3");
  });
  it("returns a validated guided plan, never invented passages, after both outline attempts fail", async () => {
    const { calls } = mockModel(() => {
      const draft = outline();
      draft.days[0].reference = "Imaginary 1:1";
      return completion(draft);
    });
    const status = vi.fn();
    const fallback = await generatePlan(input, { onCloudStatus: status });
    expect(fallback.provider).toBe("curated");
    const bible = await getBible("WEB");
    expect(fallback.days.every((day) => bible.validate(day.passage))).toBe(
      true,
    );
    expect(calls).toHaveLength(2);
    expect(status).toHaveBeenCalledWith("unavailable", true);
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
  it("does not retry a daily quota wait and explicitly labels the guided fallback", async () => {
    const { calls } = mockModel(() =>
      Response.json(
        { error: { type: "requests", message: "Fixture daily quota" } },
        { status: 429, headers: { "retry-after": "3600" } },
      ),
    );
    const status = vi.fn();
    expect(
      (await generatePlan(input, { onCloudStatus: status })).provider,
    ).toBe("curated");
    expect(calls).toHaveLength(1);
    expect(status).toHaveBeenLastCalledWith("rate-limited", true);
  });
  it("preserves the cloud-only Create request when Groq cannot serve it", async () => {
    mockModel(() =>
      Response.json(
        { error: { message: "Quota exceeded" } },
        { status: 429, headers: { "retry-after": "3600" } },
      ),
    );
    const response = await handle(
      new Request("http://localhost/api/awp/plans/generate", {
        method: "POST",
        headers: {
          origin: "http://localhost",
          "Content-Type": "application/json",
          "X-Still-Cloud-Consent": "true",
          "X-Still-Require-Cloud-Plan": "true",
        },
        body: JSON.stringify(input),
      }),
      "plans/generate",
    );
    expect(response.status).toBe(503);
    expect(response.headers.get("X-Still-Cloud-Status")).toBe("rate-limited");
    expect(response.headers.get("X-Still-Fallback")).toBeNull();
    expect(await response.json()).toMatchObject({
      error: { code: "PROVIDER_UNAVAILABLE" },
    });
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
    draft.days[0].reference = "Psalm 13 : 1 – 3";
    return completion(draft);
  });
  const plan = await generatePlan(input);
  expect(plan.provider).toBe("groq");
  expect(plan.days[0].passage.reference).toBe("Psalms 13:1-3");
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
        expect.objectContaining({
          day: 5,
          validReferences: ["Psalms 4:1-3", "Psalms 4:4-6", "Psalms 4:7-8"],
        }),
      ],
    },
  });
  expect(plan.days[0].passage.reference).toBe("Psalms 13:1-3");
});

it("repairs a five-day CSB outline using exact failing field constraints", async () => {
  let broken = false;
  const { calls, fetch } = mockModel((payload) => {
    if (payload.stage !== "outline" || broken) return;
    broken = true;
    const draft = outline(5);
    draft.days[0].objective = "Draw near";
    return completion(draft);
  });
  const plan = await generatePlan({
    ...input,
    days: 5,
    translation: "CSB",
    prompt:
      "I want to get to know God deeper in my everyday little moments and in worship, being more obedient every little step",
  });
  expect(plan.provider).toBe("groq");
  expect(plan.days).toHaveLength(5);
  expect(calls[1].repair?.fieldIssues).toContainEqual({
    path: "days.0.objective",
    code: "too_small",
    minimum: 20,
  });
  const body = JSON.parse(fetch.mock.calls[0][1]!.body as string);
  const day = body.response_format.json_schema.schema.properties.days.items;
  expect(day.properties.objective.minLength).toBeUndefined();
  expect(day.properties.objective.description).toContain("minLength: 20");
  expect(day.required).toContain("reference");
  expect(day.additionalProperties).toBe(false);
  expect(body.response_format.json_schema.strict).toBe(true);
  const bible = await getBible("WEB");
  expect(plan.days.every((day) => bible.validate(day.passage))).toBe(true);
});

it("keeps a verified five-day journey when Groq supplies extra or unknown theme labels", async () => {
  const { calls } = mockModel((payload) => {
    if (payload.stage !== "outline") return;
    const draft = outline(payload.count);
    draft.themes = [
      "prayer",
      "everyday worship",
      " Gratitude ",
      "patience",
      "forgiveness",
    ];
    return completion(draft);
  });
  const plan = await generatePlan({ ...input, days: 5, translation: "CSB" });
  expect(plan.provider).toBe("groq");
  expect(plan.days).toHaveLength(5);
  expect(plan.profile.themes).toEqual(["prayer", "gratitude", "patience"]);
  expect(calls.filter((call) => call.stage === "outline")).toHaveLength(1);
});
