import { z } from "zod";
import type { Bible } from "@/lib/bible";
import type { PassageType } from "@/lib/schemas";
import { assertPassageText } from "@/lib/bible/integrity";

export const BiblePosition = z.object({
  reference: z.string().min(3).max(100),
  verse: z.number().int().positive(),
  verseView: z.boolean(),
});
export type BiblePositionType = z.infer<typeof BiblePosition>;

export function bibleStart(
  bible: Bible | null,
  saved: unknown,
  explicit?: string | null,
) {
  const parsed = BiblePosition.safeParse(saved);
  const bookmark = parsed.success ? parsed.data : null;
  let passage: PassageType | undefined;
  for (const reference of [explicit, bookmark?.reference, "John 1"]) {
    if (!reference || !bible) continue;
    try {
      passage = bible.lookup(reference, "WEB");
      break;
    } catch {
      /* Ignore invalid saved locations. */
    }
  }
  const verse =
    bookmark &&
    bookmark.reference === passage?.reference &&
    passage?.verses.some((v) => v.verse === bookmark.verse)
      ? bookmark.verse
      : (passage?.verses[0].verse ?? 1);
  const index = passage?.verses.findIndex((v) => v.verse === verse) ?? 0;
  return {
    reference: passage?.reference ?? "John 1",
    verse,
    verseView: bookmark?.verseView ?? true,
    readerOffset: Math.floor(Math.max(0, index) / 20) * 20,
    restore: !!passage && (!!explicit || !!bookmark),
  };
}

/** Bounded exact-source segments keep speech quick and below the Edge text cap. */
export function bibleSegment(passage: PassageType, from: number) {
  assertPassageText(passage);
  let start = passage.verses.findIndex(
    (v) => v.verse <= from && (v.verseEnd ?? v.verse) >= from,
  );
  if (start < 0) start = 0;
  const verses: PassageType["verses"] = [];
  let size = 0;
  for (const verse of passage.verses.slice(start, start + 8)) {
    if (verses.length && size + verse.text.length > 1800) break;
    verses.push(verse);
    size += verse.text.length + 1;
  }
  const first = verses[0],
    last = verses.at(-1)!;
  const end = last.verseEnd ?? last.verse;
  const reference = `${first.book} ${first.chapter}:${first.verse}${end !== first.verse ? `-${end}` : ""}`;
  return {
    passage: {
      ...passage,
      reference,
      requestedReference: reference,
      verses,
      text: verses.map((v) => v.text).join(" "),
    },
    previous: passage.verses[Math.max(0, start - 8)]?.verse,
    hasPrevious: start > 0,
    next: passage.verses[start + verses.length]?.verse,
  };
}
