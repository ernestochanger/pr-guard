import type { Job } from "bullmq";
import {
  buildPrSummaryMarkdown,
  consolidateFindings,
  formatDiffContextForPrompt,
  normalizeAiFindings,
  normalizeDiffContext,
  runDeterministicRules,
  type ChangedFileInput
} from "@pr-guard/analysis";
import { generateStructuredReview } from "@pr-guard/ai";
import {
  emitRealtimeEvent,
  prisma,
  storeConsolidatedFindings,
  transitionAnalysis
} from "@pr-guard/db";
import { createInstallationOctokit, getPullRequest, listPullRequestFiles } from "@pr-guard/github";
import {
  commentPublishJobSchema,
  getRuntimeEnv,
  logger,
  pullRequestAnalysisJobSchema
} from "@pr-guard/shared";
import { commentPublishQueue } from "./queues";
import { errorMessage, toPrismaJson } from "./json";

const aiReviewerOrder = ["QUALITY", "SECURITY", "ARCHITECTURE"] as const;

export async function processAnalysisJob(job: Job) {
  const data = pullRequestAnalysisJobSchema.parse(job.data);
  let queueTaskStatus = "completed";
  let queueTaskError: string | null = null;
  await prisma.queueTask.upsert({
    where: { queueName_jobId: { queueName: job.queueName, jobId: String(job.id) } },
    update: { status: "running", attemptsMade: job.attemptsMade },
    create: {
      queueName: job.queueName,
      jobId: String(job.id),
      kind: "analysis",
      status: "running",
      payload: toPrismaJson(data),
      analysisAttemptId: data.attemptId
    }
  });

  const env = getRuntimeEnv();
  const analysis = await prisma.pullRequestAnalysis.findUniqueOrThrow({
    where: { id: data.analysisId },
    include: {
      repository: {
        include: {
          installation: true,
          settings: true
        }
      },
      pullRequest: true,
      attempts: true
    }
  });
  const attempt = analysis.attempts.find((item) => item.id === data.attemptId);
  if (!attempt) {
    throw new Error(`Attempt ${data.attemptId} was not found.`);
  }

  await transitionAnalysis({
    analysisId: analysis.id,
    attemptId: attempt.id,
    status: "RUNNING"
  });
  await emitRealtimeEvent({
    type: "analysis.updated",
    repositoryId: analysis.repositoryId,
    analysisId: analysis.id,
    payload: { status: "RUNNING" }
  });

  try {
    const octokit = await createInstallationOctokit(
      analysis.repository.installation.githubInstallationId
    );
    const latestPr = await getPullRequest(
      octokit,
      analysis.repository.fullName,
      analysis.pullRequest.number
    );

    await prisma.pullRequest.update({
      where: { id: analysis.pullRequestId },
      data: {
        title: latestPr.title,
        authorLogin: latestPr.authorLogin,
        headSha: latestPr.headSha,
        baseSha: latestPr.baseSha,
        headRef: latestPr.headRef,
        baseRef: latestPr.baseRef,
        state: latestPr.state,
        htmlUrl: latestPr.htmlUrl
      }
    });

    if (latestPr.headSha !== analysis.headSha) {
      await transitionAnalysis({
        analysisId: analysis.id,
        attemptId: attempt.id,
        status: "SKIPPED",
        error: "Skipped because a newer pull request head SHA is available."
      });
      await emitRealtimeEvent({
        type: "analysis.updated",
        repositoryId: analysis.repositoryId,
        analysisId: analysis.id,
        payload: { status: "SKIPPED" }
      });
      return;
    }

    const changedFiles = (await listPullRequestFiles(
      octokit,
      analysis.repository.fullName,
      analysis.pullRequest.number
    )) satisfies ChangedFileInput[];
    const diffContext = normalizeDiffContext(changedFiles, {
      maxFiles: env.ANALYSIS_MAX_FILES,
      maxPatchChars: env.ANALYSIS_MAX_PATCH_CHARS
    });

    const deterministicRun = await prisma.reviewerRun.upsert({
      where: {
        attemptId_reviewerType: {
          attemptId: attempt.id,
          reviewerType: "DETERMINISTIC"
        }
      },
      update: {
        status: "RUNNING",
        startedAt: new Date()
      },
      create: {
        attemptId: attempt.id,
        reviewerType: "DETERMINISTIC",
        status: "RUNNING",
        startedAt: new Date()
      }
    });

    const deterministicFindings = runDeterministicRules(diffContext);
    await prisma.reviewerRun.update({
      where: { id: deterministicRun.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        rawOutput: toPrismaJson({ findings: deterministicFindings })
      }
    });

    const settings = analysis.repository.settings;
    if (!settings) {
      throw new Error("Repository settings were not found.");
    }

    const enabledAiReviewers = aiReviewerOrder.filter((reviewerType) => {
      if (reviewerType === "QUALITY") return settings.qualityEnabled;
      if (reviewerType === "SECURITY") return settings.securityEnabled;
      return settings.architectureEnabled;
    });

    const aiFindings = [];
    const reviewerRunByType = new Map<string, string>([
      ["DETERMINISTIC", deterministicRun.id]
    ]);
    const reviewerFailures: string[] = [];
    const diffPrompt = formatDiffContextForPrompt(diffContext);
    const deterministicSummaries = deterministicFindings.map(
      (finding) => `${finding.severity} ${finding.category} ${finding.filePath ?? "General"}: ${finding.title}`
    );

    if (diffContext.files.length > 0) {
      for (const reviewerType of enabledAiReviewers) {
        const reviewerRun = await prisma.reviewerRun.upsert({
          where: {
            attemptId_reviewerType: {
              attemptId: attempt.id,
              reviewerType
            }
          },
          update: {
            status: "RUNNING",
            aiProvider: settings.aiProvider,
            startedAt: new Date(),
            error: null
          },
          create: {
            attemptId: attempt.id,
            reviewerType,
            aiProvider: settings.aiProvider,
            status: "RUNNING",
            startedAt: new Date()
          }
        });
        reviewerRunByType.set(reviewerType, reviewerRun.id);

        try {
          const result = await generateStructuredReview({
            provider: settings.aiProvider,
            reviewerType,
            diffContext: diffPrompt,
            deterministicFindingSummaries: deterministicSummaries
          });
          const normalized = normalizeAiFindings(reviewerType, result.output.findings);
          aiFindings.push(...normalized);
          await prisma.reviewerRun.update({
            where: { id: reviewerRun.id },
            data: {
              status: "COMPLETED",
              completedAt: new Date(),
              summary: result.output.summary,
              rawInput: toPrismaJson({ reviewerType, diffContext: diffPrompt }),
              rawOutput: toPrismaJson({ rawText: result.rawText, output: result.output, model: result.model }),
              promptTokens: result.promptTokens,
              completionTokens: result.completionTokens
            }
          });
        } catch (error) {
          reviewerFailures.push(reviewerType);
          await prisma.reviewerRun.update({
            where: { id: reviewerRun.id },
            data: {
              status: "FAILED",
              completedAt: new Date(),
              error: errorMessage(error)
            }
          });
          logger.warn({ error, reviewerType, analysisId: analysis.id }, "AI reviewer failed");
        }
      }
    }

    const consolidated = consolidateFindings({
      deterministic: deterministicFindings,
      ai: aiFindings,
      minimumSeverity: settings.minimumSeverity,
      maxSurfaced: 15
    });
    const surfacedFingerprints = new Set(
      consolidated.surfacedFindings.map((finding) => finding.fingerprint)
    );

    await storeConsolidatedFindings({
      analysisId: analysis.id,
      attemptId: attempt.id,
      findings: consolidated.allFindings.map((finding) => ({
        reviewerRunId: reviewerRunByType.get(finding.reviewerType) ?? null,
        reviewerType: finding.reviewerType,
        category: finding.category,
        severity: finding.severity,
        title: finding.title,
        explanation: finding.explanation,
        filePath: finding.filePath,
        lineStart: finding.lineStart,
        lineEnd: finding.lineEnd,
        confidence: finding.confidence,
        fingerprint: finding.fingerprint,
        surfaced: surfacedFingerprints.has(finding.fingerprint),
        raw: toPrismaJson(finding)
      }))
    });

    const finalStatus =
      diffContext.files.length === 0 ? "SKIPPED" : reviewerFailures.length > 0 ? "PARTIAL" : "COMPLETED";
    const summary = buildPrSummaryMarkdown({
      status: finalStatus,
      provider: settings.aiProvider,
      findings: consolidated.surfacedFindings,
      allFindingsCount: consolidated.allFindings.length,
      overallSeverity: consolidated.overallSeverity,
      partial: reviewerFailures.length > 0,
      reviewerFailures,
      supportedFiles: diffContext.supportedFiles,
      ignoredFiles: diffContext.ignoredFiles,
      truncated: diffContext.truncated
    });

    await transitionAnalysis({
      analysisId: analysis.id,
      attemptId: attempt.id,
      status: finalStatus,
      summary,
      overallSeverity: consolidated.overallSeverity,
      totals: {
        totalFindings: consolidated.allFindings.length,
        surfacedFindings: consolidated.surfacedFindings.length,
        supportedFiles: diffContext.supportedFiles,
        ignoredFiles: diffContext.ignoredFiles
      }
    });

    await emitRealtimeEvent({
      type: "findings.updated",
      repositoryId: analysis.repositoryId,
      analysisId: analysis.id,
      payload: {
        status: finalStatus,
        totalFindings: consolidated.allFindings.length,
        surfacedFindings: consolidated.surfacedFindings.length
      }
    });

    const commentJob = commentPublishJobSchema.parse({
      analysisId: analysis.id,
      attemptId: attempt.id
    });
    const queued = await commentPublishQueue.add("publish-comment", commentJob, {
      jobId: `comment:${analysis.id}:${attempt.id}`
    });
    await prisma.queueTask.upsert({
      where: {
        queueName_jobId: { queueName: queued.queueName, jobId: String(queued.id) }
      },
      update: { status: "queued", payload: toPrismaJson(commentJob), analysisAttemptId: attempt.id },
      create: {
        queueName: queued.queueName,
        jobId: String(queued.id),
        kind: "comment-publish",
        status: "queued",
        payload: toPrismaJson(commentJob),
        analysisAttemptId: attempt.id
      }
    });
  } catch (error) {
    queueTaskStatus = "failed";
    queueTaskError = errorMessage(error);
    await transitionAnalysis({
      analysisId: analysis.id,
      attemptId: attempt.id,
      status: "FAILED",
      error: errorMessage(error)
    });
    await emitRealtimeEvent({
      type: "analysis.updated",
      repositoryId: analysis.repositoryId,
      analysisId: analysis.id,
      payload: { status: "FAILED", error: errorMessage(error) }
    });
    throw error;
  } finally {
    await prisma.queueTask.updateMany({
      where: { queueName: job.queueName, jobId: String(job.id) },
      data: { status: queueTaskStatus, attemptsMade: job.attemptsMade, error: queueTaskError }
    });
  }
}
