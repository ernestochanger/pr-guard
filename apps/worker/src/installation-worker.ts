import type { Job } from "bullmq";
import { getOrCreateRepositorySettings, prisma } from "@pr-guard/db";
import { createInstallationOctokit, listInstallationRepositories } from "@pr-guard/github";
import { installationSyncJobSchema } from "@pr-guard/shared";
import { toPrismaJson } from "./json";

export async function processInstallationSyncJob(job: Job) {
  const data = installationSyncJobSchema.parse(job.data);

  await prisma.queueTask.upsert({
    where: { queueName_jobId: { queueName: job.queueName, jobId: String(job.id) } },
    update: { status: "running", attemptsMade: job.attemptsMade },
    create: {
      queueName: job.queueName,
      jobId: String(job.id),
      kind: "installation-sync",
      status: "running",
      payload: toPrismaJson(data)
    }
  });

  const installation = await prisma.gitHubInstallation.upsert({
    where: { githubInstallationId: BigInt(data.githubInstallationId) },
    update: {
      suspendedAt: data.action === "suspend" ? new Date() : data.action === "unsuspend" ? null : undefined
    },
    create: {
      githubInstallationId: BigInt(data.githubInstallationId),
      accountLogin: "unknown",
      accountType: null,
      targetType: null
    }
  });

  if (data.action === "deleted" || data.action === "suspend") {
    await prisma.repository.updateMany({
      where: { installationId: installation.id },
      data: {
        connectionStatus: data.action === "deleted" ? "INSTALLATION_REVOKED" : "SUSPENDED",
        disconnectedAt: new Date()
      }
    });
    return;
  }

  const octokit = await createInstallationOctokit(data.githubInstallationId);
  const repos = await listInstallationRepositories(octokit);
  const activeIds = repos.map((repo) => repo.id);

  for (const repo of repos) {
    const repository = await prisma.repository.upsert({
      where: { githubRepositoryId: repo.id },
      update: {
        installationId: installation.id,
        owner: repo.owner,
        name: repo.name,
        fullName: repo.fullName,
        htmlUrl: repo.htmlUrl,
        defaultBranch: repo.defaultBranch,
        isPrivate: repo.isPrivate,
        connectionStatus: "CONNECTED",
        disconnectedAt: null,
        syncedAt: new Date()
      },
      create: {
        githubRepositoryId: repo.id,
        installationId: installation.id,
        owner: repo.owner,
        name: repo.name,
        fullName: repo.fullName,
        htmlUrl: repo.htmlUrl,
        defaultBranch: repo.defaultBranch,
        isPrivate: repo.isPrivate,
        connectionStatus: "CONNECTED",
        syncedAt: new Date()
      }
    });
    await getOrCreateRepositorySettings(repository.id);
  }

  await prisma.repository.updateMany({
    where: {
      installationId: installation.id,
      githubRepositoryId: { notIn: activeIds }
    },
    data: {
      connectionStatus: "DISCONNECTED",
      disconnectedAt: new Date()
    }
  });

  await prisma.queueTask.updateMany({
    where: { queueName: job.queueName, jobId: String(job.id) },
    data: { status: "completed", attemptsMade: job.attemptsMade }
  });
}
