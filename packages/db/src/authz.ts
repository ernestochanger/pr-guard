import type { Repository } from "@prisma/client";
import { ForbiddenError, NotFoundError } from "@pr-guard/shared";
import { prisma } from "./client";

export async function assertUserCanManageAppSettings(userId: string): Promise<void> {
  const adminMembership = await prisma.repositoryMembership.findFirst({
    where: {
      userId,
      canAdmin: true,
      repository: {
        connectionStatus: "CONNECTED"
      }
    },
    select: { id: true }
  });

  if (!adminMembership) {
    throw new ForbiddenError("Admin access to at least one connected repository is required.");
  }
}

export async function getRepositoryForUser(
  repositoryId: string,
  userId: string,
  options: { requireAdmin?: boolean } = {}
): Promise<Repository> {
  const membership = await prisma.repositoryMembership.findUnique({
    where: {
      userId_repositoryId: {
        userId,
        repositoryId
      }
    },
    include: {
      repository: true
    }
  });

  if (!membership) {
    throw new NotFoundError("Repository not found.");
  }

  if (options.requireAdmin && !membership.canAdmin) {
    throw new ForbiddenError("Admin access is required for this repository.");
  }

  return membership.repository;
}

export async function getAnalysisForUser(analysisId: string, userId: string) {
  const analysis = await prisma.pullRequestAnalysis.findUnique({
    where: { id: analysisId },
    include: {
      repository: true,
      pullRequest: true,
      attempts: {
        orderBy: { attemptNumber: "desc" },
        include: {
          reviewerRuns: true
        }
      },
      findings: {
        orderBy: [{ severity: "desc" }, { confidence: "desc" }]
      },
      publishedComment: true
    }
  });

  if (!analysis) {
    throw new NotFoundError("Analysis not found.");
  }

  await getRepositoryForUser(analysis.repositoryId, userId);
  return analysis;
}
