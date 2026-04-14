import { prisma } from "@pr-guard/db";
import { logger, pullRequestAnalysisJobSchema } from "@pr-guard/shared";
import { analysisQueue } from "./queues";
import { toPrismaJson } from "./json";

export async function recoverQueuedAnalyses(): Promise<void> {
  const queuedAnalyses = await prisma.pullRequestAnalysis.findMany({
    where: { status: "QUEUED" },
    include: {
      attempts: {
        orderBy: { createdAt: "desc" },
        take: 1
      }
    },
    orderBy: { createdAt: "asc" }
  });

  let recovered = 0;

  for (const analysis of queuedAnalyses) {
    const attempt = analysis.attempts[0];
    if (!attempt || attempt.status !== "QUEUED") {
      continue;
    }

    const jobId = attempt.queueJobId ?? `analysis:${analysis.id}:${attempt.id}`;
    const existingJob = await analysisQueue.getJob(jobId);
    if (existingJob) {
      continue;
    }

    const payload = pullRequestAnalysisJobSchema.parse({
      analysisId: analysis.id,
      attemptId: attempt.id,
      repositoryId: analysis.repositoryId,
      pullRequestId: analysis.pullRequestId,
      reason: attempt.reason
    });
    const job = await analysisQueue.add("analyze-pr", payload, { jobId });

    await prisma.analysisAttempt.update({
      where: { id: attempt.id },
      data: { queueJobId: String(job.id) }
    });
    await prisma.queueTask.upsert({
      where: {
        queueName_jobId: { queueName: job.queueName, jobId: String(job.id) }
      },
      update: {
        status: "queued",
        payload: toPrismaJson(payload),
        analysisAttemptId: attempt.id,
        error: null
      },
      create: {
        queueName: job.queueName,
        jobId: String(job.id),
        kind: "analysis-recovery",
        status: "queued",
        payload: toPrismaJson(payload),
        analysisAttemptId: attempt.id
      }
    });

    recovered += 1;
  }

  if (recovered > 0) {
    logger.info({ recovered }, "Recovered queued analyses with missing BullMQ jobs");
  }
}
