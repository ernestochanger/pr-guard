import {
  emitRealtimeEvent,
  getOrCreateAppSettings,
  getOrCreateRepositorySettings,
  prisma
} from "@pr-guard/db";
import {
  githubInstallationRepositoriesWebhookSchema,
  githubInstallationWebhookSchema,
  githubPullRequestWebhookSchema,
  mapPullRequestAction,
  verifyWebhookSignature
} from "@pr-guard/github";
import {
  getRuntimeEnv,
  installationSyncJobSchema,
  logger,
  pullRequestAnalysisJobSchema
} from "@pr-guard/shared";
import { createAttemptForAnalysis } from "@pr-guard/db";
import { fail, ok } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { getAnalysisQueue, getInstallationSyncQueue } from "@/lib/queues";
import { errorMessage, toPrismaJson } from "@/lib/json";
import { ensureAnalysisJobQueued } from "@/lib/analysis-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function enqueueAnalysis(input: {
  repositoryId: string;
  pullRequestId: string;
  headSha: string;
  sourceEventType: "OPENED" | "REOPENED" | "SYNCHRONIZE";
}) {
  const repository = await prisma.repository.findUniqueOrThrow({
    where: { id: input.repositoryId },
    include: { settings: true }
  });
  const settings = repository.settings ?? (await getOrCreateRepositorySettings(repository.id));
  const pullRequest = await prisma.pullRequest.findUniqueOrThrow({
    where: { id: input.pullRequestId },
    select: { aiProvider: true }
  });

  const activeExisting = await prisma.pullRequestAnalysis.findFirst({
    where: {
      pullRequestId: input.pullRequestId,
      headSha: input.headSha,
      status: { in: ["QUEUED", "RUNNING"] }
    }
  });
  if (activeExisting) {
    const ensured = await ensureAnalysisJobQueued(activeExisting.id);
    return { analysisId: activeExisting.id, queued: ensured.queued };
  }

  const previousSameHead = await prisma.pullRequestAnalysis.findFirst({
    where: {
      pullRequestId: input.pullRequestId,
      headSha: input.headSha,
      status: { in: ["COMPLETED", "PARTIAL", "FAILED", "SKIPPED"] }
    },
    orderBy: { createdAt: "desc" }
  });
  if (previousSameHead) {
    return { analysisId: previousSameHead.id, queued: false };
  }

  const { analysis, attempt } = await createAttemptForAnalysis({
    repositoryId: input.repositoryId,
    pullRequestId: input.pullRequestId,
    headSha: input.headSha,
    aiProvider: pullRequest.aiProvider,
    minimumSeverity: settings.minimumSeverity,
    sourceEventType: input.sourceEventType
  });

  const jobPayload = pullRequestAnalysisJobSchema.parse({
    analysisId: analysis.id,
    attemptId: attempt.id,
    repositoryId: input.repositoryId,
    pullRequestId: input.pullRequestId,
    reason: input.sourceEventType
  });
  const job = await getAnalysisQueue().add("analyze-pr", jobPayload, {
    jobId: `analysis:${analysis.id}:${attempt.id}`
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
      payload: toPrismaJson(jobPayload),
      analysisAttemptId: attempt.id
    },
    create: {
      queueName: job.queueName,
      jobId: String(job.id),
      kind: "analysis",
      status: "queued",
      payload: toPrismaJson(jobPayload),
      analysisAttemptId: attempt.id
    }
  });
  await emitRealtimeEvent({
    type: "analysis.created",
    repositoryId: input.repositoryId,
    analysisId: analysis.id,
    payload: { status: "QUEUED" }
  });
  return { analysisId: analysis.id, queued: true };
}

