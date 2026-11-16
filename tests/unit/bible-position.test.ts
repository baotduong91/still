import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { Bible, type Corpus } from "@/lib/bible";
import { bibleStart, bibleSegment } from "@/lib/client/bible-position";
import { mergeSavedState } from "@/lib/client/store";
const bible = new Bible(
  JSON.parse(readFileSync("public/bibles/WEB.json", "utf8")) as Corpus,
);

it("restores a verse in its licensed page and keeps explicit passage links authoritative", () => {
  const saved = { reference: "John 1", verse: 35, verseView: false };
  expect(bibleStart(bible, saved)).toMatchObject({
    reference: "John 1",
    verse: 35,
    readerOffset: 20,
    verseView: false,
    restore: true,
  });
  expect(bibleStart(bible, saved, "Psalms 23:1")).toMatchObject({
    reference: "Psalms 23:1",
    verse: 1,
    readerOffset: 0,
  });
  expect(bibleStart(bible, saved, "John 1").verse).toBe(35);
  expect(
    bibleStart(bible, { ...saved, reference: "Imaginary 99" }),
  ).toMatchObject({ reference: "John 1", verse: 1 });
  expect(mergeSavedState({ biblePosition: saved }).biblePosition).toEqual(
    saved,
  );
  expect(
    mergeSavedState({ biblePosition: { ...saved, verse: -1 } }).biblePosition,
  ).toBeUndefined();
});

it("builds bounded narration from exact retrieved verse bytes, including grouped editions", () => {
  const source = bible.lookup("John 1");
  const segment = bibleSegment(source, 25);
  expect(segment.passage.reference).toBe("John 1:25-32");
  expect(segment.passage.text).toBe(bible.lookup("John 1:25-32").text);
  expect(segment.next).toBe(33);
  expect(segment.previous).toBe(17);
  expect(bibleSegment(source, 51).next).toBeUndefined();
  const grouped = {
    ...source,
    reference: "John 1:1-2",
    verses: [
      {
        ...source.verses[0],
        verseEnd: 2,
        text: "Exact grouped edition fixture.",
      },
    ],
    text: "Exact grouped edition fixture.",
  };
  expect(bibleSegment(grouped, 2).passage.reference).toBe("John 1:1-2");
  expect(bibleSegment(grouped, 2).passage.text).toBe(grouped.text);
});
