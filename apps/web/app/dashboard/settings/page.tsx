import { assertUserCanManageAppSettings, getOrCreateAppSettings } from "@pr-guard/db";
import { AppSettingsForm } from "@/components/app-settings-form";
import { requireUser } from "@/lib/session";

export default async function DashboardSettingsPage() {
  const user = await requireUser();
  await assertUserCanManageAppSettings(user.id);
  const settings = await getOrCreateAppSettings();

  return (
    <div className="stack">
      <div className="page-heading">
        <div>
          <h2>Settings</h2>
          <p className="muted">Choose the default AI provider for newly detected pull requests.</p>
        </div>
      </div>
      <AppSettingsForm initialProvider={settings.defaultAiProvider} />
    </div>
  );
}
