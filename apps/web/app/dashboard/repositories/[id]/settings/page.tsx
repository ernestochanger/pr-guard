import Link from "next/link";
import { getRepositoryForUser, getOrCreateRepositorySettings, prisma } from "@pr-guard/db";
import { getRuntimeEnv } from "@pr-guard/shared";
import { SettingsForm } from "@/components/settings-form";
import { requireUser } from "@/lib/session";

export default async function RepositorySettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  await getRepositoryForUser(id, user.id, { requireAdmin: true });
  const env = getRuntimeEnv();
  const repository = await prisma.repository.findUniqueOrThrow({
    where: { id },
    include: { settings: true }
  });
  const settings =
    repository.settings ?? (await getOrCreateRepositorySettings(id, { aiProvider: env.DEFAULT_AI_PROVIDER }));

  return (
    <div className="stack">
      <div className="page-heading">
        <div>
          <h2>Settings</h2>
          <p className="muted">{repository.fullName}</p>
        </div>
        <Link className="button secondary" href={`/dashboard/repositories/${id}`}>
          Back to repository
        </Link>
      </div>
      <SettingsForm
        repositoryId={id}
        initialSettings={{
          qualityEnabled: settings.qualityEnabled,
          securityEnabled: settings.securityEnabled,
          architectureEnabled: settings.architectureEnabled,
          minimumSeverity: settings.minimumSeverity,
          aiProvider: settings.aiProvider
        }}
      />
    </div>
  );
}
