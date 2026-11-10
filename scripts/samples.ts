import { writeFile, mkdir } from "node:fs/promises";
import { getBible } from "../lib/bible/server";
import { buildPlan } from "../lib/ai/orchestrator";
async function main() {
  const bible = await getBible("WEB");
  await mkdir("data/sample-plans", { recursive: true });
  for (const [name, prompt] of [
    [
      "anxiety-at-work",
      "I feel anxious about a decision at work and need gentle steps",
    ],
    ["grief", "I am grieving a loss and want room to lament"],
    [
      "forgiveness",
      "Help me release resentment and practice forgiveness with wise boundaries",
    ],
  ]) {
    const plan = buildPlan({ prompt, days: 7, translation: "CSB" }, bible);
    await writeFile(
      `data/sample-plans/${name}.json`,
      JSON.stringify(plan, null, 2),
    );
  }
  console.log("Wrote three distinct, validated sample journeys.");
}
main();
