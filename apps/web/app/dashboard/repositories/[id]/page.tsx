import Link from "next/link";
import { getRepositoryForUser, getOrCreateRepositorySettings, prisma } from "@pr-guard/db";
import { getRuntimeEnv } from "@pr-guard/shared";
import { Badge, formatDate } from "@/components/badges";
import { requireUser } from "@/lib/session";

export default async function RepositoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  await getRepositoryForUser(id, user.id);
  const env = getRuntimeEnv();
  const repository = await prisma.repository.findUniqueOrThrow({
    where: { id },
    include: {
      settings: true,
      analyses: {
        orderBy: { createdAt: "desc" },
        take: 8,
        include: { pullRequest: true }
      },
      _count: { select: { analyses: true, pullRequests: true } }
    }
  });
  const settings =
    repository.settings ?? (await getOrCreateRepositorySettings(id, { aiProvider: env.DEFAULT_AI_PROVIDER }));

  return (
    <div className="stack">
      <div className="page-heading">
        <div>
          <h2>{repository.fullName}</h2>
          <p className="muted">
            {repository.isPrivate ? "Private" : "Public"} repository · synced {formatDate(repository.syncedAt)}
          </p>
        </div>
        <div className="actions" style={{ marginTop: 0 }}>
          <a className="button secondary" href={repository.htmlUrl} target="_blank" rel="noreferrer">
            Open on GitHub
          </a>
          <Link className="button secondary" href={`/dashboard/repositories/${id}/settings`}>
            Settings
          </Link>
          <Link className="button" href={`/dashboard/repositories/${id}/analyses`}>
            Analyses
          </Link>
        </div>
      </div>

      <div className="grid">
        <div className="card stack">
          <h3>Connection</h3>
          <div className="badges">
            <Badge value={repository.connectionStatus} />
            <span className="badge">{repository._count.pullRequests} pull requests</span>
            <span className="badge">{repository._count.analyses} analyses</span>
          </div>
        </div>
        <div className="card stack">
          <h3>Reviewers</h3>
          <div className="badges">
            {settings.qualityEnabled ? <span className="badge">QUALITY</span> : null}
            {settings.securityEnabled ? <span className="badge">SECURITY</span> : null}
            {settings.architectureEnabled ? <span className="badge">ARCHITECTURE</span> : null}
          </div>
          <p className="muted">
            Provider {settings.aiProvider}; threshold {settings.minimumSeverity}
          </p>
        </div>
      </div>

      <section className="stack">
        <div className="row">
          <h3>Recent analyses</h3>
          <Link className="button secondary" href={`/dashboard/repositories/${id}/analyses`}>
            View all
          </Link>
        </div>
        {repository.analyses.length === 0 ? (
          <div className="empty">Open or update a pull request to start the first analysis.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>PR</th>
                <th>Status</th>
                <th>Severity</th>
                <th>Findings</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {repository.analyses.map((analysis) => (
                <tr key={analysis.id}>
                  <td>
                    <Link href={`/dashboard/analyses/${analysis.id}`}>
                      #{analysis.pullRequest.number} {analysis.pullRequest.title}
                    </Link>
                  </td>
                  <td>
                    <Badge value={analysis.status} />
                  </td>
                  <td>
                    <Badge value={analysis.overallSeverity} />
                  </td>
                  <td>{analysis.surfacedFindings} surfaced</td>
                  <td>{formatDate(analysis.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
