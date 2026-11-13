import { readFile } from "node:fs/promises";
import path from "node:path";
import { apiBibleEnabled } from "./api-bible";
import { serverDefaultTranslation } from "./default-translation-server";
import { db } from "@/lib/db/client";
import { Bible, type Corpus, translationNames } from "./index";
import type { TranslationId } from "@/lib/schemas";
const cache = new Map<TranslationId, Bible>();
export async function getBible(
  translation: TranslationId = "WEB",
): Promise<Bible> {
  if (cache.has(translation)) return cache.get(translation)!;
  if (process.env.DATABASE_URL) {
    const verses = await db().scripture.findMany({
      where: { translation },
      orderBy: { id: "asc" },
      select: { book: true, chapter: true, verse: true, text: true },
    });
    if (verses.length) {
      const bible = new Bible({
        translation,
        name: translationNames[translation],
        source: "Local PostgreSQL corpus",
        license:
          translation === "WEB"
            ? "Public domain"
            : "Operator-supplied licensed import",
        verses,
      });
      cache.set(translation, bible);
      return bible;
    }
  }
  try {
    const corpus: Corpus = JSON.parse(
      await readFile(
        path.join(process.cwd(), "public", "bibles", `${translation}.json`),
        "utf8",
      ),
    );
    if (corpus.translation !== translation)
      throw new Error("Corpus label mismatch");
    const bible = new Bible(corpus);
    cache.set(translation, bible);
    return bible;
  } catch (error) {
    if (
      translation !== "WEB" &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    )
      return getBible("WEB");
    throw error;
  }
}
export async function translations() {
  return Promise.all(
    (Object.keys(translationNames) as TranslationId[]).map(async (id) => ({
      id,
      name: translationNames[id],
      available:
        apiBibleEnabled(id) || (await getBible(id)).corpus.translation === id,
      preferred: id === serverDefaultTranslation(),
      primaryAlternative: id === "NLT",
      license:
        id === "WEB"
          ? "Public domain"
          : "Optional API.Bible access for non-commercial use; attribution and usage reporting required",
    })),
  );
}
