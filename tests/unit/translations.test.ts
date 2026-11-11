import { afterEach, beforeEach, it, expect, vi } from "vitest";
import { resolvePassage } from "@/lib/bible/api-bible";
import { getBible } from "@/lib/bible/server";
import { GenerateInput } from "@/lib/schemas";
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
it("defaults to offline WEB without network", async () => {
  const f = vi.spyOn(globalThis, "fetch");
  expect(GenerateInput.parse({ prompt: "Help with prayer" }).translation).toBe(
    "WEB",
  );
  expect((await resolvePassage("John 3:16")).translation).toBe("WEB");
  expect(f).not.toHaveBeenCalled();
});
it("preserves provider text exactly, attribution and cache", async () => {
  const text =
    "A provider test fixture, intentionally not a Scripture quotation. ";
  const f = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            data: {
              orgId: "JHN.3.16",
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
            orgId: "JHN.3.17",
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
