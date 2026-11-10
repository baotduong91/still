import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { db } from "./client";
import { Plan, Journal, type PlanType, type JournalType } from "@/lib/schemas";
import { AppError } from "@/lib/awp/errors";
import type { Prisma } from "@prisma/client";
type Store = { plans: PlanType[]; journals: JournalType[] };
const root = () => path.resolve(process.env.DATA_DIR ?? ".data");
const queues = new Map<string, Promise<unknown>>();
async function local<T>(
  owner: string,
  fn: (store: Store) => T,
  write = false,
): Promise<T> {
  const previous = queues.get(owner) ?? Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(async () => {
      await mkdir(root(), { recursive: true, mode: 0o700 });
      const file = path.join(
        root(),
        `${createHash("sha256").update(owner).digest("hex")}.json`,
      );
      let store: Store = { plans: [], journals: [] };
      try {
        store = JSON.parse(await readFile(file, "utf8"));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      }
      const result = fn(store);
      if (write) {
        const temporary = `${file}.${crypto.randomUUID()}.tmp`;
        await writeFile(temporary, JSON.stringify(store), { mode: 0o600 });
        await rename(temporary, file);
      }
      return result;
    });
  queues.set(owner, next);
  try {
    return await next;
  } finally {
    if (queues.get(owner) === next) queues.delete(owner);
  }
}
const json = (v: unknown) => v as Prisma.InputJsonValue;
export async function listPlans(owner: string): Promise<PlanType[]> {
  if (process.env.DATABASE_URL)
    return (
      await db().plan.findMany({
        where: { owner },
        orderBy: { createdAt: "desc" },
      })
    ).map((p) => Plan.parse(p.data));
  return local(owner, (s) => s.plans);
}
export async function getPlan(owner: string, id: string) {
  const plan = (await listPlans(owner)).find((p) => p.id === id);
  if (!plan)
    throw new AppError(
      "NOT_FOUND",
      "No plan exists with that ID in this session.",
    );
  return plan;
}
export async function savePlan(
  owner: string,
  plan: PlanType,
  expected?: number,
) {
  Plan.parse(plan);
  if (process.env.DATABASE_URL) {
    if (expected === undefined)
      await db().plan.create({
        data: { id: plan.id, owner, revision: plan.revision, data: json(plan) },
      });
    else {
      const result = await db().plan.updateMany({
        where: { id: plan.id, owner, revision: expected },
        data: { revision: plan.revision, data: json(plan) },
      });
      if (result.count !== 1)
        throw new AppError("CONFLICT", "Plan changed in another request.");
    }
  } else
    await local(
      owner,
      (s) => {
        const index = s.plans.findIndex((p) => p.id === plan.id);
        if (
          expected !== undefined &&
          (index < 0 || s.plans[index].revision !== expected)
        )
          throw new AppError("CONFLICT", "Plan changed in another request.");
        if (index < 0) s.plans.unshift(plan);
        else s.plans[index] = plan;
      },
      true,
    );
  return plan;
}
export async function saveJournal(owner: string, entry: JournalType) {
  Journal.parse(entry);
  if (process.env.DATABASE_URL) {
    const row = await db().journal.upsert({
      where: { id: entry.id },
      create: { id: entry.id, owner, data: json(entry) },
      update: {},
    });
    if (row.owner !== owner)
      throw new AppError("NOT_FOUND", "Entry not found.");
    return Journal.parse(row.data);
  } else
    return local(
      owner,
      (s) => {
        const existing = s.journals.find((j) => j.id === entry.id);
        if (existing) return existing;
        s.journals.unshift(entry);
        return entry;
      },
      true,
    );
  return entry;
}
export async function listJournal(owner: string) {
  if (process.env.DATABASE_URL)
    return (
      await db().journal.findMany({
        where: { owner },
        orderBy: { createdAt: "desc" },
      })
    ).map((j) => Journal.parse(j.data));
  return local(owner, (s) => s.journals);
}
