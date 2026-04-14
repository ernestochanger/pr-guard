"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { AIProvider } from "@pr-guard/shared";

const providerOptions: Array<{ value: AIProvider; label: string }> = [
  { value: "OPENAI", label: "OpenAI" },
  { value: "GOOGLE", label: "Google AI" },
  { value: "CLAUDE", label: "Claude AI" }
];

export function AppSettingsForm({ initialProvider }: { initialProvider: AIProvider }) {
  const router = useRouter();
  const [defaultAiProvider, setDefaultAiProvider] = useState<AIProvider>(initialProvider);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function save() {
    setMessage(null);
    const response = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defaultAiProvider })
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setMessage(body?.error ?? "Settings could not be saved.");
      return;
    }

    setMessage("Default provider saved. Newly detected pull requests will use this provider.");
    startTransition(() => router.refresh());
  }

  return (
    <div className="card">
      <div className="form">
        <div className="field">
          <label htmlFor="defaultAiProvider">Default AI provider</label>
          <select
            id="defaultAiProvider"
            value={defaultAiProvider}
            onChange={(event) => setDefaultAiProvider(event.target.value as AIProvider)}
          >
            {providerOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <p className="muted">New pull requests inherit this provider. Existing pull requests stay unchanged.</p>
        </div>

        {message ? <p className="muted">{message}</p> : null}
        <button disabled={pending} onClick={() => void save()}>
          Save default provider
        </button>
      </div>
    </div>
  );
}
