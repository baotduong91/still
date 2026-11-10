import { PrismaClient } from "@prisma/client";
const globalDB = globalThis as unknown as { prisma?: PrismaClient };
export function db() {
  if (!globalDB.prisma) globalDB.prisma = new PrismaClient();
  return globalDB.prisma;
}
