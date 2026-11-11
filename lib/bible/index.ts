import type { PassageType, TranslationId, VerseType } from "@/lib/schemas";
import { AppError } from "@/lib/awp/errors";
export type Corpus = {
  translation: TranslationId;
  name: string;
  source: string;
  license: string;
  verses: VerseType[];
};
export const translationNames = {
  CSB: "Christian Standard Bible",
  NLT: "New Living Translation",
  NIV: "New International Version",
  ESV: "English Standard Version",
  WEB: "World English Bible",
};
export class Bible {
  private index = new Map<string, VerseType[]>();
  private metadata: { book: string; chapters: number }[] = [];
  private aliases = new Map<string, string>();
  constructor(public corpus: Corpus) {
    for (const v of corpus.verses) {
      const key = `${v.book} ${v.chapter}`;
      const chapter = this.index.get(key) ?? [];
      chapter.push(v);
      this.index.set(key, chapter);
      this.aliases.set(v.book.toLowerCase(), v.book);
    }
    const counts = new Map<string, number>();
    for (const v of corpus.verses)
      counts.set(v.book, Math.max(counts.get(v.book) ?? 0, v.chapter));
    this.metadata = [...counts].map(([book, chapters]) => ({ book, chapters }));
    for (const [alias, book] of Object.entries({
      psalm: "Psalms",
      ps: "Psalms",
      jn: "John",
      john: "John",
      matt: "Matthew",
      rom: "Romans",
      phil: "Philippians",
      prov: "Proverbs",
      gen: "Genesis",
      "song of songs": "Song of Solomon",
    }))
      this.aliases.set(alias, book);
  }
  lookup(input: string, requested: TranslationId = "WEB"): PassageType {
    const match = input
      .trim()
      .replace(/[–—]/g, "-")
      .match(/^(.+?)\s+(\d{1,3})(?::(\d{1,3})(?:-(\d{1,3}))?)?$/);
    if (!match)
      throw new AppError(
        "SCRIPTURE_NOT_FOUND",
        "Use a book and chapter, optionally followed by verses: John 3:16-18.",
      );
    const book = this.aliases.get(match[1].toLowerCase().replace(/\s+/g, " "));
    const chapter = Number(match[2]);
    const all = this.index.get(`${book} ${chapter}`);
    if (!book || !all)
      throw new AppError(
        "SCRIPTURE_NOT_FOUND",
        "This book or chapter does not exist in the installed translation.",
      );
    const start = match[3] ? Number(match[3]) : all[0].verse;
    const end = match[4]
      ? Number(match[4])
      : match[3]
        ? start
        : all[all.length - 1].verse;
    const verses = all.filter((v) => v.verse >= start && v.verse <= end);
    if (
      start < 1 ||
      end < start ||
      !verses.length ||
      (match[3] && verses.length !== end - start + 1)
    )
      throw new AppError(
        "SCRIPTURE_NOT_FOUND",
        "One or more requested verses are absent; no text was substituted.",
      );
    const reference = `${book} ${chapter}${match[3] ? `:${start}${end !== start ? `-${end}` : ""}` : ""}`;
    const fallback = requested !== this.corpus.translation;
    return {
      reference,
      requestedTranslation: requested,
      translation: this.corpus.translation,
      fallback,
      notice: fallback
        ? `${requested} is not installed. Showing exact ${this.corpus.translation} text.`
        : "",
      verses,
      text: verses.map((v) => v.text).join(" "),
    };
  }
  search(query: string, requested: TranslationId, offset = 0, limit = 20) {
    if (/\d/.test(query)) {
      try {
        const passage = this.lookup(query, requested);
        return { results: [passage], total: 1, offset: 0 };
      } catch {
        if (/\d+:/.test(query))
          throw new AppError(
            "SCRIPTURE_NOT_FOUND",
            "Invalid Scripture reference.",
          );
      }
    }
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const matches = this.corpus.verses.filter((v) =>
      terms.every((t) => v.text.toLowerCase().includes(t)),
    );
    return {
      results: matches
        .slice(offset, offset + limit)
        .map((v) =>
          this.lookup(`${v.book} ${v.chapter}:${v.verse}`, requested),
        ),
      total: matches.length,
      offset,
    };
  }
  validate(passage: PassageType) {
    const exact = this.lookup(passage.reference, passage.requestedTranslation);
    return (
      exact.translation === passage.translation &&
      exact.text === passage.text &&
      JSON.stringify(exact.verses) === JSON.stringify(passage.verses)
    );
  }
  books() {
    return this.metadata;
  }
}
