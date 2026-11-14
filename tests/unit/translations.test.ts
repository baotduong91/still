import { afterEach, beforeEach, it, expect, vi } from "vitest";
import { resolvePassage } from "@/lib/bible/api-bible";
import { getBible } from "@/lib/bible/server";
import { GenerateInput } from "@/lib/schemas";
import { parseWithServerTranslationDefault } from "@/lib/bible/default-translation-server";
beforeEach(() => {
  delete process.env.DATABASE_URL;
  process.env.API_BIBLE_KEY = "fixture-key";
  process.env.API_BIBLE_CSB_ID = crypto.randomUUID();
  process.env.API_BIBLE_NONCOMMERCIAL = "true";
});
afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.API_BIBLE_KEY;
  delete process.env.API_BIBLE_CSB_ID;
  delete process.env.API_BIBLE_NONCOMMERCIAL;
});
it("defaults omitted generate input to the configured API.Bible edition", () => {
  expect(
    parseWithServerTranslationDefault(GenerateInput, {
      prompt: "Help with prayer",
    }).translation,
  ).toBe("CSB");
});
it("defaults to offline WEB without network", async () => {
  const f = vi.spyOn(globalThis, "fetch");
  expect((await resolvePassage("John 3:16")).translation).toBe("WEB");
  expect(f).not.toHaveBeenCalled();
});
it("preserves provider text exactly, attribution and cache", async () => {
  const text =
    "A provider test fixture, intentionally not a Scripture quotation. ";
  const f = vi.spyOn(globalThis, "fetch").mockImplementation(
    async () =>
      new Response(
        JSON.stringify({
          data: {
            id: "JHN.3.16",
            bibleId: process.env.API_BIBLE_CSB_ID,
            content: text,
            copyright: "Fixture rights holder",
          },
          meta: { fumsToken: "test" },
        }),
      ),
  );
  const a = await resolvePassage("John 3:16", "CSB"),
    b = await resolvePassage("John 3:16", "CSB");
  expect(a.text).toBe(text);
  expect(a.attribution).toBe("Fixture rights holder");
  expect(a.source).toBe("api.bible");
  expect(b).toEqual(a);
  expect(f).toHaveBeenCalledTimes(1);
});
it.each([401, 403, 429, 500])(
  "falls back to exact WEB for HTTP %s",
  async (status) => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () => new Response("{}", { status }),
    );
    const p = await resolvePassage("John 3:16", "CSB");
    expect(p.translation).toBe("WEB");
    expect(p.fallback).toBe(true);
    expect((await getBible("WEB")).validate(p)).toBe(true);
  },
);
it("rejects a misattributed provider verse", async () => {
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async () =>
      new Response(
        JSON.stringify({
          data: {
            id: "JHN.3.17",
            bibleId: process.env.API_BIBLE_CSB_ID,
            content: "Mismatched fixture",
            copyright: "Fixture",
          },
          meta: { fumsToken: "test" },
        }),
      ),
  );
  expect((await resolvePassage("John 3:16", "CSB")).translation).toBe("WEB");
});
it("does not fetch without non-commercial acknowledgement", async () => {
  delete process.env.API_BIBLE_NONCOMMERCIAL;
  const f = vi.spyOn(globalThis, "fetch");
  expect((await resolvePassage("John 3:16", "CSB")).translation).toBe("WEB");
  expect(f).not.toHaveBeenCalled();
});
it("validates reference before requesting content", async () => {
  const f = vi.spyOn(globalThis, "fetch");
  await expect(resolvePassage("John 999:1", "CSB")).rejects.toThrow();
  expect(f).not.toHaveBeenCalled();
});

it.each(["CSB", "NLT", "MSG"] as const)(
  "retrieves configured %s with exact provider wording",
  async (translation) => {
    vi.stubEnv(`API_BIBLE_${translation}_ID`, crypto.randomUUID());
    const id = process.env[`API_BIBLE_${translation}_ID`];
    const text = `Exact ${translation} provider fixture.`;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        data: {
          id: "JHN.3.16",
          bibleId: id,
          content: text,
          copyright: "Rights fixture",
        },
        meta: { fumsToken: "fixture" },
      }),
    );
    const passage = await resolvePassage("John 3:16", translation);
    expect(passage.translation).toBe(translation);
    expect(passage.text).toBe(text);
    expect(passage.fallback).toBe(false);
    vi.unstubAllEnvs();
  },
);
it("keeps a grouped MSG span once and expands the citation accurately", async () => {
  vi.stubEnv("API_BIBLE_MSG_ID", crypto.randomUUID());
  const text = "One exact provider span covering three verses.";
  vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
    Response.json({
      data: {
        id: "JHN.3.16-JHN.3.18",
        bibleId: process.env.API_BIBLE_MSG_ID,
        content: text,
        copyright: "MSG rights fixture",
      },
      meta: { fumsToken: "fixture" },
    }),
  );
  const passage = await resolvePassage("John 3:16-17", "MSG");
  expect(passage.translation).toBe("MSG");
  expect(passage.requestedReference).toBe("John 3:16-17");
  expect(passage.reference).toBe("John 3:16-18");
  expect(passage.text).toBe(text);
  expect(passage.verses).toHaveLength(1);
  expect(passage.verses[0]).toMatchObject({ verse: 16, verseEnd: 18 });
  vi.unstubAllEnvs();
});

it("resolves a missing MSG group member through chapter metadata", async () => {
  vi.stubEnv("API_BIBLE_MSG_ID", crypto.randomUUID());
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/chapters/1TH.5/verses"))
      return Response.json({
        data: [{ id: "1TH.5.16-1TH.5.18", orgId: "1TH.5.16-1TH.5.18" }],
      });
    if (url.pathname.endsWith("/verses/1TH.5.17"))
      return new Response("", { status: 404 });
    return Response.json({
      data: {
        id: "1TH.5.16-1TH.5.18",
        bibleId: process.env.API_BIBLE_MSG_ID,
        content: "Exact grouped provider fixture.",
        copyright: "Rights",
      },
      meta: { fumsToken: "fixture" },
    });
  });
  const passage = await resolvePassage("1 Thessalonians 5:17", "MSG");
  expect(passage.translation).toBe("MSG");
  expect(passage.reference).toBe("1 Thessalonians 5:16-18");
  expect(passage.text).toBe("Exact grouped provider fixture.");
  vi.unstubAllEnvs();
});

it("uses printed Psalm numbering instead of the shifted organizational ID", async () => {
  const f = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = new URL(String(input));
    expect(url.searchParams.get("use-org-id")).toBe("false");
    return Response.json({
      data: {
        id: "PSA.63.8",
        orgId: "PSA.63.9",
        bibleId: process.env.API_BIBLE_CSB_ID,
        content: "Exact printed verse-eight provider fixture.",
        copyright: "Fixture",
      },
      meta: { fumsToken: "fixture" },
    });
  });
  const result = await resolvePassage("Psalms 63:8", "CSB");
  expect(result.translation).toBe("CSB");
  expect(result.reference).toBe("Psalms 63:8");
  expect(result.text).toBe("Exact printed verse-eight provider fixture.");
  expect(f).toHaveBeenCalledOnce();
});
