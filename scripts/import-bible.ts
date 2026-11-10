import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { Verse, Translation } from "../lib/schemas";
const schema = z.object({
  translation: Translation,
  name: z.string().min(1),
  source: z.string().min(1),
  license: z.string().min(1),
  offlineAllowed: z.literal(true),
  verses: z.array(Verse).min(1),
});
async function main() {
  const input = process.argv[2];
  if (!input)
    throw new Error(
      "Usage: npm run bible:import -- /absolute/path/licensed.json",
    );
  if (process.env.CONFIRM_LICENSE !== "yes")
    throw new Error(
      "Set CONFIRM_LICENSE=yes only after verifying storage, display, export, and redistribution rights for your deployment.",
    );
  const corpus = schema.parse(
    JSON.parse(await readFile(resolve(input), "utf8")),
  );
  const keys = new Set<string>();
  const canon = JSON.parse(
    await readFile("public/bibles/WEB.json", "utf8"),
  ) as { verses: { book: string }[] };
  const books = new Set(canon.verses.map((v) => v.book));
  for (const v of corpus.verses) {
    const key = `${v.book} ${v.chapter}:${v.verse}`;
    if (!books.has(v.book) || keys.has(key))
      throw new Error(`Unknown canonical book or duplicate verse: ${key}`);
    keys.add(key);
  }
  await writeFile(
    resolve("public/bibles", `${corpus.translation}.json`),
    JSON.stringify(corpus),
  );
  const catalog = JSON.parse(
    await readFile("public/bibles/catalog.json", "utf8"),
  ) as string[];
  await writeFile(
    "public/bibles/catalog.json",
    JSON.stringify([...new Set([...catalog, corpus.translation])]),
  );
  console.log(
    `Imported ${corpus.verses.length} verses. Restart the app. To seed PostgreSQL: SEED_TRANSLATION=${corpus.translation} npm run db:seed`,
  );
}
main();