export async function POST(request: Request) {
  const env = getRuntimeEnv();
  const deliveryId = request.headers.get("x-github-delivery");
  const eventName = request.headers.get("x-github-event");
  const signature = request.headers.get("x-hub-signature-256");

  try {
    rateLimit(`webhook:${request.headers.get("x-forwarded-for") ?? "local"}`, 120, 60_000);

    if (!deliveryId || !eventName) {
      return new Response("Missing GitHub webhook headers.", { status: 400 });
    }

    const rawBody = await request.text();
    if (
      !verifyWebhookSignature({
        secret: env.GITHUB_WEBHOOK_SECRET,
        payload: rawBody,
        signatureHeader: signature
      })
    ) {
      return new Response("Invalid signature.", { status: 401 });
    }

    const payload = JSON.parse(rawBody) as unknown;
    const existing = await prisma.webhookEvent.findUnique({ where: { deliveryId } });
    if (existing) {
      return ok({ duplicate: true });
    }

    const createdEvent = await prisma.webhookEvent.create({
      data: {
        deliveryId,
        eventName,
        action:
          typeof payload === "object" && payload && "action" in payload
            ? String((payload as { action?: unknown }).action ?? "")
            : null,
        payload: toPrismaJson(payload)
      }
    });

    await emitRealtimeEvent({
      type: "webhook.received",
      payload: { deliveryId, eventName }
    });

    if (eventName === "pull_request") {
      const parsed = githubPullRequestWebhookSchema.safeParse(payload);
      if (!parsed.success) {
        await prisma.webhookEvent.update({
          where: { id: createdEvent.id },
          data: { ignored: true, error: parsed.error.message, processedAt: new Date() }
        });
        return ok({ ignored: true });
      }

      const repoPayload = parsed.data.repository;
      const repository = await prisma.repository.findUnique({
        where: { githubRepositoryId: BigInt(repoPayload.id) }
      });

      await prisma.webhookEvent.update({
        where: { id: createdEvent.id },
        data: {
          githubInstallationId: BigInt(parsed.data.installation.id),
          githubRepositoryId: BigInt(repoPayload.id),
          repositoryFullName: repoPayload.full_name
        }
      });

      if (!repository || repository.connectionStatus !== "CONNECTED") {
        await prisma.webhookEvent.update({
          where: { id: createdEvent.id },
          data: { ignored: true, processedAt: new Date() }
        });
        return ok({ ignored: true, reason: "repository_not_connected" });
      }

      const pull = parsed.data.pull_request;
      const appSettings = await getOrCreateAppSettings();
      const pullRequest = await prisma.pullRequest.upsert({
        where: {
          repositoryId_number: {
            repositoryId: repository.id,
            number: pull.number
          }
        },
        update: {
          githubPullRequestId: BigInt(pull.id),
          title: pull.title,
          authorLogin: pull.user?.login ?? null,
          headSha: pull.head.sha,
          baseSha: pull.base.sha ?? null,
          headRef: pull.head.ref ?? null,
          baseRef: pull.base.ref ?? null,
          state: pull.state,
          htmlUrl: pull.html_url,
          lastWebhookEventAt: new Date()
        },
        create: {
          repositoryId: repository.id,
          githubPullRequestId: BigInt(pull.id),
          number: pull.number,
          title: pull.title,
          authorLogin: pull.user?.login ?? null,
          headSha: pull.head.sha,
          baseSha: pull.base.sha ?? null,
          headRef: pull.head.ref ?? null,
          baseRef: pull.base.ref ?? null,
          state: pull.state,
          htmlUrl: pull.html_url,
          aiProvider: appSettings.defaultAiProvider,
          lastWebhookEventAt: new Date()
        }
      });

      const queued = await enqueueAnalysis({
        repositoryId: repository.id,
        pullRequestId: pullRequest.id,
        headSha: pull.head.sha,
        sourceEventType: mapPullRequestAction(parsed.data.action)
      });

      await prisma.webhookEvent.update({
        where: { id: createdEvent.id },
        data: { processedAt: new Date() }
      });
      return ok({ queued });
    }

    if (eventName === "installation" || eventName === "installation_repositories") {
      const parsed =
        eventName === "installation"
          ? githubInstallationWebhookSchema.safeParse(payload)
          : githubInstallationRepositoriesWebhookSchema.safeParse(payload);
      if (!parsed.success) {
        await prisma.webhookEvent.update({
          where: { id: createdEvent.id },
          data: { ignored: true, error: parsed.error.message, processedAt: new Date() }
        });
        return ok({ ignored: true });
      }

      const installation = await prisma.gitHubInstallation.upsert({
        where: { githubInstallationId: BigInt(parsed.data.installation.id) },
        update:
          eventName === "installation" && "account" in parsed.data.installation
            ? {
                accountLogin: parsed.data.installation.account.login,
                accountType: parsed.data.installation.account.type,
                targetType: parsed.data.installation.target_type,
                permissions: toPrismaJson(parsed.data.installation.permissions ?? {})
              }
            : {},
        create: {
          githubInstallationId: BigInt(parsed.data.installation.id),
          accountLogin:
            eventName === "installation" && "account" in parsed.data.installation
              ? parsed.data.installation.account.login
              : "unknown",
          accountType:
            eventName === "installation" && "account" in parsed.data.installation
              ? parsed.data.installation.account.type
              : null,
          targetType:
            eventName === "installation" && "target_type" in parsed.data.installation
              ? parsed.data.installation.target_type
              : null,
          permissions:
            eventName === "installation" && "permissions" in parsed.data.installation
              ? toPrismaJson(parsed.data.installation.permissions ?? {})
              : undefined
        }
      });

      const jobPayload = installationSyncJobSchema.parse({
        installationId: installation.id,
        githubInstallationId: parsed.data.installation.id,
        action: parsed.data.action
      });
      const job = await getInstallationSyncQueue().add("sync-installation", jobPayload, {
        jobId: `installation:${parsed.data.installation.id}:${deliveryId}`
      });
      await prisma.queueTask.upsert({
        where: {
          queueName_jobId: { queueName: job.queueName, jobId: String(job.id) }
        },
        update: { status: "queued", payload: toPrismaJson(jobPayload) },
        create: {
          queueName: job.queueName,
          jobId: String(job.id),
          kind: "installation-sync",
          status: "queued",
          payload: toPrismaJson(jobPayload)
        }
      });

      await prisma.webhookEvent.update({
        where: { id: createdEvent.id },
        data: {
          githubInstallationId: BigInt(parsed.data.installation.id),
          processedAt: new Date()
        }
      });
      return ok({ queued: true });
    }

    await prisma.webhookEvent.update({
      where: { id: createdEvent.id },
      data: { ignored: true, processedAt: new Date() }
    });
    return ok({ ignored: true });
  } catch (error) {
    logger.error({ error, deliveryId, eventName }, "Webhook processing failed");
    if (deliveryId) {
      await prisma.webhookEvent.updateMany({
        where: { deliveryId },
        data: { error: errorMessage(error), processedAt: new Date() }
      });
    }
    return fail(error);
  }
}
