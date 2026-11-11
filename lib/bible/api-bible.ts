import { createHash } from "node:crypto";
import { z } from "zod";
import type { PassageType, TranslationId } from "@/lib/schemas";
import { getBible } from "./server";
// At most 200 individual verse responses across all translations and keys. Never a corpus mirror.
const cache = new Map<
  string,
  { expires: number; text: string; copyright: string; token: string }
>();
const pending = new Map<
  string,
  Promise<{ text: string; copyright: string; token: string }>
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
      : undefined;
}
export function apiBibleEnabled(id: TranslationId) {
  return !!(
    apiBibleId(id) &&
    process.env.API_BIBLE_KEY &&
    process.env.API_BIBLE_NONCOMMERCIAL === "true"
  );
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
    const verses = [];
    const tokens: string[] = [];
    const attribution = new Set<string>();
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
            const response = await fetch(url, {
              headers: { "api-key": key },
              signal: AbortSignal.timeout(10000),
              cache: "no-store",
            });
            if (!response.ok)
              throw new Error(
                "Translation access unavailable or API quota reached.",
              );
            const parsed = responseSchema.parse(await response.json());
            if (
              parsed.data.orgId !== verseId ||
              parsed.data.bibleId !== id ||
              /[<>]/.test(parsed.data.content)
            )
              throw new Error("The provider returned a mismatched verse.");
            const value = {
              text: parsed.data.content,
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
      verses.push({ ...verse, text: item.text });
      tokens.push(item.token);
      attribution.add(item.copyright);
    }
    return {
      ...fallback,
      translation,
      fallback: false,
      notice:
        "Online edition via API.Bible. Saved offline plans retain WEB text.",
      source: "api.bible",
      attribution: [...attribution].join(" "),
      fumsTokens: tokens,
      verses,
      text: verses.map((v) => v.text).join(" "),
    };
  } catch {
    return {
      ...fallback,
      notice: `${translation} could not be retrieved or validated. Showing exact WEB text. Try a shorter passage or check access and quota.`,
    };
  }
}
