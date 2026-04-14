"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Severity } from "@pr-guard/shared";

type Settings = {
  qualityEnabled: boolean;
  securityEnabled: boolean;
  architectureEnabled: boolean;
  minimumSeverity: Severity;
};

export function SettingsForm({ repositoryId, initialSettings }: { repositoryId: string; initialSettings: Settings }) {
  const router = useRouter();
  const [settings, setSettings] = useState(initialSettings);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  async function save() {
    setMessage(null);
    const response = await fetch(`/api/repositories/${repositoryId}/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings)
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setMessage(body?.error ?? "Settings could not be saved.");
      return;
    }
    setMessage("Settings saved. Future analyses will use these values.");
    startTransition(() => router.refresh());
  }

  return (
    <div className="card">
      <div className="form">
        <div className="field">
          <h3>AI reviewers</h3>
          <label className="check-row">
            <input
              type="checkbox"
              checked={settings.qualityEnabled}
              onChange={(event) => update("qualityEnabled", event.target.checked)}
            />
            Quality reviewer
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={settings.securityEnabled}
              onChange={(event) => update("securityEnabled", event.target.checked)}
            />
            Security reviewer
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={settings.architectureEnabled}
              onChange={(event) => update("architectureEnabled", event.target.checked)}
            />
            Architecture reviewer
          </label>
        </div>

        <div className="field">
          <label htmlFor="minimumSeverity">Minimum severity threshold</label>
          <select
            id="minimumSeverity"
            value={settings.minimumSeverity}
            onChange={(event) => update("minimumSeverity", event.target.value as Severity)}
          >
            <option value="LOW">LOW</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="HIGH">HIGH</option>
          </select>
        </div>

        {message ? <p className="muted">{message}</p> : null}
        <button disabled={pending} onClick={() => void save()}>
          Save settings
        </button>
      </div>
    </div>
  );
}
