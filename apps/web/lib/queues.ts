import { Queue } from "bullmq";
import IORedis from "ioredis";
import { getRedisEnv, queueNames } from "@pr-guard/shared";

let connection: IORedis | null = null;
let analysisQueue: Queue | null = null;
let installationSyncQueue: Queue | null = null;

function getConnection() {
  if (!connection) {
    const env = getRedisEnv();
    connection = new IORedis(env.REDIS_URL, {
      maxRetriesPerRequest: null
    });
  }
  return connection;
}

export function getAnalysisQueue() {
  if (!analysisQueue) {
    analysisQueue = new Queue(queueNames.analysis, {
      connection: getConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 500
      }
    });
  }
  return analysisQueue;
}

export function getInstallationSyncQueue() {
  if (!installationSyncQueue) {
    installationSyncQueue = new Queue(queueNames.installationSync, {
      connection: getConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 500
      }
    });
  }
  return installationSyncQueue;
}
