import { getRepositoryForUser, prisma } from "@pr-guard/db";
import { analysisListFiltersSchema } from "@pr-guard/shared";
import { ok, fail } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { serializeForJson } from "@/lib/serialize";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    await getRepositoryForUser(id, user.id);

    const url = new URL(request.url);
    const filters = analysisListFiltersSchema.parse({
      severity: url.searchParams.get("severity") || undefined,
      category: url.searchParams.get("category") || undefined,
      status: url.searchParams.get("status") || undefined,
      reviewerType: url.searchParams.get("reviewerType") || undefined
    });

    const analyses = await prisma.pullRequestAnalysis.findMany({
      where: {
        repositoryId: id,
        status: filters.status,
        findings:
          filters.severity || filters.category || filters.reviewerType
            ? {
                some: {
                  severity: filters.severity,
                  category: filters.category,
                  reviewerType: filters.reviewerType
                }
              }
            : undefined
      },
      include: {
        pullRequest: true,
        publishedComment: true,
        _count: {
          select: { findings: true, attempts: true }
        }
      },
      orderBy: { createdAt: "desc" },
      take: 100
    });

    return ok(serializeForJson({ analyses }));
  } catch (error) {
    return fail(error);
  }
}
