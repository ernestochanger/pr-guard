import Link from "next/link";
import { getAnalysisForUser } from "@pr-guard/db";
import { Badge, formatDate } from "@/components/badges";
import { RerunButton } from "@/components/rerun-button";
import { ReviewerRunCard } from "@/components/reviewer-run-card";
import { requireUser } from "@/lib/session";

export default async function AnalysisDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const analysis = await getAnalysisForUser(id, user.id);

  const grouped = analysis.findings.reduce<Record<string, typeof analysis.findings>>((acc, finding) => {
    const key = `${finding.severity} · ${finding.category} · ${finding.reviewerType}`;
    acc[key] = acc[key] ?? [];
    acc[key].push(finding);
    return acc;
  }, {});

  return (
    <div className="stack">
      <div className="page-heading">
        <div>
          <h2>PR #{analysis.pullRequest.number}</h2>
          <p className="muted">
            {analysis.repository.fullName} · {analysis.pullRequest.title}
          </p>
        </div>
        <div className="actions" style={{ marginTop: 0 }}>
          <a className="button secondary" href={analysis.pullRequest.htmlUrl} target="_blank" rel="noreferrer">
            Open PR
          </a>
          <Link className="button secondary" href={`/dashboard/repositories/${analysis.repositoryId}`}>
            Repository
          </Link>
          <RerunButton analysisId={analysis.id} />
        </div>
      </div>

      <div className="grid">
        <div className="card stack">
          <h3>Status</h3>
          <div className="badges">
            <Badge value={analysis.status} />
            <Badge value={analysis.overallSeverity} />
            <span className="badge">{analysis.aiProvider}</span>
            <span className="badge">{analysis.minimumSeverity}+ threshold</span>
          </div>
          <p className="muted">
            {analysis.surfacedFindings} surfaced findings from {analysis.totalFindings} stored findings.
          </p>
        </div>
        <div className="card stack">
          <h3>Diff scope</h3>
          <div className="badges">
            <span className="badge">{analysis.supportedFiles} supported files</span>
            <span className="badge">{analysis.ignoredFiles} ignored files</span>
            <span className="badge">{analysis.headSha.slice(0, 8)}</span>
          </div>
          <p className="muted">Created {formatDate(analysis.createdAt)}</p>
        </div>
      </div>

      <section className="card stack">
        <h3>Timeline</h3>
        <div className="timeline">
          <div className="timeline-item">
            <span className="muted">Queued</span>
            <span>{formatDate(analysis.createdAt)}</span>
          </div>
          <div className="timeline-item">
            <span className="muted">Started</span>
            <span>{formatDate(analysis.startedAt)}</span>
          </div>
          <div className="timeline-item">
            <span className="muted">Completed</span>
            <span>{formatDate(analysis.completedAt)}</span>
          </div>
          <div className="timeline-item">
            <span className="muted">Comment</span>
            <span>
              <Badge value={analysis.publishedComment?.status} />{" "}
              {formatDate(analysis.publishedComment?.lastPublishedAt)}
            </span>
          </div>
        </div>
      </section>

      <section className="stack">
        <h3>Reviewer runs</h3>
        <div className="grid reviewer-runs-grid">
          {analysis.attempts[0]?.reviewerRuns.map((run) => (
            <ReviewerRunCard
              key={run.id}
              reviewerType={run.reviewerType}
              status={run.status}
              summary={run.summary}
              error={run.error}
            />
          ))}
        </div>
      </section>

      <section className="stack">
        <h3>Findings</h3>
        {analysis.findings.length === 0 ? (
          <div className="empty">No findings were stored for this analysis.</div>
        ) : (
          Object.entries(grouped).map(([group, findings]) => (
            <div className="stack" key={group}>
              <h3>{group}</h3>
              {findings.map((finding) => (
                <div className={`card finding ${finding.severity}`} key={finding.id}>
                  <div className="row">
                    <div>
                      <h3>{finding.title}</h3>
                      <p className="muted">
                        {finding.filePath ?? "General"}
                        {finding.lineStart ? `:${finding.lineStart}` : ""}
                      </p>
                    </div>
                    <div className="badges">
                      <Badge value={finding.severity} />
                      {finding.surfaced ? <span className="badge">SURFACED</span> : null}
                    </div>
                  </div>
                  <p>{finding.explanation}</p>
                  <p className="muted">Confidence {Math.round(finding.confidence * 100)}%</p>
                </div>
              ))}
            </div>
          ))
        )}
      </section>
    </div>
  );
}
