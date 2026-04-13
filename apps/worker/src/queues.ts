import { Queue } from "bullmq";
import IORedis from "ioredis";
import { getRuntimeEnv, queueNames } from "@pr-guard/shared";

const env = getRuntimeEnv();

export const redisConnection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null
});

export const analysisQueue = new Queue(queueNames.analysis, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 500
  }
});

export const commentPublishQueue = new Queue(queueNames.commentPublish, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 3000 },
    removeOnComplete: 100,
    removeOnFail: 500
  }
});

export const installationSyncQueue = new Queue(queueNames.installationSync, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 500
  }
});
