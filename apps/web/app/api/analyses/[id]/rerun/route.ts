import {
  createAttemptForAnalysis,
  emitRealtimeEvent,
  getAnalysisForUser,
  getRepositoryForUser,
  getOrCreateRepositorySettings,
  prisma
} from "@pr-guard/db";
import { createInstallationOctokit, getPullRequest } from "@pr-guard/github";
import { getRuntimeEnv, pullRequestAnalysisJobSchema } from "@pr-guard/shared";
import { ok, fail } from "@/lib/api";
import { assertSameOrigin } from "@/lib/csrf";
import { toPrismaJson } from "@/lib/json";
import { getAnalysisQueue } from "@/lib/queues";
import { rateLimit } from "@/lib/rate-limit";
import { requireUser } from "@/lib/session";
import { serializeForJson } from "@/lib/serialize";
import { ensureAnalysisJobQueued } from "@/lib/analysis-queue";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    assertSameOrigin(request);
    const { id } = await params;
    rateLimit(`rerun:${user.id}:${id}`, 10, 60_000);
    const existingAnalysis = await getAnalysisForUser(id, user.id);
    const repository = await getRepositoryForUser(existingAnalysis.repositoryId, user.id, {
      requireAdmin: true
    });

    if (repository.connectionStatus !== "CONNECTED") {
      throw new Error("Repository is not connected.");
    }

    const repositoryWithInstallation = await prisma.repository.findUniqueOrThrow({
      where: { id: repository.id },
      include: { installation: true, settings: true }
    });
    const octokit = await createInstallationOctokit(
      repositoryWithInstallation.installation.githubInstallationId
    );
    const latestPr = await getPullRequest(
      octokit,
      repositoryWithInstallation.fullName,
      existingAnalysis.pullRequest.number
    );

    const active = await prisma.pullRequestAnalysis.findFirst({
      where: {
        pullRequestId: existingAnalysis.pullRequestId,
        headSha: latestPr.headSha,
        status: { in: ["QUEUED", "RUNNING"] }
      }
    });
    if (active) {
      const ensured = await ensureAnalysisJobQueued(active.id);
      return ok(serializeForJson({ analysisId: active.id, queued: ensured.queued }));
    }

    const pullRequest = await prisma.pullRequest.update({
      where: { id: existingAnalysis.pullRequestId },
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
    const env = getRuntimeEnv();
    const settings =
      repositoryWithInstallation.settings ??
      (await getOrCreateRepositorySettings(repository.id, { aiProvider: env.DEFAULT_AI_PROVIDER }));

    const { analysis, attempt } = await createAttemptForAnalysis({
      repositoryId: repository.id,
      pullRequestId: pullRequest.id,
      headSha: latestPr.headSha,
      aiProvider: settings.aiProvider,
      minimumSeverity: settings.minimumSeverity,
      sourceEventType: "MANUAL_RERUN",
      createdByUserId: user.id
    });
    const payload = pullRequestAnalysisJobSchema.parse({
      analysisId: analysis.id,
      attemptId: attempt.id,
      repositoryId: repository.id,
      pullRequestId: pullRequest.id,
      reason: "MANUAL_RERUN"
    });
    const job = await getAnalysisQueue().add("rerun-analysis", payload, {
      jobId: `analysis:${analysis.id}:${attempt.id}`
    });
    await prisma.analysisAttempt.update({
      where: { id: attempt.id },
      data: { queueJobId: String(job.id) }
    });
    await prisma.queueTask.upsert({
      where: { queueName_jobId: { queueName: job.queueName, jobId: String(job.id) } },
      update: { status: "queued", payload: toPrismaJson(payload), analysisAttemptId: attempt.id },
      create: {
        queueName: job.queueName,
        jobId: String(job.id),
        kind: "analysis-rerun",
        status: "queued",
        payload: toPrismaJson(payload),
        analysisAttemptId: attempt.id
      }
    });
    await emitRealtimeEvent({
      type: "rerun.updated",
      repositoryId: repository.id,
      analysisId: analysis.id,
      userId: user.id,
      payload: { status: "QUEUED" }
    });

    return ok(serializeForJson({ analysisId: analysis.id, queued: true }));
  } catch (error) {
    return fail(error);
  }
}
