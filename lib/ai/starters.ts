import type { Bible } from "@/lib/bible";
import type { DeviceProfile } from "@/lib/client/store";
import { themes } from "./themes";
import { buildGuidedPlan } from "./guided";
export const starterIntents = [
  ...Object.keys(themes).map((id) => ({
    id,
    label:
      id === "decision-making"
        ? "Decisions"
        : id[0].toUpperCase() + id.slice(1),
  })),
  { id: "reference", label: "John 3:16" },
];
export function starterDays(formFactor: DeviceProfile["formFactor"]) {
  return formFactor === "desktop" ? 7 : 5;
}
export function starterPlanFromIntent(
  intent: string,
  formFactor: DeviceProfile["formFactor"],
  bible: Bible,
) {
  if (bible.corpus.translation !== "WEB")
    throw new Error("Starter journeys need the local WEB Bible.");
  if (!starterIntents.some((i) => i.id === intent))
    throw new Error("Choose one of the starter intentions.");
  const prompt =
    intent === "reference"
      ? "Study John 3:16 at a gentle pace"
      : `I want a gentle daily practice for ${intent === "decision-making" ? "decisions and wisdom" : intent}`;
  return buildGuidedPlan(
    {
      prompt,
      days: starterDays(formFactor),
      translation: "WEB",
      provider: "curated",
    },
    bible,
  );
}
