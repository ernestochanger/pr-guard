import Link from "next/link";
import { getRepositoryForUser, prisma } from "@pr-guard/db";
import { analysisListFiltersSchema } from "@pr-guard/shared";
import { Badge, formatDate } from "@/components/badges";
import { requireUser } from "@/lib/session";

export default async function RepositoryAnalysesPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const query = await searchParams;
  const repository = await getRepositoryForUser(id, user.id);
  const filters = analysisListFiltersSchema.parse({
    severity: typeof query.severity === "string" ? query.severity : undefined,
    category: typeof query.category === "string" ? query.category : undefined,
    status: typeof query.status === "string" ? query.status : undefined,
    reviewerType: typeof query.reviewerType === "string" ? query.reviewerType : undefined
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
      publishedComment: true
    },
    orderBy: { createdAt: "desc" },
    take: 100
  });

  const filterLink = (key: string, value: string) => {
    const params = new URLSearchParams();
    params.set(key, value);
    return `/dashboard/repositories/${id}/analyses?${params.toString()}`;
  };

  return (
    <div className="stack">
      <div className="page-heading">
        <div>
          <h2>Analyses</h2>
          <p className="muted">{repository.fullName}</p>
        </div>
        <Link className="button secondary" href={`/dashboard/repositories/${id}`}>
          Back to repository
        </Link>
      </div>

      <div className="card compact row">
        <div className="badges">
          <Link className="badge" href={`/dashboard/repositories/${id}/analyses`}>
            All
          </Link>
          <Link className="badge HIGH" href={filterLink("severity", "HIGH")}>
            High
          </Link>
          <Link className="badge MEDIUM" href={filterLink("severity", "MEDIUM")}>
            Medium
          </Link>
          <Link className="badge LOW" href={filterLink("severity", "LOW")}>
            Low
          </Link>
          <Link className="badge RUNNING" href={filterLink("status", "RUNNING")}>
            Running
          </Link>
          <Link className="badge FAILED" href={filterLink("status", "FAILED")}>
            Failed
          </Link>
          <Link className="badge" href={filterLink("category", "SECURITY")}>
            Security
          </Link>
          <Link className="badge" href={filterLink("category", "QUALITY")}>
            Quality
          </Link>
          <Link className="badge" href={filterLink("category", "ARCHITECTURE")}>
            Architecture
          </Link>
          <Link className="badge" href={filterLink("reviewerType", "DETERMINISTIC")}>
            Deterministic
          </Link>
          <Link className="badge" href={filterLink("reviewerType", "SECURITY")}>
            AI security
          </Link>
        </div>
      </div>

      {analyses.length === 0 ? (
        <div className="empty">No analyses match the current filters.</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>PR</th>
              <th>Status</th>
              <th>Provider</th>
              <th>Severity</th>
              <th>Findings</th>
              <th>Comment</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {analyses.map((analysis) => (
              <tr key={analysis.id}>
                <td>
                  <Link href={`/dashboard/analyses/${analysis.id}`}>
                    #{analysis.pullRequest.number} {analysis.pullRequest.title}
                  </Link>
                  <p className="muted">{analysis.headSha.slice(0, 8)}</p>
                </td>
                <td>
                  <Badge value={analysis.status} />
                </td>
                <td>{analysis.aiProvider}</td>
                <td>
                  <Badge value={analysis.overallSeverity} />
                </td>
                <td>
                  {analysis.surfacedFindings}/{analysis.totalFindings}
                </td>
                <td>
                  <Badge value={analysis.publishedComment?.status} />
                </td>
                <td>{formatDate(analysis.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
