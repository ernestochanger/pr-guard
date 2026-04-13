"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function RealtimeBridge() {
  const router = useRouter();
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState("waiting");
  const [, startTransition] = useTransition();

  useEffect(() => {
    const source = new EventSource("/api/realtime");
    source.addEventListener("ready", () => {
      setConnected(true);
      setLastEvent("connected");
    });
    source.addEventListener("heartbeat", () => {
      setConnected(true);
    });

    const refreshEvents = [
      "repository.updated",
      "webhook.received",
      "analysis.created",
      "analysis.updated",
      "findings.updated",
      "comment.updated",
      "rerun.updated"
    ];
    for (const eventName of refreshEvents) {
      source.addEventListener(eventName, () => {
        setLastEvent(eventName);
        startTransition(() => router.refresh());
      });
    }

    source.onerror = () => {
      setConnected(false);
    };

    return () => source.close();
  }, [router]);

  return (
    <span className="activity" title={`Last event: ${lastEvent}`}>
      <span className="activity-dot" style={{ background: connected ? "#067647" : "#b42318" }} />
      Realtime {connected ? "live" : "reconnecting"}
    </span>
  );
}
