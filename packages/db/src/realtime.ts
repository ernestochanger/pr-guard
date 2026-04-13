import type { Prisma } from "@prisma/client";
import type { RealtimeEventType } from "@pr-guard/shared";
import { prisma } from "./client";

export async function emitRealtimeEvent(input: {
  type: RealtimeEventType;
  repositoryId?: string | null;
  analysisId?: string | null;
  userId?: string | null;
  payload?: Prisma.InputJsonValue;
}) {
  return prisma.realtimeEvent.create({
    data: {
      type: input.type,
      repositoryId: input.repositoryId ?? null,
      analysisId: input.analysisId ?? null,
      userId: input.userId ?? null,
      payload: input.payload ?? {}
    }
  });
}

export async function listRealtimeEventsForUser(input: {
  userId: string;
  afterId?: string;
  limit?: number;
}) {
  const memberships = await prisma.repositoryMembership.findMany({
    where: { userId: input.userId },
    select: { repositoryId: true }
  });
  const repositoryIds = memberships.map((membership) => membership.repositoryId);

  return prisma.realtimeEvent.findMany({
    where: {
      AND: [
        input.afterId
          ? {
              id: {
                gt: input.afterId
              }
            }
          : {},
        {
          OR: [
            { userId: input.userId },
            { repositoryId: { in: repositoryIds } },
            { userId: null, repositoryId: null }
          ]
        }
      ]
    },
    orderBy: { createdAt: "asc" },
    take: input.limit ?? 50
  });
}
