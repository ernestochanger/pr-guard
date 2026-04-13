import { prisma } from "@pr-guard/db";
import { getRuntimeEnv } from "@pr-guard/shared";
import { ok, fail } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { syncUserRepositoryMemberships } from "@/lib/github-memberships";
import { serializeForJson } from "@/lib/serialize";

export async function GET() {
  try {
    const user = await requireUser();
    await syncUserRepositoryMemberships(user.id);
    const env = getRuntimeEnv();

    const repositories = await prisma.repositoryMembership.findMany({
      where: { userId: user.id },
      include: {
        repository: {
          include: {
            settings: true,
            _count: {
              select: {
                pullRequests: true,
                analyses: true
              }
            }
          }
        }
      },
      orderBy: { lastSeenAt: "desc" }
    });

    return ok(
      serializeForJson({
        installUrl: `https://github.com/apps/${env.GITHUB_APP_NAME}/installations/new`,
        repositories: repositories.map((membership) => ({
          id: membership.repository.id,
          fullName: membership.repository.fullName,
          htmlUrl: membership.repository.htmlUrl,
          isPrivate: membership.repository.isPrivate,
          connectionStatus: membership.repository.connectionStatus,
          canAdmin: membership.canAdmin,
          role: membership.role,
          settings: membership.repository.settings,
          counts: membership.repository._count,
          updatedAt: membership.repository.updatedAt
        }))
      })
    );
  } catch (error) {
    return fail(error);
  }
}
