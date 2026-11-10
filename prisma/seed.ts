import { PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { Verse, Translation } from "../lib/schemas";
const client = new PrismaClient();
async function main() {
  const translation = Translation.parse(process.env.SEED_TRANSLATION ?? "WEB");
  const corpus = z
    .object({ translation: Translation, verses: z.array(Verse).min(1) })
    .parse(
      JSON.parse(
        await readFile(resolve("public/bibles", `${translation}.json`), "utf8"),
      ),
    );
  if (corpus.translation !== translation)
    throw new Error("Translation label mismatch");
  await client.$transaction(
    async (tx) => {
      await tx.scripture.deleteMany({ where: { translation } });
      for (let i = 0; i < corpus.verses.length; i += 500)
        await tx.scripture.createMany({
          data: corpus.verses
            .slice(i, i + 500)
            .map((v) => ({ ...v, translation })),
        });
    },
    { timeout: 120000 },
  );
  console.log(
    `Seeded ${corpus.verses.length} exact ${translation} verse records.`,
  );
}
main().finally(() => client.$disconnect());
