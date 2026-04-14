"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type CommentResponse =
  | { data?: { commentId?: string; htmlUrl?: string }; error?: string }
  | null;

export function ManualPrCommentForm({ analysisId }: { analysisId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [commentUrl, setCommentUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pending, startTransition] = useTransition();
  const trimmedBody = body.trim();

  async function submit() {
    if (!trimmedBody || submitting) {
      return;
    }

    setMessage(null);
    setCommentUrl(null);
    setSubmitting(true);

    try {
      const response = await fetch(`/api/analyses/${analysisId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: trimmedBody })
      });
      const result = (await response.json().catch(() => null)) as CommentResponse;

      if (!response.ok) {
        setMessage(result?.error ?? "Comment could not be sent.");
        return;
      }

      setBody("");
      setCommentUrl(result?.data?.htmlUrl ?? null);
      setMessage("Comment sent to the PR.");
      startTransition(() => router.refresh());
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="card">
      <div className="form">
        <div className="field">
          <h3>Manual PR comment</h3>
          <p className="muted">Send a new comment to this pull request. The PR Guard summary stays unchanged.</p>
          <textarea
            id="manual-pr-comment"
            value={body}
            maxLength={65_000}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Write the comment to post on GitHub..."
            rows={7}
          />
        </div>

        <div className="inline-action">
          <button disabled={submitting || pending || !trimmedBody} onClick={() => void submit()}>
            {submitting ? "Sending..." : "Send PR comment"}
          </button>
          {message ? (
            <span className={commentUrl ? "muted" : "inline-error"}>
              {message}{" "}
              {commentUrl ? (
                <a className="text-link" href={commentUrl} target="_blank" rel="noreferrer">
                  View on GitHub
                </a>
              ) : null}
            </span>
          ) : null}
        </div>
      </div>
    </section>
  );
}
