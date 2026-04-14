import { emitRealtimeEvent, prisma } from "@pr-guard/db";
import { ok, fail } from "@/lib/api";
import { assertSameOrigin } from "@/lib/csrf";
import { rateLimit } from "@/lib/rate-limit";
import { requireUser } from "@/lib/session";

type DisconnectRepositoriesBody = {
  repositoryIds?: unknown;
};

function parseRepositoryIds(body: DisconnectRepositoriesBody): string[] {
  if (!Array.isArray(body.repositoryIds)) {
    return [];
  }

  return [...new Set(body.repositoryIds.filter((id): id is string => typeof id === "string" && id.length > 0))];
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    assertSameOrigin(request);
    rateLimit(`repositories-disconnect:${user.id}`, 10, 60_000);

    const body = (await request.json().catch(() => ({}))) as DisconnectRepositoriesBody;
    const repositoryIds = parseRepositoryIds(body);
    if (repositoryIds.length === 0) {
      return ok({ repositoryIds: [], disconnectedCount: 0 });
    }

    const memberships = await prisma.repositoryMembership.findMany({
      where: {
        userId: user.id,
        canAdmin: true,
        repositoryId: { in: repositoryIds },
        repository: { connectionStatus: "CONNECTED" }
      },
      select: { repositoryId: true }
    });
    const adminRepositoryIds = memberships.map((membership) => membership.repositoryId);

    if (adminRepositoryIds.length === 0) {
      return ok({ repositoryIds: [], disconnectedCount: 0 });
    }

    const result = await prisma.repository.updateMany({
      where: {
        id: { in: adminRepositoryIds },
        connectionStatus: "CONNECTED"
      },
      data: {
        connectionStatus: "DISCONNECTED",
        disconnectedAt: new Date()
      }
    });

    await Promise.all(
      adminRepositoryIds.map((repositoryId) =>
        emitRealtimeEvent({
          type: "repository.updated",
          repositoryId,
          userId: user.id,
          payload: {
            connectionStatus: "DISCONNECTED",
            previousConnectionStatus: "CONNECTED"
          }
        })
      )
    );

    return ok({ repositoryIds: adminRepositoryIds, disconnectedCount: result.count });
  } catch (error) {
    return fail(error);
  }
}
