import { getOrCreateRepositorySettings, prisma } from "@pr-guard/db";
import { createInstallationOctokit, listInstallationRepositories } from "@pr-guard/github";
import { getRuntimeEnv, logger } from "@pr-guard/shared";

export type InstallationCallbackResult = {
  installationId: number;
  setupAction: string | null;
  repositoryCount: number;
  synced: boolean;
  error: string | null;
};

export async function handleInstallationCallback(input: {
  installationId: number;
  setupAction: string | null;
  userId?: string | null;
}): Promise<InstallationCallbackResult> {
  logger.info(
    {
      installationId: input.installationId,
      setupAction: input.setupAction,
      userId: input.userId ?? null
    },
    "GitHub App installation callback received"
  );

  try {
    const env = getRuntimeEnv();
    const octokit = await createInstallationOctokit(input.installationId);
    const repos = await listInstallationRepositories(octokit);
    const installation = await prisma.gitHubInstallation.upsert({
      where: { githubInstallationId: BigInt(input.installationId) },
      update: {},
      create: {
        githubInstallationId: BigInt(input.installationId),
        accountLogin: "unknown",
        accountType: null,
        targetType: null
      }
    });

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
      await getOrCreateRepositorySettings(repository.id, { aiProvider: env.DEFAULT_AI_PROVIDER });

      if (input.userId) {
        await prisma.repositoryMembership.upsert({
          where: {
            userId_repositoryId: {
              userId: input.userId,
              repositoryId: repository.id
            }
          },
          update: {
            role: "admin",
            canAdmin: true,
            lastSeenAt: new Date()
          },
          create: {
            userId: input.userId,
            repositoryId: repository.id,
            role: "admin",
            canAdmin: true
          }
        });
      }
    }

    logger.info(
      {
        installationId: input.installationId,
        repositoryCount: repos.length,
        userId: input.userId ?? null
      },
      "GitHub App installation callback synced repositories"
    );

    return {
      installationId: input.installationId,
      setupAction: input.setupAction,
      repositoryCount: repos.length,
      synced: true,
      error: null
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(
      {
        installationId: input.installationId,
        setupAction: input.setupAction,
        userId: input.userId ?? null,
        error: message
      },
      "GitHub App installation callback sync failed"
    );

    return {
      installationId: input.installationId,
      setupAction: input.setupAction,
      repositoryCount: 0,
      synced: false,
      error: message
    };
  }
}
