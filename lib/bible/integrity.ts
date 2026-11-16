import { Passage, type PassageType } from "@/lib/schemas";

/** Never repair, trim, or paraphrase source text to make a mismatched payload pass. */
export function assertPassageText(passage: PassageType): void {
  Passage.parse(passage);
  if (passage.text !== passage.verses.map((verse) => verse.text).join(" "))
    throw new Error(
      "The retrieved passage text does not match its verse records.",
    );
}
