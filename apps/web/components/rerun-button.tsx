"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function RerunButton({ analysisId }: { analysisId: string }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function rerun() {
    setMessage(null);
    const response = await fetch(`/api/analyses/${analysisId}/rerun`, {
      method: "POST"
    });
    const body = (await response.json().catch(() => null)) as
      | { data?: { analysisId?: string; queued?: boolean }; error?: string }
      | null;
    if (!response.ok) {
      setMessage(body?.error ?? "Rerun could not be queued.");
      return;
    }
    setMessage(body?.data?.queued ? "Rerun queued." : "A run is already active for this head SHA.");
    startTransition(() => router.refresh());
  }

  return (
    <div className="stack">
      <button disabled={pending} onClick={() => void rerun()}>
        Rerun analysis
      </button>
      {message ? <p className="muted">{message}</p> : null}
    </div>
  );
}
