import "dotenv/config";
import { Worker } from "bullmq";
import { logger, queueNames } from "@pr-guard/shared";
import { processAnalysisJob } from "./analysis-worker";
import { processCommentPublishJob } from "./comment-worker";
import { processInstallationSyncJob } from "./installation-worker";
import { redisConnection } from "./queues";

const workers = [
  new Worker(queueNames.analysis, processAnalysisJob, {
    connection: redisConnection,
    concurrency: 2
  }),
  new Worker(queueNames.commentPublish, processCommentPublishJob, {
    connection: redisConnection,
    concurrency: 3
  }),
  new Worker(queueNames.installationSync, processInstallationSyncJob, {
    connection: redisConnection,
    concurrency: 1
  })
];

for (const worker of workers) {
  worker.on("completed", (job) => {
    logger.info({ queue: worker.name, jobId: job.id }, "Job completed");
  });
  worker.on("failed", (job, error) => {
    logger.error({ queue: worker.name, jobId: job?.id, error }, "Job failed");
  });
}

async function shutdown(signal: string) {
  logger.info({ signal }, "Shutting down PR Guard worker");
  await Promise.all(workers.map((worker) => worker.close()));
  await redisConnection.quit();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

logger.info("PR Guard worker started");
