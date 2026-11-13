import { createHash } from "node:crypto";
import { z } from "zod";
import type { PassageType, TranslationId } from "@/lib/schemas";
import { getBible } from "./server";
// At most 200 individual verse responses across all translations and keys. Never a corpus mirror.
const cache = new Map<
  string,
  {
    expires: number;
    text: string;
    copyright: string;
    token: string;
    orgId: string;
  }
>();
const pending = new Map<
  string,
  Promise<{ text: string; copyright: string; token: string; orgId: string }>
>();
const codes =
  "GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH EST JOB PSA PRO ECC SNG ISA JER LAM EZK DAN HOS JOL AMO OBA JON MIC NAM HAB ZEP HAG ZEC MAL MAT MRK LUK JHN ACT ROM 1CO 2CO GAL EPH PHP COL 1TH 2TH 1TI 2TI TIT PHM HEB JAS 1PE 2PE 1JN 2JN 3JN JUD REV".split(
    " ",
  );
export function apiBibleId(id: TranslationId) {
  return id === "CSB"
    ? process.env.API_BIBLE_CSB_ID
    : id === "NLT"
      ? process.env.API_BIBLE_NLT_ID
      : id === "MSG"
        ? process.env.API_BIBLE_MSG_ID
        : undefined;
}
export function apiBibleEnabled(id: TranslationId) {
  return !!(
    apiBibleId(id) &&
    process.env.API_BIBLE_KEY &&
    process.env.API_BIBLE_NONCOMMERCIAL === "true"
  );
}
export function verseSpan(orgId: string, requested: string) {
  const item = requested.match(/^([A-Z0-9]{3})\.(\d+)\.(\d+)$/);
  if (!item) return null;
  const span = orgId.match(
    /^([A-Z0-9]{3})\.(\d+)\.(\d+)(?:-([A-Z0-9]{3})\.(\d+)\.(\d+))?$/,
  );
  if (
    !span ||
    span[1] !== item[1] ||
    span[2] !== item[2] ||
    (span[4] && (span[4] !== span[1] || span[5] !== span[2]))
  )
    return null;
  const start = Number(span[3]),
    end = Number(span[6] ?? span[3]);
  return start <= Number(item[3]) && Number(item[3]) <= end && end - start < 40
    ? { start, end }
    : null;
}
const responseSchema = z.object({
  data: z.object({
    orgId: z.string(),
    bibleId: z.string(),
    content: z.string().min(1),
    copyright: z.string().min(1),
  }),
  meta: z.object({ fumsToken: z.string().min(1) }),
});
export async function resolvePassage(
  reference: string,
  translation: TranslationId = "WEB",
): Promise<PassageType> {
  const local = await getBible("WEB");
  const fallback = local.lookup(reference, translation);
  if (translation === "WEB")
    return {
      ...fallback,
      source: "local",
      attribution: "World English Bible · Public domain · eBible.org",
    };
  if (!apiBibleEnabled(translation))
    return {
      ...fallback,
      notice: `${translation} online access is not configured. Showing exact WEB text.`,
    };
  try {
    if (fallback.verses.length > 40)
      throw new Error(
        "Choose a shorter passage (40 verses or fewer). No bulk download is supported.",
      );
    const books = local.books();
    const id = apiBibleId(translation)!;
    const key = process.env.API_BIBLE_KEY!;
    const verses: PassageType["verses"] = [];
    const tokens: string[] = [];
    const attribution = new Set<string>();
    const spans = new Map<string, string>();
    let first = fallback.verses[0].verse,
      last = fallback.verses.at(-1)!.verse;
    const verseIdFor = (verse: (typeof fallback.verses)[number]) =>
      `${codes[books.findIndex((b) => b.book === verse.book)]}.${verse.chapter}.${verse.verse}`;
    for (const verse of fallback.verses) {
      const verseId = `${codes[books.findIndex((b) => b.book === verse.book)]}.${verse.chapter}.${verse.verse}`;
      const cacheKey = createHash("sha256")
        .update(key + id + verseId)
        .digest("hex");
      let hit = cache.get(cacheKey);
      let item;
      if (hit && hit.expires > Date.now()) item = hit;
      else {
        let task = pending.get(cacheKey);
        if (!task) {
          task = (async () => {
            const url = new URL(
              `https://rest.api.bible/v1/bibles/${encodeURIComponent(id)}/verses/${verseId}`,
            );
            for (const [k, v] of Object.entries({
              "content-type": "text",
              "include-notes": "false",
              "include-titles": "false",
              "include-verse-numbers": "false",
              "include-chapter-numbers": "false",
              "use-org-id": "true",
            }))
              url.searchParams.set(k, v);
            let response = await fetch(url, {
              headers: { "api-key": key },
              signal: AbortSignal.timeout(10000),
              cache: "no-store",
            });
            if (response.status === 404) {
              // Grouped editions may only expose the first member as a verse
              // endpoint. Find the actual group using text-free chapter metadata.
              const chapterId = verseId.split(".").slice(0, 2).join(".");
              const metadata = await fetch(
                `https://rest.api.bible/v1/bibles/${encodeURIComponent(id)}/chapters/${chapterId}/verses`,
                {
                  headers: { "api-key": key },
                  signal: AbortSignal.timeout(10000),
                  cache: "no-store",
                },
              );
              if (metadata.ok) {
                const list = z
                  .object({
                    data: z.array(
                      z.object({ id: z.string(), orgId: z.string() }),
                    ),
                  })
                  .parse(await metadata.json());
                const group = list.data.find((v) =>
                  verseSpan(v.orgId, verseId),
                );
                if (group) {
                  const groupUrl = new URL(url);
                  groupUrl.pathname = `/v1/bibles/${encodeURIComponent(id)}/verses/${encodeURIComponent(group.id)}`;
                  groupUrl.searchParams.set("use-org-id", "false");
                  response = await fetch(groupUrl, {
                    headers: { "api-key": key },
                    signal: AbortSignal.timeout(10000),
                    cache: "no-store",
                  });
                }
              }
            }
            if (!response.ok)
              throw new Error(
                `API.Bible returned HTTP ${response.status}; check this edition’s ID, access and quota.`,
              );
            const parsed = responseSchema.parse(await response.json());
            if (
              !verseSpan(parsed.data.orgId, verseId) ||
              parsed.data.bibleId !== id ||
              /[<>]/.test(parsed.data.content)
            )
              throw new Error(
                `API.Bible returned an unexpected verse span (${parsed.data.orgId}); exact citation validation failed.`,
              );
            const value = {
              text: parsed.data.content,
              orgId: parsed.data.orgId,
              copyright: parsed.data.copyright,
              token: parsed.meta.fumsToken,
            };
            for (const [k, v] of cache)
              if (v.expires <= Date.now()) cache.delete(k);
            while (cache.size >= 200) cache.delete(cache.keys().next().value!);
            cache.set(cacheKey, {
              ...value,
              expires: Date.now() + 14 * 86400000,
            });
            return value;
          })();
          pending.set(cacheKey, task);
        }
        try {
          item = await task;
        } finally {
          pending.delete(cacheKey);
        }
      }
      const span = verseSpan(item.orgId, verseIdFor(verse));
      if (!span)
        throw new Error("API.Bible verse identity could not be verified.");
      const exactSpan = local.lookup(
        `${verse.book} ${verse.chapter}:${span.start}-${span.end}`,
        translation,
      );
      if (exactSpan.verses.length > 40)
        throw new Error("Provider span exceeds reading limit.");
      first = Math.min(first, span.start);
      last = Math.max(last, span.end);
      if (spans.has(item.orgId)) {
        if (spans.get(item.orgId) !== item.text)
          throw new Error("Provider span text mismatch.");
      } else {
        if (verses.some((v) => v.verse >= span.start && v.verse <= span.end))
          throw new Error("Provider spans overlap ambiguously.");
        spans.set(item.orgId, item.text);
        verses.push({ ...verse, verse: span.start, text: item.text });
      }
      tokens.push(item.token);
      attribution.add(item.copyright);
    }
    return {
      ...fallback,
      translation,
      requestedReference: fallback.reference,
      reference:
        first === fallback.verses[0].verse &&
        last === fallback.verses.at(-1)!.verse
          ? fallback.reference
          : local.lookup(
              `${fallback.verses[0].book} ${fallback.verses[0].chapter}:${first}-${last}`,
              translation,
            ).reference,
      fallback: false,
      notice:
        "Online edition via API.Bible. Saved offline plans retain WEB text.",
      source: "api.bible",
      attribution: [...attribution].join(" "),
      fumsTokens: tokens,
      verses,
      text: verses.map((v) => v.text).join(" "),
    };
  } catch (error) {
    return {
      ...fallback,
      notice: `${translation} could not be retrieved or validated. Showing exact WEB text. ${error instanceof Error && error.message.startsWith("API.Bible") ? error.message : "Check edition access, quota, and the passage reference."}`,
    };
  }
}
