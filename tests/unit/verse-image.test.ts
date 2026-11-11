import { expect, it } from "vitest";
import {
  wrapText,
  formats,
  styles,
  renderVerseImage,
  type Format,
  type Style,
} from "@/lib/verse-image/render";
import { Bible } from "@/lib/bible";
import corpus from "../../public/bibles/WEB.json";
import type { Corpus } from "@/lib/bible";
it("wraps exact Scripture without additions or lost punctuation", () => {
  const text =
    "Therefore don’t be anxious for tomorrow, for tomorrow will be anxious for itself. Each day’s own evil is sufficient.";
  for (const width of [15, 25, 40])
    expect(wrapText(text, (s) => s.length, width).join(" ")).toBe(text);
});
it("declares social export aspect ratios", () => {
  expect(formats.story.width / formats.story.height).toBe(9 / 16);
  expect(formats.square.width / formats.square.height).toBe(1);
  expect(formats.portrait.width / formats.portrait.height).toBe(4 / 5);
});
it("draws complete retrieved Scripture, reference and attribution in every format/style", () => {
  const passage = new Bible(corpus as Corpus).lookup("John 3:16");
  passage.attribution = "World English Bible · Public domain";
  for (const format of Object.keys(formats) as Format[]) {
    for (const style of Object.keys(styles) as Style[]) {
      const painted: string[] = [];
      const context = {
        drawImage() {},
        fillRect() {},
        measureText(text: string) {
          return { width: text.length * 25 };
        },
        fillText(text: string) {
          painted.push(text);
        },
      };
      const canvas = {
        getContext: () => context,
      } as unknown as HTMLCanvasElement;
      const image = {
        naturalWidth: 1080,
        naturalHeight: 1920,
      } as HTMLImageElement;
      renderVerseImage(canvas, image, passage, format, style);
      const reference = "John 3:16 · WEB";
      expect(painted.slice(1, painted.indexOf(reference)).join(" ")).toBe(
        passage.verses[0].text,
      );
      expect(painted).toContain(reference);
      expect(painted.slice(painted.indexOf(reference) + 1, -1).join(" ")).toBe(
        passage.attribution,
      );
    }
  }
});
