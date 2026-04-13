import IORedis from "ioredis";
import { prisma } from "@pr-guard/db";
import { getRuntimeEnv } from "@pr-guard/shared";
import { ok, fail } from "@/lib/api";

export async function GET() {
  try {
    const env = getRuntimeEnv();
    await prisma.$queryRaw`SELECT 1`;
    const redis = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: 1, lazyConnect: true });
    await redis.connect();
    await redis.ping();
    await redis.quit();

    return ok({
      status: "ok",
      database: "ok",
      redis: "ok",
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return fail(error);
  }
}
