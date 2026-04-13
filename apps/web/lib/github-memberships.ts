import { prisma } from "@pr-guard/db";
import { listUserRepositoriesWithPermissions } from "@pr-guard/github";
import { logger } from "@pr-guard/shared";

export async function syncUserRepositoryMemberships(userId: string): Promise<void> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "github" },
    select: { access_token: true }
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
    logger.warn({ error, userId }, "Failed to sync GitHub repository memberships");
  }
}
