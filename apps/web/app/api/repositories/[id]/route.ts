import { getRepositoryForUser, getOrCreateRepositorySettings, prisma } from "@pr-guard/db";
import { getRuntimeEnv } from "@pr-guard/shared";
import { ok, fail } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { serializeForJson } from "@/lib/serialize";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    await getRepositoryForUser(id, user.id);
    const env = getRuntimeEnv();
    const repository = await prisma.repository.findUniqueOrThrow({
      where: { id },
      include: {
        settings: true,
        installation: true,
        _count: {
          select: {
            pullRequests: true,
            analyses: true,
            memberships: true
          }
        }
      }
    });
    const settings =
      repository.settings ?? (await getOrCreateRepositorySettings(id, { aiProvider: env.DEFAULT_AI_PROVIDER }));

    return ok(
      serializeForJson({
        repository: {
          ...repository,
          settings
        }
      })
    );
  } catch (error) {
    return fail(error);
  }
}
