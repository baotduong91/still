import { expect, it } from "vitest";
import { defaults } from "@/lib/client/store";
import {
  hostedGroqAvailable,
  hostedGroqDefaultState,
  shouldApplyHostedGroqDefault,
} from "@/lib/client/hosted-groq";

const groqStatus = {
  modes: { cloud: { configured: true, vendor: "groq" as const } },
};

it("detects hosted Groq configuration", () => {
  expect(hostedGroqAvailable(groqStatus)).toBe(true);
  expect(
    hostedGroqAvailable({
      modes: { cloud: { configured: true, vendor: "gateway" } },
    }),
  ).toBe(false);
});

it("applies cloud defaults only before an explicit guide choice", () => {
  expect(shouldApplyHostedGroqDefault(defaults)).toBe(true);
  expect(
    shouldApplyHostedGroqDefault({
      ...defaults,
      guidePreferenceSet: true,
    }),
  ).toBe(false);
  expect(
    shouldApplyHostedGroqDefault({
      ...defaults,
      provider: "cloud",
      cloudConsent: true,
    }),
  ).toBe(false);
});

it("stores Groq as the default guide with consent", () => {
  const next = hostedGroqDefaultState(defaults);
  expect(next.provider).toBe("cloud");
  expect(next.cloudConsent).toBe(true);
  expect(next.guidePreferenceSet).toBe(true);
});
