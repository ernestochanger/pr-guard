"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function DisconnectRepositoryButton({ repositoryId }: { repositoryId: string }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [pending, startTransition] = useTransition();

  async function disconnect() {
    setMessage(null);
    setIsError(false);
    const confirmed = window.confirm(
      "This stops PR Guard from analyzing new pull requests for this repository. It does not remove GitHub App access."
    );
    if (!confirmed) {
      return;
    }

    const response = await fetch(`/api/repositories/${repositoryId}/disconnect`, {
      method: "POST"
    });
    const body = (await response.json().catch(() => null)) as
      | { data?: { connectionStatus?: string }; error?: string }
      | null;

    if (!response.ok) {
      setIsError(true);
      setMessage(body?.error ?? "Repository could not be disconnected.");
      return;
    }

    setMessage(
      body?.data?.connectionStatus === "DISCONNECTED" ? "Repository disconnected." : "Repository is already inactive."
    );
    startTransition(() => router.refresh());
  }

  return (
    <div className="inline-action">
      <button className="secondary" disabled={pending} onClick={() => void disconnect()}>
        Disconnect
      </button>
      {message ? <span className={isError ? "inline-error" : "inline-status"}>{message}</span> : null}
    </div>
  );
}
