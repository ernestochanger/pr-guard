import { emitRealtimeEvent, getRepositoryForUser, prisma } from "@pr-guard/db";
import { ok, fail } from "@/lib/api";
import { assertSameOrigin } from "@/lib/csrf";
import { rateLimit } from "@/lib/rate-limit";
import { requireUser } from "@/lib/session";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    assertSameOrigin(request);
    const { id } = await params;
    rateLimit(`repository-disconnect:${user.id}:${id}`, 20, 60_000);

    const repository = await getRepositoryForUser(id, user.id, { requireAdmin: true });
    if (repository.connectionStatus !== "CONNECTED") {
      return ok({ repositoryId: repository.id, connectionStatus: repository.connectionStatus });
    }

    const updated = await prisma.repository.update({
      where: { id: repository.id },
      data: {
        connectionStatus: "DISCONNECTED",
        disconnectedAt: new Date()
      }
    });

    await emitRealtimeEvent({
      type: "repository.updated",
      repositoryId: updated.id,
      userId: user.id,
      payload: {
        connectionStatus: updated.connectionStatus,
        previousConnectionStatus: repository.connectionStatus
      }
    });

    return ok({ repositoryId: updated.id, connectionStatus: updated.connectionStatus });
  } catch (error) {
    return fail(error);
  }
}
