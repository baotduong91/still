import { expect, it } from "vitest";
import {
  buildSpokenText,
  engineForKind,
  type ReadingKind,
} from "@/lib/tts/reading";
import { readingText } from "@/lib/tts/shared";

it("keeps every non-Scripture kind on-device for every preference and connectivity state", () => {
  const kinds: ReadingKind[] = [
    "devotional",
    "prayer",
    "action",
    "interpretation",
  ];
  for (const kind of kinds)
    for (const preference of ["auto", "edge", "kokoro"] as const)
      for (const online of [true, false])
        expect(engineForKind(kind, preference, online)).toBe("kokoro");
  expect(engineForKind("scripture", "auto", true)).toBe("edge");
  expect(engineForKind("scripture", "edge", true)).toBe("edge");
  expect(engineForKind("scripture", "kokoro", true)).toBe("kokoro");
  expect(engineForKind("scripture", "edge", false)).toBe("kokoro");
});
it("preserves Scripture text and citation bytes using the existing readingText contract", () => {
  const payload = {
    kind: "scripture" as const,
    text: "  Exact text.\nSecond line.  ",
    reference: "Matthew 6:34",
    title: "Not spoken",
  };
  expect(buildSpokenText(payload)).toBe(readingText(payload));
  expect(buildSpokenText(payload)).toBe(
    "  Exact text.\nSecond line.  \n\nMatthew 6:34",
  );
});
it("trims curated prose and never speaks its optional title/reference as Scripture", () => {
  for (const kind of ["devotional", "action", "interpretation"] as const)
    expect(
      buildSpokenText({
        kind,
        text: "  A steady step. \n",
        title: "Not spoken",
        reference: "Not spoken",
      }),
    ).toBe("A steady step.");
  expect(
    buildSpokenText({ kind: "prayer", text: "  Help me be patient.  " }),
  ).toBe(
    "A prayer inspired by today’s reading. This is not Scripture.\n\nHelp me be patient.",
  );
  expect(buildSpokenText({ kind: "prayer", text: " \n " })).toBe("");
});
