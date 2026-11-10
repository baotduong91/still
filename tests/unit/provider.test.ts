import { beforeEach, describe, it, expect, vi } from "vitest";
const generate = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai/providers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/providers")>();
  return {
    ...actual,
    getProvider: async () => ({ name: "mock-model", generate }),
  };
});
import { generatePlan, chat } from "@/lib/ai/server";
import { getBible } from "@/lib/bible/server";
beforeEach(() => {
  generate.mockReset();
  delete process.env.DATABASE_URL;
});
describe("Model enhancement boundary", () => {
  it("keeps citations out of model control while validating a full plan", async () => {
    generate.mockImplementation(async (_schema, _system, prompt: string) => {
      const request = JSON.parse(prompt);
      return {
        days: request.days.map((d: { number: number }) => ({
          number: d.number,
          reflection: `On day ${d.number}, attend to the distinct objective and bring your stated intention into an honest response to this passage.`,
          connection: `Practice day ${d.number} by relating the passage to the particular concern you brought to this journey.`,
          questions: [
            `What do you notice during day ${d.number} of this practice?`,
            `What response feels honest and manageable on day ${d.number}?`,
          ],
          prayer: `God, help me listen with humility during day ${d.number} and respond with patience and care. Amen.`,
          action: `On day ${d.number}, record a fresh observation and choose one small step related to the reading.`,
          interpretation:
            "This is devotional interpretation. Christian traditions may understand details differently.",
        })),
      };
    });
    const plan = await generatePlan({
      prompt: "I need patience",
      provider: "cloud",
    });
    const bible = await getBible("WEB");
    expect(plan.provider).toBe("mock-model");
    expect(plan.days.every((d) => bible.validate(d.passage))).toBe(true);
    expect(generate).toHaveBeenCalledOnce();
  });
  it("rejects model-generated citations before saving", async () => {
    generate.mockResolvedValue({
      answer: "This is guaranteed according to Imaginary 8:2",
      interpretation: "An interpretation rather than an exact quotation.",
    });
    await expect(
      chat({ question: "How can I deal with anxiety?", provider: "cloud" }),
    ).rejects.toMatchObject({ code: "PLAN_GENERATION_FAILED" });
  });
  it("returns retrieved citations alongside mock model commentary", async () => {
    generate.mockResolvedValue({
      answer:
        "The selected passages invite prayer and attention to the present without promising that all uncertainty will disappear.",
      interpretation:
        "This is an interpretation of the provided texts, not a quotation.",
    });
    const answer = await chat({
      question: "How can I deal with anxiety?",
      provider: "ollama",
    });
    expect(answer.citations).toHaveLength(3);
    expect(answer.provider).toBe("mock-model");
    expect(answer.citations[0].translation).toBe("WEB");
  });
  it("abstains without sending unsupported questions to a model", async () => {
    const answer = await chat({
      question: "What is the best smartphone?",
      provider: "cloud",
    });
    expect(answer.citations).toHaveLength(0);
    expect(generate).not.toHaveBeenCalled();
  });
});
