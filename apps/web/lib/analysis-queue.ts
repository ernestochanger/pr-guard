import { prisma } from "@pr-guard/db";
import { pullRequestAnalysisJobSchema } from "@pr-guard/shared";
import { toPrismaJson } from "@/lib/json";
import { getAnalysisQueue } from "@/lib/queues";

export async function ensureAnalysisJobQueued(analysisId: string): Promise<{
  queued: boolean;
  jobId: string | null;
}> {
  const analysis = await prisma.pullRequestAnalysis.findUniqueOrThrow({
    where: { id: analysisId },
    include: {
      attempts: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { queueTasks: true }
      }
    }
  });

  if (analysis.status !== "QUEUED") {
    return { queued: false, jobId: null };
  }

  const attempt = analysis.attempts[0];
  if (!attempt) {
    throw new Error(`Analysis ${analysis.id} has no attempt to queue.`);
  }

  const queue = getAnalysisQueue();
  const expectedJobId = attempt.queueJobId ?? `analysis:${analysis.id}:${attempt.id}`;
  const existingJob = await queue.getJob(expectedJobId);
  if (existingJob) {
    return { queued: false, jobId: String(existingJob.id) };
  }

  const payload = pullRequestAnalysisJobSchema.parse({
    analysisId: analysis.id,
    attemptId: attempt.id,
    repositoryId: analysis.repositoryId,
    pullRequestId: analysis.pullRequestId,
    reason: attempt.reason
  });
  const job = await queue.add("analyze-pr", payload, {
    jobId: expectedJobId
  });

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
      kind: "analysis",
      status: "queued",
      payload: toPrismaJson(payload),
      analysisAttemptId: attempt.id
    }
  });

  return { queued: true, jobId: String(job.id) };
}
