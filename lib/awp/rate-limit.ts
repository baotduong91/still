import { AppError } from "./errors";
import { db } from "@/lib/db/client";
const buckets = new Map<string, { count: number; expires: number }>();
export async function rateLimit(owner: string, now = Date.now()) {
  const window = Math.floor(now / 60000);
  const key = `${owner}:${window}`;
  if (process.env.DATABASE_URL) {
    const row = await db().rateLimit.upsert({
      where: { key },
      create: { key, count: 1, expiresAt: new Date(now + 120000) },
      update: { count: { increment: 1 } },
    });
    if (row.count > 120)
      throw new AppError("RATE_LIMITED", "Request limit reached.");
    await db().rateLimit.deleteMany({
      where: { expiresAt: { lt: new Date(now) } },
    });
    return;
  }
  for (const [k, b] of buckets) if (b.expires <= now) buckets.delete(k);
  const bucket = buckets.get(key) ?? { count: 0, expires: now + 60000 };
  bucket.count++;
  buckets.set(key, bucket);
  if (bucket.count > 120)
    throw new AppError("RATE_LIMITED", "Request limit reached.");
}
