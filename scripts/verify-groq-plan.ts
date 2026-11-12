export {};
// Explicit opt-in smoke test. Uses a synthetic goal, never reads or saves a
// personal plan/journal, and prints only verification metadata. Run with
// GROQ_API_KEY in the environment; do not pass the key in command arguments.
if (!process.env.GROQ_API_KEY?.trim()) {
  console.error(
    "GROQ_API_KEY is not available to this process. No model request was made.",
  );
  process.exit(1);
}
process.env.DATABASE_URL = "";
const { generatePlan } = await import("../lib/ai/server");
const { getBible } = await import("../lib/bible/server");
const started = Date.now();
try {
  const plan = await generatePlan(
    {
      prompt:
        "A seven-day journey of lament: bring hard questions and sorrow to God with honesty and hope, without rushing to easy answers.",
      days: 7,
      translation: "WEB",
      provider: "cloud",
    },
    { signal: AbortSignal.timeout(250_000) },
  );
  const bible = await getBible("WEB");
  const verified =
    plan.provider === "groq" &&
    plan.days.length === 7 &&
    plan.days.every(
      (day, i) => day.number === i + 1 && bible.validate(day.passage),
    ) &&
    new Set(plan.days.map((day) => day.action)).size === 7;
  console.log(
    JSON.stringify({
      verified,
      provider: plan.provider,
      days: plan.days.length,
      elapsedMs: Date.now() - started,
      exactScripture: plan.days.every((day) => bible.validate(day.passage)),
    }),
  );
  if (!verified) process.exitCode = 1;
} catch {
  console.error(
    JSON.stringify({
      verified: false,
      error: "The live seven-day check did not complete.",
      elapsedMs: Date.now() - started,
    }),
  );
  process.exitCode = 1;
}
