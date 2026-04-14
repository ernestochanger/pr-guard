import { prisma } from "@pr-guard/db";
import { listUserRepositoriesWithPermissions } from "@pr-guard/github";
import { logger } from "@pr-guard/shared";

function getGitHubErrorStatus(error: unknown): number | null {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status?: unknown }).status;
    return typeof status === "number" ? status : null;
  }
  return null;
}

function getGitHubErrorMessage(error: unknown): string | null {
  if (error && typeof error === "object" && "response" in error) {
    const response = (error as { response?: { data?: { message?: unknown } } }).response;
    const message = response?.data?.message;
    return typeof message === "string" ? message : null;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return null;
}

export async function syncUserRepositoryMemberships(userId: string): Promise<void> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "github" },
    select: { id: true, access_token: true }
  });

  if (!account?.access_token) {
    return;
  }

  try {
    const userRepos = await listUserRepositoriesWithPermissions(account.access_token);
    if (userRepos.length === 0) {
      return;
    }

    const installed = await prisma.repository.findMany({
      where: {
        githubRepositoryId: {
          in: userRepos.map((repo) => repo.id)
        }
      },
      select: {
        id: true,
        githubRepositoryId: true
      }
    });
    const repoByGithubId = new Map(userRepos.map((repo) => [repo.id.toString(), repo]));

    await Promise.all(
      installed.map((repository) => {
        const userRepo = repoByGithubId.get(repository.githubRepositoryId.toString());
        if (!userRepo) {
          return null;
        }
        return prisma.repositoryMembership.upsert({
          where: {
            userId_repositoryId: {
              userId,
              repositoryId: repository.id
            }
          },
          update: {
            role: userRepo.role,
            canAdmin: userRepo.canAdmin,
            lastSeenAt: new Date()
          },
          create: {
            userId,
            repositoryId: repository.id,
            role: userRepo.role,
            canAdmin: userRepo.canAdmin
          }
        });
      })
    );
  } catch (error) {
    const status = getGitHubErrorStatus(error);
    if (status === 401) {
      await prisma.account.update({
        where: { id: account.id },
        data: { access_token: null }
      });
      logger.warn(
        {
          userId,
          status,
          githubMessage: getGitHubErrorMessage(error)
        },
        "GitHub OAuth token rejected during repository sync; user must sign in again"
      );
      return;
    }

    logger.warn(
      {
        userId,
        status,
        githubMessage: getGitHubErrorMessage(error)
      },
      "Failed to sync GitHub repository memberships"
    );
  }
}
