import type { Job } from "bullmq";
import { buildPrSummaryMarkdown } from "@pr-guard/analysis";
import { emitRealtimeEvent, prisma } from "@pr-guard/db";
import { createInstallationOctokit, publishOrUpdateManagedComment } from "@pr-guard/github";
import { commentPublishJobSchema, logger } from "@pr-guard/shared";
import { errorMessage, toPrismaJson } from "./json";

export async function processCommentPublishJob(job: Job) {
  const data = commentPublishJobSchema.parse(job.data);
  let queueTaskStatus = "completed";
  let queueTaskError: string | null = null;
  const analysis = await prisma.pullRequestAnalysis.findUniqueOrThrow({
    where: { id: data.analysisId },
    include: {
      repository: {
        include: { installation: true }
      },
      pullRequest: true,
      findings: {
        where: { surfaced: true },
        orderBy: [{ severity: "desc" }, { confidence: "desc" }]
      },
      attempts: true,
      publishedComment: true
    }
  });
  const attempt = analysis.attempts.find((item) => item.id === data.attemptId);

  await prisma.queueTask.upsert({
    where: { queueName_jobId: { queueName: job.queueName, jobId: String(job.id) } },
    update: { status: "running", attemptsMade: job.attemptsMade },
    create: {
      queueName: job.queueName,
      jobId: String(job.id),
      kind: "comment-publish",
      status: "running",
      payload: toPrismaJson(data),
      analysisAttemptId: data.attemptId
    }
  });

  const reviewerFailures = await prisma.reviewerRun.findMany({
    where: { attemptId: data.attemptId, status: "FAILED" },
    select: { reviewerType: true }
  });

  const body =
    analysis.summary ??
    buildPrSummaryMarkdown({
      status: analysis.status,
      provider: analysis.aiProvider,
      findings: analysis.findings,
      allFindingsCount: analysis.totalFindings,
      overallSeverity: analysis.overallSeverity,
      partial: analysis.status === "PARTIAL",
      reviewerFailures: reviewerFailures.map((run) => run.reviewerType),
      supportedFiles: analysis.supportedFiles,
      ignoredFiles: analysis.ignoredFiles,
      truncated: false
    });

  try {
    const octokit = await createInstallationOctokit(
      analysis.repository.installation.githubInstallationId
    );
    const result = await publishOrUpdateManagedComment({
      octokit,
      fullName: analysis.repository.fullName,
      pullNumber: analysis.pullRequest.number,
      body,
      previousCommentId: analysis.publishedComment?.githubCommentId
    });

    const published = await prisma.publishedComment.upsert({
      where: { analysisId: analysis.id },
      update: {
        githubCommentId: result.commentId,
        status: result.status,
        body,
        error: null,
        lastPublishedAt: new Date()
      },
      create: {
        analysisId: analysis.id,
        githubCommentId: result.commentId,
        status: result.status,
        body,
        lastPublishedAt: new Date()
      }
    });

    await prisma.publishedCommentLog.create({
      data: {
        publishedCommentId: published.id,
        attemptId: attempt?.id,
        githubCommentId: result.commentId,
        status: result.status,
        body
      }
    });

    await emitRealtimeEvent({
      type: "comment.updated",
      repositoryId: analysis.repositoryId,
      analysisId: analysis.id,
      payload: { status: result.status, commentId: result.commentId.toString() }
    });
  } catch (error) {
    queueTaskStatus = "failed";
    queueTaskError = errorMessage(error);
    logger.error({ error, analysisId: analysis.id }, "Failed to publish PR comment");
    const published = await prisma.publishedComment.upsert({
      where: { analysisId: analysis.id },
      update: { status: "FAILED", error: errorMessage(error), body },
      create: {
        analysisId: analysis.id,
        status: "FAILED",
        error: errorMessage(error),
        body
      }
    });
    await prisma.publishedCommentLog.create({
      data: {
        publishedCommentId: published.id,
        attemptId: attempt?.id,
        status: "FAILED",
        body,
        error: errorMessage(error)
      }
    });
    throw error;
  } finally {
    await prisma.queueTask.updateMany({
      where: { queueName: job.queueName, jobId: String(job.id) },
      data: { status: queueTaskStatus, attemptsMade: job.attemptsMade, error: queueTaskError }
    });
  }
}
