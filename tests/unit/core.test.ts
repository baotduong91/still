import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Bible, type Corpus } from "@/lib/bible";
import {
  buildPlan,
  extractGoals,
  designObjectives,
  validatePlan,
  adaptPlan,
} from "@/lib/ai/orchestrator";
import { answerQuestion } from "@/lib/ai/chat";
import { themes } from "@/lib/ai/themes";
import { manifest } from "@/lib/awp/manifest";
import { actions } from "@/lib/awp/actions";
import { handle } from "@/lib/awp/handler";
import { validateCommentary } from "@/lib/ai/providers";
import { ollamaProvider } from "@/lib/ai/providers/ollama";
import { rateLimit } from "@/lib/awp/rate-limit";
import { z } from "zod";
import Ajv from "ajv";
import type { PlanType } from "@/lib/schemas";
let bible: Bible, dir: string;
beforeAll(async () => {
  bible = new Bible(
    JSON.parse(await readFile("public/bibles/WEB.json", "utf8")) as Corpus,
  );
  dir = await mkdtemp(join(tmpdir(), "still-tests-"));
  process.env.DATA_DIR = dir;
  delete process.env.DATABASE_URL;
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});
describe("Exact Scripture", () => {
  it("loads all 66 books and 31,103 source records", () => {
    expect(bible.books()).toHaveLength(66);
    expect(bible.corpus.verses).toHaveLength(31103);
  });
  it("retrieves exact source text, not a model quote", () => {
    const p = bible.lookup("John 3:16", "CSB");
    expect(p.text).toBe(
      bible.corpus.verses.find(
        (v) => v.book === "John" && v.chapter === 3 && v.verse === 16,
      )!.text,
    );
    expect(p.translation).toBe("WEB");
    expect(p.fallback).toBe(true);
    expect(p.requestedTranslation).toBe("CSB");
  });
  it.each([
    "Hezekiah 1:1",
    "John 999:1",
    "John 3:99",
    "John 3:18-16",
    "John 3:16-999",
    "John 0:0",
    "John 3:0",
    "John 3:16banana",
  ])("rejects %s", (ref) => expect(() => bible.lookup(ref)).toThrow());
  it("normalizes aliases and en-dashes without altering text", () =>
    expect(bible.lookup("psalm 23:1–3").reference).toBe("Psalms 23:1-3"));
  it("validates every curated reference", () => {
    for (const theme of Object.values(themes))
      for (const lesson of theme.lessons)
        expect(bible.lookup(lesson.reference).verses.length).toBeGreaterThan(0);
  });
  it("rejects modified passage text and verse records", () => {
    const p = bible.lookup("John 3:16");
    expect(bible.validate({ ...p, text: "invented" })).toBe(false);
    p.verses = structuredClone(p.verses);
    p.verses[0].text = "invented";
    expect(bible.validate(p)).toBe(false);
  });
  it("does not silently fix an invalid search reference", () =>
    expect(() => bible.search("John 3:999", "WEB")).toThrow());
});
describe("Multi-stage personalization", () => {
  it("extracts only stated themes and retains the goal", () => {
    const p = extractGoals("I feel anxious about a decision at work");
    expect(p.themes).toContain("anxiety");
    expect(p.themes).toContain("decision-making");
    expect(p.focus).toBe(p.prompt);
    expect(designObjectives(p, 7)).toHaveLength(7);
  });
  it("requires a meaningful supported intention", () =>
    expect(() => extractGoals("xyzabc nonsense")).toThrow());
  it("produces substantively different plans", () => {
    const a = buildPlan({ prompt: "I am grieving a loss" }, bible),
      b = buildPlan({ prompt: "I need forgiveness for resentment" }, bible);
    expect(a.days.map((d) => d.passage.reference)).not.toEqual(
      b.days.map((d) => d.passage.reference),
    );
    expect(a.days.map((d) => d.action)).not.toEqual(
      b.days.map((d) => d.action),
    );
    expect(a.days.map((d) => d.objective)).not.toEqual(
      b.days.map((d) => d.objective),
    );
    expect(a.days[0].number).toBe(1);
  });
  it("distinct situations within one theme select relevant different passages", () => {
    const a = buildPlan(
        { prompt: "Anxiety at bedtime; I cannot sleep" },
        bible,
      ),
      b = buildPlan({ prompt: "Anxiety before a job interview" }, bible);
    expect(a.days[1].passage.reference).toBe("Psalms 4:8");
    expect(b.days[1].passage.reference).toBe("Colossians 3:23-24");
    expect(a.days[1].action).not.toBe(b.days[1].action);
  });
  it("different contextual goals change the actual passage sequence", () => {
    const a = buildPlan({ prompt: "Anxiety about a career decision" }, bible),
      b = buildPlan({ prompt: "Anxiety while grieving a loss" }, bible);
    expect(a.days.map((d) => d.passage.reference)).not.toEqual(
      b.days.map((d) => d.passage.reference),
    );
  });
  it.each(Object.keys(themes))(
    "validates 14 progressive days for %s",
    (topic) =>
      expect(
        validatePlan(
          buildPlan({ prompt: `Explore ${topic}`, days: 14 }, bible),
          bible,
        ).days,
      ).toHaveLength(14),
  );
  it("adapts only future uncompleted days and preserves Scripture", () => {
    const p = buildPlan({ prompt: "Help with anxiety" }, bible);
    p.days[4].completedAt = new Date().toISOString();
    const copy = adaptPlan(p, 2, "I am tired and need a gentler pace");
    expect(copy.days.slice(0, 2)).toEqual(p.days.slice(0, 2));
    expect(copy.days[4]).toEqual(p.days[4]);
    expect(copy.days[2].action).not.toBe(p.days[2].action);
    expect(copy.days.map((d) => d.passage)).toEqual(
      p.days.map((d) => d.passage),
    );
    expect(p.feedback).toHaveLength(0);
    expect(copy.revision).toBe(1);
  });
  it("returns exact citations in local chat and abstains when unsupported", () => {
    const result = answerQuestion(
      { question: "What does Scripture say about grief?" },
      bible,
    );
    expect(result.citations).toHaveLength(3);
    expect(result.citations.every((p) => bible.validate(p))).toBe(true);
    expect(
      answerQuestion({ question: "Who won the championship?" }, bible)
        .citations,
    ).toHaveLength(0);
  });
  it("rejects invented quotes and references in model commentary", () => {
    expect(() => validateCommentary("God said “you will succeed”")).toThrow();
    expect(() => validateCommentary("As Isaiah 99:8 says")).toThrow();
  });
  it("does not silently call cloud after an Ollama failure", async () => {
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("offline"));
    process.env.OLLAMA_MODEL = "test";
    await expect(
      ollamaProvider.generate(
        z.object({ text: z.string() }),
        "system",
        "prompt",
      ),
    ).rejects.toMatchObject({ code: "LOCAL_MODEL_UNAVAILABLE" });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(
      fetcher.mock.calls.every(
        (call) => new URL(String(call[0])).hostname === "127.0.0.1",
      ),
    ).toBe(true);
    expect(String(fetcher.mock.calls[0][0])).toContain("127.0.0.1:11434");
    fetcher.mockRestore();
  });
});
describe("AWP contract and persistence", () => {
  it("declares v0.2 fields and executable input/output JSON schemas", () => {
    const m = manifest("https://still.example");
    expect(m.awp_version).toBe("0.2");
    expect(m.domain).toBe("still.example");
    expect(m.actions).toHaveLength(Object.keys(actions).length);
    const ajv = new Ajv({ strict: false, validateFormats: false });
    for (const a of m.actions) {
      expect(a.auth_required).toBe(false);
      expect(a.endpoint).toContain("/api/awp/");
      ajv.compile(a.input_schema);
      ajv.compile(a.output_schema);
    }
  });
  it("executes every declared endpoint, isolates owners, and validates outputs", async () => {
    const call = async (
      path: string,
      method: string,
      body?: unknown,
      cookie?: string,
    ) =>
      handle(
        new Request(`http://localhost/api/awp/${path}`, {
          method,
          headers: {
            ...(cookie ? { cookie } : {}),
            "content-type": "application/json",
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        }),
        path.split("?")[0],
      );
    const response = await call("plans/generate", "POST", {
      prompt: "I want to grow in patience",
    });
    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie")!.split(";")[0];
    const { plan } = (await response.json()) as { plan: PlanType };
    const fixtures: Record<string, unknown> = {
      generate_plan: { prompt: "I want to practice prayer" },
      get_daily: { planId: plan.id },
      adapt_plan: {
        planId: plan.id,
        day: 1,
        feedback: "Make it gentler",
        revision: 0,
      },
      lookup_scripture: { reference: "John 3:16" },
      search_scripture: { query: "grief" },
      bible_chat: { question: "How can I pray?" },
      create_journal: {
        id: crypto.randomUUID(),
        text: "A quiet moment",
        planId: plan.id,
      },
      get_translations: {},
      complete_day: { planId: plan.id, day: 1, date: "2026-11-10" },
      list_plans: {},
      list_journal: {},
    };
    for (const [id, a] of Object.entries(actions)) {
      const data = fixtures[id] as Record<string, string>;
      const path =
        a.path + (a.method === "GET" ? `?${new URLSearchParams(data)}` : "");
      const r = await call(
        path,
        a.method,
        a.method === "POST" ? data : undefined,
        cookie,
      );
      expect(r.status, `${id}: ${await r.clone().text()}`).toBe(200);
      const output = await r.json();
      expect(a.output.safeParse(output).success, id).toBe(true);
      const ajv = new Ajv({ strict: false, validateFormats: false });
      const spec = manifest("http://localhost").actions.find(
        (x) => x.id === id,
      )!;
      expect(
        ajv.validate(spec.output_schema, output),
        JSON.stringify(ajv.errors),
      ).toBe(true);
    }
    const privateResponse = await call(`plans/today?planId=${plan.id}`, "GET");
    expect(privateResponse.status).toBe(404);
    const conflict = await call(
      "plans/adapt",
      "POST",
      { planId: plan.id, day: 1, feedback: "More time", revision: 0 },
      cookie,
    );
    expect(conflict.status).toBe(409);
    const completed = await call(
      "plans/complete",
      "POST",
      { planId: plan.id, day: 1, date: "2026-11-11" },
      cookie,
    );
    expect((await completed.json()).plan.days[0].completedDate).toBe(
      "2026-11-10",
    );
  });
  it("returns recoverable errors for bad references and JSON", async () => {
    const r = await handle(
      new Request("http://localhost/api/awp/scripture?reference=John+3%3A999"),
      "scripture",
    );
    expect(r.status).toBe(404);
    expect((await r.json()).error.code).toBe("SCRIPTURE_NOT_FOUND");
    const bad = await handle(
      new Request("http://localhost/api/awp/chat", {
        method: "POST",
        body: "{",
      }),
      "chat",
    );
    expect(bad.status).toBe(400);
  });
  it("rejects cross-origin mutations and invalid tokens", async () => {
    const r = await handle(
      new Request("http://localhost/api/awp/chat", {
        method: "POST",
        headers: { origin: "https://other.example" },
        body: "{}",
      }),
      "chat",
    );
    expect(r.status).toBe(403);
    const token = await handle(
      new Request("http://localhost/api/awp/plans", {
        headers: { authorization: "Bearer invalid" },
      }),
      "plans",
    );
    expect(token.status).toBe(401);
  });
  it("enforces a rolling minute bucket", async () => {
    const owner = crypto.randomUUID();
    for (let i = 0; i < 120; i++) await rateLimit(owner, 0);
    await expect(rateLimit(owner, 0)).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
    await expect(rateLimit(owner, 60001)).resolves.toBeUndefined();
  });
});
