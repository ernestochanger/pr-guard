import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getDatabaseEnv } from "@pr-guard/shared";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const env = getDatabaseEnv();

const adapter = new PrismaPg({
  connectionString: env.DATABASE_URL
});

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: ["error", "warn"]
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
