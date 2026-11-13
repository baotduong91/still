import { expect, it } from "vitest";
import { defaults } from "@/lib/client/store";
import {
  hostedTranslationDefaultState,
  shouldApplyHostedTranslationDefault,
} from "@/lib/client/hosted-translation";

it("applies a hosted default only before an explicit reader choice", () => {
  expect(shouldApplyHostedTranslationDefault(defaults)).toBe(true);
  expect(
    shouldApplyHostedTranslationDefault({
      ...defaults,
      translationPreferenceSet: true,
    }),
  ).toBe(false);
  const next = hostedTranslationDefaultState(defaults, {
    default: "CSB",
    translations: [
      { id: "WEB", available: true },
      { id: "CSB", available: true },
    ],
  });
  expect(next.translation).toBe("CSB");
  expect(next.translationPreferenceSet).toBeFalsy();
});
