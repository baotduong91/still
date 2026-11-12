import { expect, it } from "vitest";
import { Bible, type Corpus } from "@/lib/bible";
import corpus from "../../public/bibles/WEB.json";
import { Plan } from "@/lib/schemas";
import { starterIntents, starterPlanFromIntent } from "@/lib/ai/starters";
import {
  createDeviceProfile,
  needsJourneyWelcome,
  starterVariant,
  welcomeCopy,
} from "@/lib/client/onboarding";
import { defaults } from "@/lib/client/store";
const bible = new Bible(corpus as Corpus);
it.each(starterIntents)(
  "builds a valid, distinct local WEB journey for $id",
  ({ id }) => {
    const mobile = starterPlanFromIntent(id, "mobile", bible);
    const desktop = starterPlanFromIntent(id, "desktop", bible);
    expect(Plan.safeParse(mobile).success).toBe(true);
    expect(Plan.safeParse(desktop).success).toBe(true);
    expect(mobile.days).toHaveLength(5);
    expect(desktop.days).toHaveLength(7);
    expect(mobile.provider).toBe("curated");
    expect(mobile.translation).toBe("WEB");
    expect(
      mobile.days.every(
        (day) => bible.validate(day.passage) && !day.completedAt,
      ),
    ).toBe(true);
    if (id === "reference")
      expect(mobile.days[0].passage.reference).toBe("John 3:16");
    else expect(mobile.profile.themes).toContain(id);
  },
);
it("rejects unsupported intent or a licensed corpus instead of inventing Scripture", () => {
  expect(() => starterPlanFromIntent("unreviewed", "mobile", bible)).toThrow();
  expect(() =>
    starterPlanFromIntent(
      "prayer",
      "desktop",
      new Bible({ ...corpus, translation: "CSB" } as Corpus),
    ),
  ).toThrow();
});
it("assigns one of three stable UUID-based copy variants without measuring other attributes", () => {
  for (let i = 0; i < 3; i++) {
    const id = `00000000-0000-4000-8000-00000000000${i}`;
    const index = starterVariant(id);
    expect(index).toBe(Number(BigInt("0x" + id.replaceAll("-", "")) % 3n));
    expect(welcomeCopy[index]).toBeTruthy();
    expect(starterVariant(id)).toBe(index);
  }
  expect(new Set(welcomeCopy).size).toBe(3);
  const profile = createDeviceProfile("tablet");
  expect(profile.id).toMatch(/^[\da-f-]{36}$/);
  expect(profile.starterVariant).toBe(starterVariant(profile.id));
  expect(profile.formFactor).toBe("tablet");
});
it("requires hydration at the caller and skips any existing journey or completed onboarding", () => {
  expect(needsJourneyWelcome(defaults)).toBe(true);
  const plan = starterPlanFromIntent("prayer", "desktop", bible);
  expect(needsJourneyWelcome({ ...defaults, plans: [plan] })).toBe(false);
  expect(needsJourneyWelcome({ ...defaults, activeId: plan.id })).toBe(false);
  expect(
    needsJourneyWelcome({
      ...defaults,
      journeyOnboarding: { completedAt: new Date().toISOString() },
    }),
  ).toBe(false);
  expect(needsJourneyWelcome({ ...defaults, setupSeen: true })).toBe(true);
});
