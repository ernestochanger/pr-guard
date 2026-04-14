import Link from "next/link";
import { prisma } from "@pr-guard/db";
import { getRuntimeEnv } from "@pr-guard/shared";
import { Badge, formatDate } from "@/components/badges";
import { requireUser } from "@/lib/session";
import { syncUserRepositoryMemberships } from "@/lib/github-memberships";

export default async function RepositoriesPage() {
  const user = await requireUser();
  await syncUserRepositoryMemberships(user.id);
  const env = getRuntimeEnv();
  const memberships = await prisma.repositoryMembership.findMany({
    where: { userId: user.id },
    include: {
      repository: {
        include: {
          settings: true,
          analyses: {
            orderBy: { createdAt: "desc" },
            take: 1,
            include: { pullRequest: true }
          },
          _count: {
            select: { analyses: true }
          }
        }
      }
    },
    orderBy: { lastSeenAt: "desc" }
  });

  return (
    <div className="stack">
      <div className="page-heading">
        <div>
          <h2>Repositories</h2>
          <p className="muted">Installed GitHub App repositories visible to your GitHub account.</p>
        </div>
        <a
          className="button"
          href={`https://github.com/apps/${env.GITHUB_APP_NAME}/installations/new`}
          target="_blank"
          rel="noreferrer"
        >
          Install GitHub App
        </a>
      </div>

      {memberships.length === 0 ? (
        <div className="empty">
          <div>
            <h3>No connected repositories yet</h3>
            <p>Install the GitHub App, then refresh this page after GitHub sends the webhook.</p>
          </div>
        </div>
      ) : (
        <div className="grid">
          {memberships.map(({ repository, canAdmin, role }) => {
            const latest = repository.analyses[0];
            return (
              <Link className="card stack" key={repository.id} href={`/dashboard/repositories/${repository.id}`}>
                <div className="row">
                  <div>
                    <h3>{repository.fullName}</h3>
                    <p className="muted">{repository.isPrivate ? "Private" : "Public"} repository</p>
                  </div>
                  <Badge value={repository.connectionStatus} />
                </div>
                <div className="badges">
                  <span className="badge">{role}</span>
                  {canAdmin ? <span className="badge">ADMIN</span> : null}
                  <span className="badge">{repository._count.analyses} analyses</span>
                </div>
                <p className="muted">
                  Latest:{" "}
                  {latest
                    ? `#${latest.pullRequest.number} ${latest.status} at ${formatDate(latest.createdAt)}`
                    : "No PR analyses yet"}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
