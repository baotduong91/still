import assert from "node:assert/strict";
import { db } from "../lib/db/client";
import { getBible } from "../lib/bible/server";
import { buildPlan, adaptPlan } from "../lib/ai/orchestrator";
import * as repository from "../lib/db/repository";
async function main() {
  if (!process.env.DATABASE_URL)
    throw new Error("Set DATABASE_URL to a seeded test PostgreSQL database.");
  const owner = `verification-${crypto.randomUUID()}`;
  try {
    assert.equal(
      await db().scripture.count({ where: { translation: "WEB" } }),
      31103,
    );
    const bible = await getBible("CSB");
    assert.equal(bible.corpus.translation, "WEB");
    const plan = buildPlan(
      { prompt: "Help me with forgiveness and resentment" },
      bible,
    );
    await repository.savePlan(owner, plan);
    assert.equal(
      (await repository.getPlan(owner, plan.id)).days[0].passage.text,
      plan.days[0].passage.text,
    );
    await assert.rejects(repository.getPlan(`${owner}-other`, plan.id));
    const adapted = adaptPlan(plan, 1, "I need a gentler pace");
    await repository.savePlan(owner, adapted, 0);
    await assert.rejects(repository.savePlan(owner, adapted, 0));
    const entry = {
      id: crypto.randomUUID(),
      text: "A verification-only entry.",
      createdAt: new Date().toISOString(),
    };
    const results = await Promise.all([
      repository.saveJournal(owner, entry),
      repository.saveJournal(owner, entry),
    ]);
    assert.deepEqual(results[0], results[1]);
    assert.equal((await repository.listJournal(owner)).length, 1);
    console.log(
      "PostgreSQL verified: exact corpus, plan persistence, owner isolation, optimistic conflict, concurrent journal idempotency.",
    );
  } finally {
    await db().plan.deleteMany({ where: { owner } });
    await db().journal.deleteMany({ where: { owner } });
    await db().$disconnect();
  }
}
main();
